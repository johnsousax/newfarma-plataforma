import 'server-only';
import crypto from 'node:crypto';
import { db } from '../db';
import { ErroNegocio } from '../erros';
import { auditar } from '../auditoria';
import { configuracoes } from '../configuracoes';
import { decifrar } from '../cripto';
import { chaveAcesso } from './chave';
import { PROVEDORES, type ResultadoEmissao } from './provedores';
import { FARMACIA } from '@/lib/farmacia';

const reais = (c: number) => (c / 100).toFixed(2);
// Meios de pagamento da NF-e (tPag)
const TPAG: Record<string, string> = { DINHEIRO: '01', CARTAO_CREDITO: '03', CARTAO_DEBITO: '04', PIX: '17' };
const CRT: Record<string, number> = { simples_nacional: 1, simples_excesso: 2, normal: 3 };

/** Pendências que impedem emitir nota (dados do emitente e produtos sem NCM). */
export async function pendenciasFiscais() {
  const { fiscal } = await configuracoes();
  const loja = await db.loja.findFirst({ where: { ativa: true, centroDistribuicao: false }, orderBy: { criadoEm: 'asc' } });
  const semNcm = await db.produto.count({ where: { ativo: true, OR: [{ ncm: null }, { cfop: null }] } });
  const p: string[] = [];
  if (!loja || loja.cnpj.replace(/\D/g, '').length !== 14) p.push('CNPJ da loja');
  if (!fiscal.inscricaoEstadual) p.push('Inscrição estadual');
  if (!fiscal.cscId) p.push('ID do CSC (código de segurança do contribuinte, gerado no portal da SEFAZ)');
  if (semNcm) p.push(`${semNcm} produto(s) ativo(s) sem NCM ou CFOP`);
  return { pendencias: p, semNcm };
}

