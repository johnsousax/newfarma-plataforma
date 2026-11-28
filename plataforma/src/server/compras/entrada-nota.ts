import 'server-only';
import { db } from '../db';
import { ErroNegocio } from '../erros';
import { auditar } from '../auditoria';
import { entrada } from '../estoque';
import { garantirPlanoPadrao } from '../financeiro';
import { lojaDoCaixa } from '../admin/operacoes';
import { lerNfe, validarChave, type ItemXml, type NotaXml } from './nfe-xml';
import type { UsuarioSessao } from '../auth';

/**
 * Entrada de nota fiscal de compra: o XML da NF-e (enviado ou baixado pela chave bipada)
 * vira entrada de estoque por lote/validade, custo médio, contas a pagar das duplicatas
 * e a "memória" de qual código do fornecedor é qual produto nosso.
 */

export type ItemNotaEntrada = ItemXml & {
  produtoId: string | null;
  produtoNome: string | null;
  /** Unidades nossas em cada unidade da nota (ex.: caixa com 10 → 10) */
  fator: number;
  como: 'memoria' | 'ean' | 'anvisa' | 'manual' | null;
  ignorar: boolean;
};

const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const formatarCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

async function fornecedorDaNota(n: NotaXml) {
  const todos = await db.fornecedor.findMany({ select: { id: true, cnpj: true } });
  const achado = todos.find((f) => digitos(f.cnpj) === n.emitente.cnpj);
  if (achado) return { id: achado.id, novo: false };
  const f = await db.fornecedor.create({
    data: { razaoSocial: n.emitente.nome, nomeFantasia: n.emitente.fantasia || n.emitente.nome, cnpj: formatarCnpj(n.emitente.cnpj), telefone: n.emitente.telefone },
  });
  return { id: f.id, novo: true };
}

/** Liga cada item da nota a um produto: memória do fornecedor → código de barras → registro ANVISA. */
async function vincularItens(fornecedorId: string, itens: ItemXml[]): Promise<ItemNotaEntrada[]> {
  const [memoria, porEan, porRegistro] = await Promise.all([
    db.codigoFornecedor.findMany({ where: { fornecedorId, codigo: { in: itens.map((i) => i.cProd) } } }),
    db.produto.findMany({ where: { ean: { in: itens.map((i) => i.ean).filter((x): x is string => !!x) } }, select: { id: true, nome: true, ean: true } }),
    db.produto.findMany({ where: { registroAnvisa: { in: itens.map((i) => i.registroAnvisa).filter((x): x is string => !!x) } }, select: { id: true, nome: true, registroAnvisa: true } }),
  ]);
  const nomes = new Map((await db.produto.findMany({ where: { id: { in: memoria.map((m) => m.produtoId) } }, select: { id: true, nome: true } })).map((p) => [p.id, p.nome]));
  return itens.map((i) => {
    const m = memoria.find((x) => x.codigo === i.cProd);
    if (m && nomes.has(m.produtoId)) return { ...i, produtoId: m.produtoId, produtoNome: nomes.get(m.produtoId)!, fator: m.fator, como: 'memoria', ignorar: false };
    const fatorSugerido = i.qTrib && i.qCom && i.unidadeTrib && i.unidadeTrib !== i.unidade && i.qTrib > i.qCom && Number.isInteger(i.qTrib / i.qCom) ? i.qTrib / i.qCom : 1;
    const e = i.ean ? porEan.find((p) => p.ean === i.ean) : null;
    if (e) return { ...i, produtoId: e.id, produtoNome: e.nome, fator: fatorSugerido, como: 'ean', ignorar: false };
    const r = i.registroAnvisa ? porRegistro.filter((p) => digitos(p.registroAnvisa) === i.registroAnvisa) : [];
    if (r.length === 1) return { ...i, produtoId: r[0].id, produtoNome: r[0].nome, fator: fatorSugerido, como: 'anvisa', ignorar: false };
    return { ...i, produtoId: null, produtoNome: null, fator: fatorSugerido, como: null, ignorar: false };
  });
}

