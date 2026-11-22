import { config } from '../config.js';
import { cifrar, decifrar } from '../lib/crypto.js';
import { erro, texto } from '../lib/http.js';

/**
 * Regras sanitárias por classificação do produto.
 *
 * Base normativa (resumo — validar com o RT e assessoria regulatória):
 *  - RDC 44/2009: comércio remoto só por farmácia aberta ao público, com farmacêutico
 *    presente; dados da farmácia (CNPJ, AFE, RT/CRF) visíveis; PROIBIDA a venda remota
 *    de medicamentos sujeitos a controle especial (Portaria SVS/MS 344/98).
 *  - Portaria 344/98: entorpecentes/psicotrópicos (tarja preta e listas especiais) →
 *    receita retida, escrituração (SNGPC) — aqui: somente reserva com retirada presencial.
 *  - RDC 471/2021: antimicrobianos → receita em 2 vias, validade de 10 dias, retenção
 *    da 2ª via e escrituração no SNGPC.
 *  - Tarja vermelha "venda sob prescrição": exige apresentação da receita, sem retenção.
 *  - MIP (RDC 98/2016): venda livre, com orientação farmacêutica disponível.
 */
export const CLASSIFICACOES = {
  NAO_MEDICAMENTO: { rotulo: 'Não medicamento', medicamento: false, vendaRemota: true, exigeReceita: false, retencao: false, escrituracao: false, ifood: true },
  MIP: { rotulo: 'Isento de prescrição (MIP)', medicamento: true, vendaRemota: true, exigeReceita: false, retencao: false, escrituracao: false, ifood: true },
  TARJA_VERMELHA: { rotulo: 'Venda sob prescrição médica', medicamento: true, vendaRemota: true, exigeReceita: true, retencao: false, escrituracao: false, ifood: false },
  ANTIMICROBIANO: { rotulo: 'Antimicrobiano — receita retida (RDC 471/2021)', medicamento: true, vendaRemota: true, exigeReceita: true, retencao: true, escrituracao: true, ifood: false },
  CONTROLADO: { rotulo: 'Controle especial (Portaria 344/98)', medicamento: true, vendaRemota: false, exigeReceita: true, retencao: true, escrituracao: true, ifood: false },
};

export const CANAIS = ['app', 'ifood', 'whatsapp', 'balcao'];
const CANAIS_REMOTOS = ['app', 'ifood', 'whatsapp'];

export function regra(produto) {
  const r = CLASSIFICACOES[produto.classificacao];
  if (!r) throw erro(500, `Classificação sanitária inválida no produto ${produto.id}`);
  return r;
}

/** Valida o cadastro sanitário de um produto (registro ANVISA etc.). */
export function validarCadastroProduto(p) {
  if (!CLASSIFICACOES[p.classificacao]) throw erro(400, `classificacao deve ser uma de: ${Object.keys(CLASSIFICACOES).join(', ')}`);
  const r = CLASSIFICACOES[p.classificacao];
  if (r.medicamento) {
    const reg = String(p.registroAnvisa || '').replace(/\D/g, '');
    if (reg.length !== 13) throw erro(400, 'Medicamentos exigem número de registro ANVISA com 13 dígitos');
    if (!p.principioAtivo) throw erro(400, 'Medicamentos exigem princípio ativo (DCB)');
  }
}

/** Avalia se um produto pode ser vendido em determinado canal. */
export function avaliarProduto(produto, canal = 'app') {
  const r = regra(produto);
  if (CANAIS_REMOTOS.includes(canal) && !r.vendaRemota) {
    return { permitido: false, reservaPresencial: true, motivo: 'Medicamento sujeito a controle especial (Portaria 344/98): venda remota proibida pela RDC 44/2009. Disponível apenas para retirada na loja com receita original.' };
  }
  if (canal === 'ifood' && !r.ifood) {
    return { permitido: false, motivo: 'Medicamentos que exigem prescrição não são ofertados no marketplace iFood.' };
  }
  return { permitido: true, exigeReceita: r.exigeReceita, retencao: r.retencao, escrituracao: r.escrituracao };
}

/** Público: o que o cliente precisa saber sobre o produto. */
export function infoRegulatoria(produto) {
  const r = regra(produto);
  return {
    classificacao: produto.classificacao,
    rotulo: r.rotulo,
    exigeReceita: r.exigeReceita,
    retencaoReceita: r.retencao,
    vendaOnline: r.vendaRemota,
    registroAnvisa: produto.registroAnvisa || null,
    aviso: r.medicamento ? 'SE PERSISTIREM OS SINTOMAS, O MÉDICO DEVERÁ SER CONSULTADO. Leia a bula.' : null,
  };
}

