import 'server-only';
import { db, type Tx } from './db';
import { ErroNegocio } from './erros';
import { auditar } from './auditoria';
import { indiceCpf } from './cripto';
import type { UsuarioSessao } from './auth';

/**
 * Crediário (fiado) e convênios. Cada conta tem um extrato (MovimentoCrediario):
 * compras somam à dívida, pagamentos/estornos abatem. O vencido segue a ordem das compras.
 */

const DIA = 86_400_000;
const meioDia = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes, Math.min(Math.max(dia, 1), 28), 15));

/** Próximo dia de vencimento do crediário com pelo menos 10 dias de prazo. */
export function vencimentoCrediario(dia: number, hoje = new Date()) {
  const d = meioDia(hoje.getUTCFullYear(), hoje.getUTCMonth(), dia);
  while (d.getTime() - hoje.getTime() < 10 * DIA) d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Convênio: a compra entra na fatura que fecha no próximo dia de fechamento; vence N dias depois. */
export function vencimentoConvenio(diaFechamento: number, prazoDias: number, hoje = new Date()) {
  const f = meioDia(hoje.getUTCFullYear(), hoje.getUTCMonth(), diaFechamento);
  if (f.getTime() < hoje.getTime() - 12 * 3_600_000) f.setUTCMonth(f.getUTCMonth() + 1);
  return new Date(f.getTime() + prazoDias * DIA);
}

export type Situacao = { saldo: number; vencido: number; proximoVencimento: Date | null; ultimaCompra: Date | null };

/** Saldo devedor e valor vencido por conta. */
export async function situacaoContas(ids?: string[]) {
  const linhas = await db.$queryRaw<{ contaId: string; saldo: bigint; vencidas: bigint; abatido: bigint; proximo: Date | null; ultima: Date | null }[]>`
    SELECT "contaId",
      SUM(valor) AS saldo,
      SUM(CASE WHEN valor > 0 AND vencimento < now() THEN valor ELSE 0 END) AS vencidas,
      SUM(CASE WHEN valor < 0 THEN -valor ELSE 0 END) AS abatido,
      MIN(CASE WHEN valor > 0 AND vencimento >= now() THEN vencimento END) AS proximo,
      MAX(CASE WHEN tipo = 'COMPRA' THEN "criadoEm" END) AS ultima
    FROM "MovimentoCrediario" GROUP BY "contaId"`;
  const mapa = new Map<string, Situacao>();
  for (const l of linhas) {
    if (ids && !ids.includes(l.contaId)) continue;
    const saldo = Number(l.saldo);
    mapa.set(l.contaId, { saldo, vencido: Math.max(0, Math.min(saldo, Number(l.vencidas) - Number(l.abatido))), proximoVencimento: saldo > 0 ? l.proximo : null, ultimaCompra: l.ultima });
  }
  return mapa;
}

export const situacaoVazia: Situacao = { saldo: 0, vencido: 0, proximoVencimento: null, ultimaCompra: null };

/** Contas que o caixa pode usar na venda (busca por nome, CPF ou matrícula). */
export async function buscarContas(q: string, metodo: 'CREDIARIO' | 'CONVENIO') {
  const t = q.trim();
  if (t.length < 2) return [];
  const cpf = t.replace(/\D/g, '');
  const contas = await db.contaCrediario.findMany({
    where: {
      ativa: true,
      ...(metodo === 'CONVENIO' ? { convenioId: { not: null }, convenio: { ativo: true } } : {}),
      OR: [{ nome: { contains: t, mode: 'insensitive' } }, { matricula: t }, ...(cpf.length === 11 ? [{ cpfHash: indiceCpf(cpf) }] : [])],
    },
    include: { convenio: { select: { nome: true, descontoBp: true } } },
    take: 8, orderBy: { nome: 'asc' },
  });
  const sit = await situacaoContas(contas.map((c) => c.id));
  return contas.map((c) => {
    const s = sit.get(c.id) ?? situacaoVazia;
    return { id: c.id, nome: c.nome, cpfFinal: c.cpfFinal, convenio: c.convenio?.nome ?? null, descontoBp: c.convenio?.descontoBp ?? 0, limite: c.limite, saldo: s.saldo, disponivel: Math.max(0, c.limite - s.saldo), vencido: s.vencido, bloqueada: c.bloqueada };
  });
}

/** Desconto do convênio (aplicado no total da venda). */
export async function descontoConvenio(contaId: string, total: number) {
  const c = await db.contaCrediario.findUnique({ where: { id: contaId }, include: { convenio: true } });
  if (!c?.convenio) throw new ErroNegocio('Esta conta não pertence a um convênio.');
  return { desconto: Math.round((total * c.convenio.descontoBp) / 10_000), convenio: c.convenio };
}

/**
 * Lança a compra na conta dentro da transação da venda (trava a conta para o limite valer
 * mesmo com dois caixas vendendo ao mesmo tempo).
 */
export async function lancarCompra(tx: Tx, d: { contaId: string; metodo: 'CREDIARIO' | 'CONVENIO'; valor: number; pedidoId: string; numero: number; usuarioId: string }) {
  const [c] = await tx.$queryRaw<{ id: string; nome: string; limite: number; bloqueada: boolean; ativa: boolean; convenioId: string | null; diaVencimento: number }[]>`
    SELECT id, nome, limite, bloqueada, ativa, "convenioId", "diaVencimento" FROM "ContaCrediario" WHERE id = ${d.contaId} FOR UPDATE`;
  if (!c || !c.ativa) throw new ErroNegocio('Conta de crediário não encontrada ou inativa.');
  if (c.bloqueada) throw new ErroNegocio(`A conta de ${c.nome} está bloqueada. Fale com o gerente.`);
  let vencimento: Date;
  if (d.metodo === 'CONVENIO') {
    if (!c.convenioId) throw new ErroNegocio(`${c.nome} não está ligado a um convênio.`);
    const conv = await tx.convenio.findUnique({ where: { id: c.convenioId } });
    if (!conv?.ativo) throw new ErroNegocio('Convênio inativo.');
    vencimento = vencimentoConvenio(conv.diaFechamento, conv.prazoPagamentoDias);
  } else {
    vencimento = vencimentoCrediario(c.diaVencimento);
  }
  const [{ saldo }] = await tx.$queryRaw<{ saldo: bigint | null }[]>`SELECT SUM(valor) AS saldo FROM "MovimentoCrediario" WHERE "contaId" = ${c.id}`;
  const devendo = Number(saldo ?? 0);
  if (devendo + d.valor > c.limite) {
    throw new ErroNegocio(`Limite insuficiente para ${c.nome}: disponível ${(Math.max(0, c.limite - devendo) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
  }
  await tx.movimentoCrediario.create({ data: { contaId: c.id, tipo: 'COMPRA', valor: d.valor, descricao: `Compra #${d.numero}${d.metodo === 'CONVENIO' ? ' (convênio)' : ''}`, pedidoId: d.pedidoId, vencimento, usuarioId: d.usuarioId } });
  return { conta: c, vencimento };
}

/** Estorna na conta a compra de um pedido cancelado. */
export async function estornarCompraDoPedido(tx: Tx, pedidoId: string, usuarioId: string | null) {
  const compras = await tx.movimentoCrediario.findMany({ where: { pedidoId, tipo: 'COMPRA' } });
  for (const m of compras) {
    const ja = await tx.movimentoCrediario.count({ where: { pedidoId, tipo: 'ESTORNO', contaId: m.contaId } });
    if (!ja) await tx.movimentoCrediario.create({ data: { contaId: m.contaId, tipo: 'ESTORNO', valor: -m.valor, descricao: `Estorno: ${m.descricao} cancelada`, pedidoId, usuarioId } });
  }
}

async function categoriaRecebimento() {
  return db.categoriaFinanceira.upsert({
    where: { nome_tipo: { nome: 'Recebimento de crediário e convênios', tipo: 'RECEITA' } },
    create: { nome: 'Recebimento de crediário e convênios', tipo: 'RECEITA', grupo: 'RECEBIMENTO_CREDIARIO' },
    update: {},
  });
}

/** Cliente pagou (parte ou tudo) do crediário. Entra no caixa aberto (se dinheiro) e no financeiro. */
export async function receberPagamento(u: UsuarioSessao, d: { contaId: string; valor: number; forma: string; contaFinanceiraId?: string | null }) {
  if (d.valor <= 0) throw new ErroNegocio('Informe o valor recebido.');
  const conta = await db.contaCrediario.findUnique({ where: { id: d.contaId } });
  if (!conta) throw new ErroNegocio('Conta não encontrada.', 404);
  const s = (await situacaoContas([conta.id])).get(conta.id) ?? situacaoVazia;
  if (d.valor > s.saldo) throw new ErroNegocio(`O valor é maior que a dívida (${(s.saldo / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`);
  const cat = await categoriaRecebimento();
  const caixa = d.forma === 'DINHEIRO' ? await db.caixaSessao.findFirst({ where: { operadorId: u.id, status: 'ABERTO' } }) : null;
  await db.$transaction(async (tx) => {
    await tx.movimentoCrediario.create({ data: { contaId: conta.id, tipo: 'PAGAMENTO', valor: -d.valor, descricao: `Pagamento (${d.forma.toLowerCase().replace('_', ' ')})`, formaPagamento: d.forma, usuarioId: u.id } });
    await tx.lancamento.create({
      data: { tipo: 'RECEITA', descricao: `Crediário — ${conta.nome}`, valor: d.valor, vencimento: new Date(), competencia: new Date(), status: 'PAGO', pagoEm: new Date(), valorPago: d.valor, formaPagamento: d.forma, categoriaId: cat.id, contaId: d.contaFinanceiraId ?? null, pessoa: conta.nome, origem: 'crediario', criadoPor: u.id },
    });
    if (caixa) await tx.caixaMovimento.create({ data: { caixaId: caixa.id, tipo: 'SUPRIMENTO', metodo: 'DINHEIRO', valor: d.valor, descricao: `Recebimento crediário — ${conta.nome}` } });
    await auditar('crediario.pagamento', { usuarioId: u.id, alvo: conta.id, detalhes: { valor: d.valor, forma: d.forma } }, tx);
  });
  return { noCaixa: !!caixa };
}

/** A empresa conveniada pagou a fatura: quita as contas dos conveniados e lança a receita. */
export async function receberFaturaConvenio(u: UsuarioSessao, convenioId: string, contaFinanceiraId?: string | null) {
  const conv = await db.convenio.findUnique({ where: { id: convenioId }, include: { contas: { select: { id: true, nome: true } } } });
  if (!conv) throw new ErroNegocio('Convênio não encontrado.', 404);
  const sit = await situacaoContas(conv.contas.map((c) => c.id));
  const devedores = conv.contas.map((c) => ({ ...c, saldo: sit.get(c.id)?.saldo ?? 0 })).filter((c) => c.saldo > 0);
  const total = devedores.reduce((s, c) => s + c.saldo, 0);
  if (!total) throw new ErroNegocio('Não há valores em aberto neste convênio.');
  const cat = await categoriaRecebimento();
  await db.$transaction(async (tx) => {
    for (const c of devedores) await tx.movimentoCrediario.create({ data: { contaId: c.id, tipo: 'PAGAMENTO', valor: -c.saldo, descricao: `Fatura paga pelo convênio ${conv.nome}`, formaPagamento: 'CONVENIO', usuarioId: u.id } });
    await tx.lancamento.create({
      data: { tipo: 'RECEITA', descricao: `Fatura do convênio ${conv.nome}`, valor: total, vencimento: new Date(), competencia: new Date(), status: 'PAGO', pagoEm: new Date(), valorPago: total, formaPagamento: 'Transferência', categoriaId: cat.id, contaId: contaFinanceiraId ?? null, pessoa: conv.nome, origem: 'convenio', criadoPor: u.id },
    });
    await auditar('convenio.fatura_paga', { usuarioId: u.id, alvo: conv.id, detalhes: { total, contas: devedores.length } }, tx);
  });
  return { total, contas: devedores.length };
}

/** Texto da cobrança amigável enviada pelo WhatsApp. */
export function textoCobranca(nome: string, vencido: number, saldo: number, loja: string) {
  const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `Olá, ${nome.split(' ')[0]}! Aqui é da ${loja}. Consta em aberto no seu crediário ${brl(vencido)} já vencido${saldo > vencido ? ` (saldo total ${brl(saldo)})` : ''}. Você pode pagar na loja ou pedir o Pix por aqui. Se já pagou, desconsidere. Obrigado!`;
}

/** Envia cobrança pelo WhatsApp para quem tem valor vencido (no máximo 1 a cada 3 dias por cliente). */
export async function enviarCobrancas(usuarioId: string | null) {
  const { enviarTexto, estadoConexao } = await import('./whatsapp/evolution');
  const { FARMACIA } = await import('@/lib/farmacia');
  if ((await estadoConexao()) !== 'aberta') throw new ErroNegocio('O WhatsApp da loja não está conectado (Painel › WhatsApp).');
  const contas = await db.contaCrediario.findMany({ where: { ativa: true, telefone: { not: null }, OR: [{ ultimaCobrancaEm: null }, { ultimaCobrancaEm: { lt: new Date(Date.now() - 3 * DIA) } }] } });
  const sit = await situacaoContas(contas.map((c) => c.id));
  let enviadas = 0, falhas = 0;
  for (const c of contas) {
    const s = sit.get(c.id);
    if (!s || s.vencido <= 0 || !c.telefone) continue;
    const r = await enviarTexto(c.telefone, textoCobranca(c.nome, s.vencido, s.saldo, FARMACIA.nome)).then(() => true, () => false);
    if (r) { enviadas++; await db.contaCrediario.update({ where: { id: c.id }, data: { ultimaCobrancaEm: new Date() } }); } else falhas++;
  }
  await auditar('crediario.cobrancas', { usuarioId, detalhes: { enviadas, falhas } });
  return { enviadas, falhas };
}