/** Importa o XML: valida, cria o fornecedor se for novo e liga os itens. Nota repetida não entra duas vezes. */
export async function importarXml(u: UsuarioSessao, xml: string, origem: 'xml' | 'sefaz' = 'xml', chaveEsperada?: string) {
  let n: NotaXml;
  try { n = lerNfe(xml); } catch (e) { throw new ErroNegocio((e as Error).message); }
  if (chaveEsperada && n.chave !== chaveEsperada) throw new ErroNegocio(`Este XML é da nota ${n.numero} (chave final ${n.chave.slice(-6)}), não da nota bipada (final ${chaveEsperada.slice(-6)}).`);
  const ja = await db.notaEntrada.findUnique({ where: { chave: n.chave }, select: { id: true, status: true, numero: true } });
  if (ja) return { id: ja.id, repetida: true, numero: ja.numero };
  const lojaId = await lojaDoCaixa(u);
  if (!lojaId) throw new ErroNegocio('Seu usuário não está vinculado a uma loja.');
  const forn = await fornecedorDaNota(n);
  const itens = await vincularItens(forn.id, n.itens);
  const nota = await db.notaEntrada.create({
    data: {
      chave: n.chave, numero: n.numero, serie: n.serie, emitidaEm: n.emitidaEm, fornecedorId: forn.id, lojaId, emitenteCnpj: n.emitente.cnpj, emitenteNome: n.emitente.fantasia || n.emitente.nome,
      destCnpj: n.destCnpj, valorTotal: n.valorTotal, autorizada: n.autorizada, itens, duplicatas: n.duplicatas, xml, origem, importadaPorId: u.id,
    },
  });
  await auditar('nota_entrada.importada', { usuarioId: u.id, alvo: nota.id, detalhes: { chave: n.chave, numero: n.numero, itens: itens.length, vinculados: itens.filter((i) => i.produtoId).length, fornecedorNovo: forn.novo } });
  return { id: nota.id, repetida: false, numero: n.numero };
}

/** Avisos da conferência (o que impede ou merece atenção antes de lançar). */
export async function conferir(nota: { lojaId: string; destCnpj: string | null; autorizada: boolean; itens: unknown; status: string }) {
  const loja = await db.loja.findUnique({ where: { id: nota.lojaId }, select: { cnpj: true, nome: true } });
  const itens = nota.itens as ItemNotaEntrada[];
  const bloqueios: string[] = [];
  const atencao: string[] = [];
  if (loja && nota.destCnpj && digitos(loja.cnpj) !== nota.destCnpj) bloqueios.push(`A nota foi emitida para o CNPJ ${formatarCnpj(nota.destCnpj)}, não para ${loja.nome} (${loja.cnpj}).`);
  if (!nota.autorizada) atencao.push('O XML não traz o protocolo de autorização da SEFAZ. Confira se é a nota definitiva.');
  const semProduto = itens.filter((i) => !i.ignorar && !i.produtoId).length;
  if (semProduto) bloqueios.push(`${semProduto} item(ns) ainda sem produto ligado.`);
  const semLote = itens.filter((i) => !i.ignorar && (!i.lotes.length || i.lotes.some((l) => !l.codigo || !l.validade))).length;
  if (semLote) bloqueios.push(`${semLote} item(ns) sem lote ou validade.`);
  const qtdErrada = itens.filter((i) => !i.ignorar && i.lotes.length && Math.abs(i.lotes.reduce((s, l) => s + l.quantidade, 0) - i.qCom) > 0.001).length;
  if (qtdErrada) bloqueios.push(`${qtdErrada} item(ns) com a soma dos lotes diferente da quantidade da nota.`);
  const fracionado = itens.filter((i) => !i.ignorar && !Number.isInteger(Math.round(i.qCom * i.fator * 1000) / 1000)).length;
  if (fracionado) bloqueios.push(`${fracionado} item(ns) com quantidade fracionada. Ajuste o fator (unidades por embalagem).`);
  const vencido = itens.filter((i) => !i.ignorar && i.lotes.some((l) => l.validade && new Date(l.validade) <= new Date())).length;
  if (vencido) bloqueios.push(`${vencido} item(ns) com lote vencido. Não dê entrada; devolva ao fornecedor.`);
  const curto = itens.filter((i) => !i.ignorar && i.lotes.some((l) => l.validade && new Date(l.validade).getTime() - Date.now() < 180 * 86_400_000 && new Date(l.validade) > new Date())).length;
  if (curto) atencao.push(`${curto} item(ns) com validade menor que 6 meses.`);
  return { bloqueios, atencao, pronta: !bloqueios.length && nota.status === 'PENDENTE' };
}