export function criarAnvisa(store) {
  /** Cliente envia a receita (imagem/PDF em base64) vinculada a um pedido. */
  function registrarReceita({ pedido, usuario, dados, ip }) {
    const tipo = String(dados.tipoArquivo || '');
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(tipo)) throw erro(400, 'Envie a receita em JPG, PNG ou PDF');
    const conteudo = String(dados.arquivoBase64 || '');
    if (!/^[A-Za-z0-9+/=]+$/.test(conteudo) || conteudo.length < 100) throw erro(400, 'Arquivo da receita inválido');
    const bytes = Buffer.from(conteudo, 'base64');
    const assinaturas = { 'image/jpeg': [0xff, 0xd8], 'image/png': [0x89, 0x50], 'application/pdf': [0x25, 0x50] };
    if (!assinaturas[tipo].every((b, i) => bytes[i] === b)) throw erro(400, 'O conteúdo do arquivo não corresponde ao tipo informado');

    const dataEmissao = new Date(dados.dataEmissao);
    if (Number.isNaN(dataEmissao.getTime()) || dataEmissao > new Date()) throw erro(400, 'Data de emissão da receita inválida');
    const crm = texto(dados.registroPrescritor, 30);
    if (!/^(CRM|CRO|CRMV|COREN)[-\s]?[A-Z]{2}\s?\d{3,7}$/i.test(crm)) throw erro(400, 'Registro do prescritor inválido (ex.: CRM-SP 123456)');

    const produtosIds = pedido.itens.filter((i) => i.exigeReceita).map((i) => i.produtoId);
    if (!produtosIds.length) throw erro(400, 'Este pedido não contém itens que exigem receita');

    const receita = store.inserir('receitas', {
      pedidoId: pedido.id,
      usuarioId: usuario.id,
      produtosIds,
      status: 'PENDENTE',
      prescritorCifrado: cifrar(texto(dados.nomePrescritor, 120)),
      registroPrescritor: crm.toUpperCase(),
      pacienteCifrado: cifrar(texto(dados.nomePaciente || usuario.nome, 120)),
      dataEmissao: dataEmissao.toISOString(),
      tipoArquivo: tipo,
      arquivoCifrado: cifrar(conteudo), // receita = dado de saúde (dado sensível LGPD)
    });
    store.auditar('receita.enviada', { usuarioId: usuario.id, alvo: receita.id, ip });
    return resumoReceita(receita);
  }

  function resumoReceita(r, completo = false) {
    const base = { id: r.id, pedidoId: r.pedidoId, status: r.status, dataEmissao: r.dataEmissao, registroPrescritor: r.registroPrescritor, produtosIds: r.produtosIds, avaliacao: r.avaliacao || null, criadoEm: r.criadoEm };
    if (completo) Object.assign(base, { nomePrescritor: decifrar(r.prescritorCifrado), nomePaciente: decifrar(r.pacienteCifrado), tipoArquivo: r.tipoArquivo });
    return base;
  }

  function receitaDentroDaValidade(receita, produtos) {
    const dias = produtos.some((p) => p.classificacao === 'ANTIMICROBIANO')
      ? config.anvisa.validadeReceitaAntimicrobianoDias
      : config.anvisa.validadeReceitaComumDias;
    const limite = new Date(receita.dataEmissao).getTime() + dias * 86_400_000;
    return { valida: Date.now() <= limite, dias };
  }

  /** Farmacêutico avalia a receita (obrigatório antes do pagamento/dispensação). */
  function avaliarReceita({ receita, farmaceutico, aprovada, observacao, ip }) {
    if (farmaceutico.papel !== 'farmaceutico') throw erro(403, 'Somente farmacêutico com CRF pode avaliar receitas');
    if (!farmaceutico.crf) throw erro(403, 'Farmacêutico sem CRF cadastrado');
    if (receita.status !== 'PENDENTE') throw erro(409, 'Receita já avaliada');
    const produtos = receita.produtosIds.map((id) => store.obter('produtos', id)).filter(Boolean);
    const { valida, dias } = receitaDentroDaValidade(receita, produtos);
    if (aprovada && !valida) throw erro(422, `Receita vencida (validade de ${dias} dias a partir da emissão)`);
    store.atualizar('receitas', receita.id, {
      status: aprovada ? 'APROVADA' : 'REJEITADA',
      avaliacao: { farmaceuticoId: farmaceutico.id, farmaceutico: farmaceutico.nome, crf: farmaceutico.crf, em: new Date().toISOString(), observacao: texto(observacao, 500) },
    });
    store.auditar(aprovada ? 'receita.aprovada' : 'receita.rejeitada', { usuarioId: farmaceutico.id, alvo: receita.id, ip });
    return resumoReceita(receita);
  }

  /** Valida um conjunto de itens (já com produto carregado) para um canal. */
  function validarItens(itens, canal) {
    const erros = [];
    for (const { produto } of itens) {
      const a = avaliarProduto(produto, canal);
      if (!a.permitido) erros.push({ produtoId: produto.id, produto: produto.nome, motivo: a.motivo });
    }
    return { ok: erros.length === 0, erros };
  }

  /** Escrituração de dispensação (base para transmissão ao SNGPC). */
  function registrarDispensacao({ pedido, item, produto, lotes, farmaceutico }) {
    if (!regra(produto).escrituracao) return null;
    const receita = store.encontrar('receitas', (r) => r.pedidoId === pedido.id && r.produtosIds.includes(produto.id) && r.status === 'APROVADA');
    return store.inserir('escrituracao', {
      tipo: 'SAIDA',
      pedidoId: pedido.id,
      produtoId: produto.id,
      registroAnvisa: produto.registroAnvisa,
      principioAtivo: produto.principioAtivo,
      quantidade: item.quantidade,
      lotes,
      receitaId: receita?.id || null,
      registroPrescritor: receita?.registroPrescritor || null,
      dataPrescricao: receita?.dataEmissao || null,
      farmaceuticoId: farmaceutico?.id || null,
      crfFarmaceutico: farmaceutico?.crf || null,
      transmitidoSngpc: false,
    });
  }

  return { registrarReceita, avaliarReceita, validarItens, registrarDispensacao, resumoReceita, receitaDentroDaValidade };
}