/** Monta, valida e registra a NFC-e (modelo 65) de um pedido pago; transmite pelo provedor configurado. */
export async function gerarNfce(pedidoId: string, usuarioId: string | null) {
  const { fiscal } = await configuracoes();
  const pedido = await db.pedido.findUnique({
    where: { id: pedidoId },
    include: { itens: { include: { produto: { select: { ean: true, ncm: true, cest: true, cfop: true, cstIcms: true, origemFiscal: true, unidade: true } } } }, loja: true, notas: { where: { status: { not: 'CANCELADA' } } } },
  });
  if (!pedido) throw new ErroNegocio('Pedido não encontrado.', 404);
  if (pedido.notas.length) throw new ErroNegocio('Este pedido já tem nota fiscal.');
  if (['AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO', 'CANCELADO'].includes(pedido.status)) throw new ErroNegocio('Só é possível emitir nota de pedido pago.');
  const semNcm = pedido.itens.filter((i) => !i.produto.ncm || !i.produto.cfop);
  if (semNcm.length) throw new ErroNegocio(`Cadastre NCM e CFOP em: ${semNcm.map((i) => i.nome).join(', ')}.`);
  const cnpj = pedido.loja.cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) throw new ErroNegocio('CNPJ da loja inválido. Confira em Painel › Loja.');
  if (!fiscal.inscricaoEstadual) throw new ErroNegocio('Informe a inscrição estadual em Configurações › Fiscal.');

  const emissao = new Date();
  const cpf = pedido.cpfNaNota ? (decifrar(pedido.cpfNaNota) ?? pedido.cpfNaNota).replace(/\D/g, '') : null;
  const descontoTotal = pedido.descontoPromocoes + pedido.descontoCupom;
  // Rateia o desconto do cupom proporcionalmente entre os itens
  const brutoItens = pedido.itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0);
  let restante = descontoTotal;
  const det = pedido.itens.map((i, n) => {
    const bruto = i.precoUnitario * i.quantidade;
    const desc = n === pedido.itens.length - 1 ? restante : Math.round((descontoTotal * bruto) / (brutoItens || 1));
    restante -= desc;
    const simples = CRT[fiscal.regime] !== 3;
    return {
      nItem: n + 1,
      prod: {
        cProd: i.sku, cEAN: i.produto.ean || 'SEM GTIN', xProd: i.nome.slice(0, 120), NCM: i.produto.ncm, CEST: i.produto.cest || undefined, CFOP: i.produto.cfop,
        uCom: i.produto.unidade, qCom: i.quantidade.toFixed(4), vUnCom: reais(i.precoUnitario), vProd: reais(bruto), cEANTrib: i.produto.ean || 'SEM GTIN',
        uTrib: i.produto.unidade, qTrib: i.quantidade.toFixed(4), vUnTrib: reais(i.precoUnitario), vDesc: desc ? reais(desc) : undefined, indTot: 1,
      },
      imposto: {
        ICMS: simples ? { orig: i.produto.origemFiscal, CSOSN: i.produto.cstIcms || '500' } : { orig: i.produto.origemFiscal, CST: i.produto.cstIcms || '60' },
        PIS: { CST: '49' }, COFINS: { CST: '49' },
      },
    };
  });

  const serie = fiscal.serieNfce;
  const ultimo = await db.notaFiscal.aggregate({ where: { modelo: 'NFCE', serie, ambiente: fiscal.ambiente }, _max: { numero: true } });
  const numero = Math.max(fiscal.proximoNumeroNfce, (ultimo._max.numero ?? 0) + 1);
  const codigo = crypto.randomInt(10_000_000, 99_999_999);
  const chave = chaveAcesso({ uf: pedido.loja.uf, emissao, cnpj, modelo: '65', serie, numero, codigo });

  const documento = {
    versao: '4.00', chave,
    ide: { cUF: chave.slice(0, 2), cNF: String(codigo), natOp: 'VENDA AO CONSUMIDOR', mod: 65, serie, nNF: numero, dhEmi: emissao.toISOString(), tpNF: 1, idDest: 1, tpImp: 4, tpEmis: 1, tpAmb: fiscal.ambiente === 'producao' ? 1 : 2, finNFe: 1, indFinal: 1, indPres: pedido.canal === 'PDV' ? 1 : 4, procEmi: 0 },
    emit: {
      CNPJ: cnpj, xNome: FARMACIA.razaoSocial, xFant: FARMACIA.nome, IE: fiscal.inscricaoEstadual.replace(/\D/g, ''), IM: fiscal.inscricaoMunicipal || undefined, CRT: CRT[fiscal.regime],
      enderEmit: { xLgr: pedido.loja.logradouro, nro: pedido.loja.numero, xBairro: pedido.loja.bairro, xMun: pedido.loja.cidade, UF: pedido.loja.uf, CEP: pedido.loja.cep.replace(/\D/g, '') },
    },
    dest: cpf ? { CPF: cpf, indIEDest: 9 } : undefined,
    det,
    total: { ICMSTot: { vProd: reais(brutoItens), vDesc: reais(descontoTotal), vFrete: reais(pedido.frete), vNF: reais(pedido.total) } },
    transp: { modFrete: pedido.modalidade === 'RETIRADA' || pedido.modalidade === 'BALCAO' ? 9 : 0 },
    pag: { detPag: [{ tPag: TPAG[pedido.metodoPagamento ?? 'DINHEIRO'] ?? '99', vPag: reais(pedido.total) }] },
    infAdic: { infCpl: `Pedido #${pedido.numero}. Tributos aproximados conforme Lei 12.741/2012.` },
    csc: { id: fiscal.cscId || null },
  };

  const provedor = PROVEDORES[fiscal.provedor] ?? PROVEDORES.nenhum;
  const nota = await db.notaFiscal.create({
    data: { pedidoId: pedido.id, modelo: 'NFCE', serie, numero, ambiente: fiscal.ambiente, chaveAcesso: chave, conteudo: JSON.parse(JSON.stringify(documento)), valorTotal: pedido.total, provedor: provedor.nome, emitidaPor: usuarioId },
  });
  const r: ResultadoEmissao = await provedor.emitir(documento, { ambiente: fiscal.ambiente, chave }).catch((e: Error) => ({ status: 'PENDENTE' as const, motivo: `Falha ao transmitir: ${e.message}` }));
  await db.notaFiscal.update({ where: { id: nota.id }, data: { status: r.status, protocolo: r.protocolo, xmlAutorizado: r.xml, motivo: r.motivo, autorizadaEm: r.status === 'AUTORIZADA' ? new Date() : null } });
  await auditar('nota.gerada', { usuarioId, alvo: nota.id, detalhes: { pedido: pedido.numero, numero, serie, status: r.status } });
  return { id: nota.id, numero, chave, status: r.status, motivo: r.motivo };
}

export async function cancelarNota(id: string, justificativa: string, usuarioId: string) {
  if (justificativa.trim().length < 15) throw new ErroNegocio('A justificativa de cancelamento precisa de ao menos 15 caracteres (regra da SEFAZ).');
  const n = await db.notaFiscal.findUnique({ where: { id } });
  if (!n) throw new ErroNegocio('Nota não encontrada.', 404);
  if (n.status === 'CANCELADA') throw new ErroNegocio('Nota já cancelada.');
  if (n.status === 'AUTORIZADA') {
    const r = await (PROVEDORES[n.provedor] ?? PROVEDORES.nenhum).cancelar(n.chaveAcesso, n.protocolo ?? '', justificativa, { ambiente: n.ambiente });
    if (!r.ok) throw new ErroNegocio(r.motivo ?? 'Não foi possível cancelar na SEFAZ.');
  }
  await db.notaFiscal.update({ where: { id }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivo: justificativa } });
  await auditar('nota.cancelada', { usuarioId, alvo: id, detalhes: { justificativa } });
}