/** Atualiza o vínculo/fator/lotes de um item na conferência. */
export async function ajustarItem(notaId: string, n: number, d: { produtoId?: string | null; fator?: number; ignorar?: boolean; lotes?: { codigo: string; quantidade: number; validade: string | null }[] }) {
  const nota = await db.notaEntrada.findUnique({ where: { id: notaId } });
  if (!nota || nota.status !== 'PENDENTE') throw new ErroNegocio('Nota não está pendente.');
  const itens = nota.itens as ItemNotaEntrada[];
  const i = itens.find((x) => x.n === n);
  if (!i) throw new ErroNegocio('Item não encontrado.');
  if (d.produtoId !== undefined) {
    if (d.produtoId) {
      const p = await db.produto.findUnique({ where: { id: d.produtoId }, select: { id: true, nome: true } });
      if (!p) throw new ErroNegocio('Produto não encontrado.');
      i.produtoId = p.id; i.produtoNome = p.nome; i.como = 'manual';
    } else { i.produtoId = null; i.produtoNome = null; i.como = null; }
  }
  if (d.fator !== undefined) i.fator = Math.max(1, Math.min(1000, Math.round(d.fator)));
  if (d.ignorar !== undefined) i.ignorar = d.ignorar;
  if (d.lotes) i.lotes = d.lotes.filter((l) => l.codigo.trim()).map((l) => ({ codigo: l.codigo.trim().toUpperCase().slice(0, 40), quantidade: l.quantidade, validade: l.validade, fabricacao: null }));
  await db.notaEntrada.update({ where: { id: notaId }, data: { itens } });
}

const fimDoDia = (iso: string) => new Date(`${iso.slice(0, 10)}T23:59:59-03:00`);

/** Dá entrada no estoque, grava a memória de códigos, gera as contas a pagar e (opcional) baixa o pedido de compra. */
export async function lancarNota(u: UsuarioSessao, notaId: string, compraId?: string | null) {
  const nota = await db.notaEntrada.findUnique({ where: { id: notaId } });
  if (!nota) throw new ErroNegocio('Nota não encontrada.', 404);
  if (nota.status !== 'PENDENTE') throw new ErroNegocio('Esta nota já foi lançada ou descartada.');
  const c = await conferir(nota);
  if (c.bloqueios.length) throw new ErroNegocio(c.bloqueios.join(' '));
  const itens = (nota.itens as ItemNotaEntrada[]).filter((i) => !i.ignorar);
  if (!itens.length) throw new ErroNegocio('Nenhum item para dar entrada.');
  if (compraId) {
    const compra = await db.pedidoCompra.findUnique({ where: { id: compraId }, select: { status: true, fornecedorId: true } });
    if (!compra || compra.status !== 'ENVIADO' || compra.fornecedorId !== nota.fornecedorId) throw new ErroNegocio('O pedido de compra escolhido não está aguardando entrega deste fornecedor.');
  }
  await garantirPlanoPadrao();
  const categoria = await db.categoriaFinanceira.findFirst({ where: { nome: 'Compra de mercadorias', tipo: 'DESPESA' } });
  const duplicatas = nota.duplicatas as { numero: string; vencimento: string; valor: number }[];
  const motivo = `NF ${nota.numero} · ${nota.emitenteNome}`;
  let unidades = 0;
  await db.$transaction(async (tx) => {
    for (const i of itens) {
      const totalUnidades = Math.round(i.qCom * i.fator);
      const custoUnit = totalUnidades ? Math.round(i.custoTotal / totalUnidades) : null;
      for (const l of i.lotes) {
        const qtd = Math.round(l.quantidade * i.fator);
        if (qtd <= 0) continue;
        await entrada(tx, { lojaId: nota.lojaId, produtoId: i.produtoId!, codigo: l.codigo, validade: fimDoDia(l.validade!), quantidade: qtd, custoUnit, usuarioId: u.id, compraId: compraId ?? undefined, motivo });
        unidades += qtd;
      }
      await tx.codigoFornecedor.upsert({
        where: { fornecedorId_codigo: { fornecedorId: nota.fornecedorId, codigo: i.cProd } },
        create: { fornecedorId: nota.fornecedorId, codigo: i.cProd, produtoId: i.produtoId!, fator: i.fator },
        update: { produtoId: i.produtoId!, fator: i.fator },
      });
      // produto sem código de barras: aproveita o da nota (se ninguém mais usa)
      if (i.ean) {
        const p = await tx.produto.findUnique({ where: { id: i.produtoId! }, select: { ean: true } });
        if (p && !p.ean && !(await tx.produto.findFirst({ where: { ean: i.ean }, select: { id: true } }))) await tx.produto.update({ where: { id: i.produtoId! }, data: { ean: i.ean } });
      }
    }
    if (categoria) {
      const parcelas = duplicatas.length ? duplicatas : [{ numero: '1', vencimento: new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10), valor: nota.valorTotal }];
      await tx.lancamento.createMany({
        data: parcelas.map((d, k) => ({
          tipo: 'DESPESA' as const, descricao: `NF ${nota.numero} — ${nota.emitenteNome}${parcelas.length > 1 ? ` (${k + 1}/${parcelas.length})` : ''}`, valor: d.valor,
          vencimento: fimDoDia(d.vencimento), competencia: nota.emitidaEm, categoriaId: categoria.id, fornecedorId: nota.fornecedorId, documento: `NF ${nota.numero}${d.numero ? ` dup ${d.numero}` : ''}`,
          origem: 'nota_entrada', compraId: compraId ?? null, criadoPor: u.id, parcela: parcelas.length > 1 ? k + 1 : null, totalParcelas: parcelas.length > 1 ? parcelas.length : null,
        })),
      });
    }
    if (compraId) await tx.pedidoCompra.update({ where: { id: compraId }, data: { status: 'RECEBIDO', recebidoEm: new Date(), notaFiscal: String(nota.numero) } });
    const r = await tx.notaEntrada.updateMany({ where: { id: nota.id, status: 'PENDENTE' }, data: { status: 'LANCADA', lancadaPorId: u.id, lancadaEm: new Date(), compraId: compraId ?? null } });
    if (!r.count) throw new ErroNegocio('Esta nota acabou de ser lançada por outra pessoa.');
    await auditar('nota_entrada.lancada', { usuarioId: u.id, alvo: nota.id, detalhes: { chave: nota.chave, numero: nota.numero, itens: itens.length, unidades, valor: nota.valorTotal, compraId } }, tx);
  }, { timeout: 60_000 });
  return { itens: itens.length, unidades, parcelas: duplicatas.length || 1 };
}

export async function descartarNota(u: UsuarioSessao, notaId: string) {
  const r = await db.notaEntrada.updateMany({ where: { id: notaId, status: 'PENDENTE' }, data: { status: 'DESCARTADA' } });
  if (!r.count) throw new ErroNegocio('Só é possível descartar notas pendentes.');
  await auditar('nota_entrada.descartada', { usuarioId: u.id, alvo: notaId });
}

/**
 * Bipou a chave do DANFE: se a nota já foi importada, abre; se há provedor ligado, baixa o XML da SEFAZ;
 * senão, devolve os dados da chave para pedir o XML.
 */
export async function biparChave(u: UsuarioSessao, chaveLida: string) {
  const v = validarChave(chaveLida);
  if (!v.ok) throw new ErroNegocio(v.erro);
  if (v.modelo !== '55') throw new ErroNegocio('Esse código é de um cupom (NFC-e). Bipe o código de barras do DANFE da nota de compra.');
  const ja = await db.notaEntrada.findUnique({ where: { chave: v.chave }, select: { id: true } });
  if (ja) return { tipo: 'existente' as const, id: ja.id };
  const { baixarXmlRecebido } = await import('../fiscal/recebidas');
  const r = await baixarXmlRecebido(v.chave);
  if (r.ok) {
    const imp = await importarXml(u, r.xml, 'sefaz', v.chave);
    return { tipo: 'importada' as const, id: imp.id };
  }
  const fornecedores = await db.fornecedor.findMany({ select: { nomeFantasia: true, cnpj: true } });
  const f = fornecedores.find((x) => digitos(x.cnpj) === v.cnpj);
  return { tipo: 'precisa_xml' as const, chave: v.chave, numero: v.numero, serie: v.serie, uf: v.uf, anoMes: v.anoMes, cnpj: formatarCnpj(v.cnpj), fornecedor: f?.nomeFantasia ?? null, motivo: r.motivo };
}
