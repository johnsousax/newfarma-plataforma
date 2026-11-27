import 'server-only';
import { db } from './db';
import { ErroNegocio } from './erros';
import { auditar } from './auditoria';
import { repasses } from './entregas';
import type { TipoLancamento } from '@/generated/prisma/enums';

/** Grupos da DRE. Os marcados com `fora` não entram no resultado (estoque, investimento, retirada). */
export const GRUPOS: Record<string, { rotulo: string; ordem: number; fora?: boolean }> = {
  OUTRAS_RECEITAS: { rotulo: 'Outras receitas operacionais', ordem: 1 },
  CUSTO: { rotulo: 'Outros custos', ordem: 2 },
  PESSOAL: { rotulo: 'Pessoal', ordem: 3 },
  OCUPACAO: { rotulo: 'Ocupação (aluguel, energia, água)', ordem: 4 },
  ADMINISTRATIVA: { rotulo: 'Administrativas', ordem: 5 },
  VENDAS_MARKETING: { rotulo: 'Vendas e marketing', ordem: 6 },
  LOGISTICA: { rotulo: 'Entregas e logística', ordem: 7 },
  IMPOSTOS: { rotulo: 'Impostos e taxas', ordem: 8 },
  FINANCEIRAS: { rotulo: 'Resultado financeiro', ordem: 9 },
  ESTOQUE: { rotulo: 'Compra de mercadorias (vai para o estoque)', ordem: 20, fora: true },
  INVESTIMENTO: { rotulo: 'Investimentos', ordem: 21, fora: true },
  RETIRADA_SOCIOS: { rotulo: 'Retirada dos sócios', ordem: 22, fora: true },
  /** A venda já entrou na receita no dia da compra; aqui só o dinheiro chegando (fluxo de caixa). */
  RECEBIMENTO_CREDIARIO: { rotulo: 'Recebimentos de crediário e convênios', ordem: 23, fora: true },
};

const PLANO: [string, TipoLancamento, string][] = [
  ['Serviços (aferição, aplicação)', 'RECEITA', 'OUTRAS_RECEITAS'], ['Convênios e empresas', 'RECEITA', 'OUTRAS_RECEITAS'], ['Rendimentos financeiros', 'RECEITA', 'FINANCEIRAS'], ['Outras receitas', 'RECEITA', 'OUTRAS_RECEITAS'],
  ['Compra de mercadorias', 'DESPESA', 'ESTOQUE'], ['Salários', 'DESPESA', 'PESSOAL'], ['Encargos (INSS, FGTS)', 'DESPESA', 'PESSOAL'], ['Benefícios (VT, VR)', 'DESPESA', 'PESSOAL'], ['Pró-labore', 'DESPESA', 'PESSOAL'],
  ['Aluguel', 'DESPESA', 'OCUPACAO'], ['Condomínio e IPTU', 'DESPESA', 'OCUPACAO'], ['Energia elétrica', 'DESPESA', 'OCUPACAO'], ['Água', 'DESPESA', 'OCUPACAO'], ['Manutenção e reformas', 'DESPESA', 'OCUPACAO'],
  ['Internet e telefone', 'DESPESA', 'ADMINISTRATIVA'], ['Contabilidade', 'DESPESA', 'ADMINISTRATIVA'], ['Sistemas e assinaturas', 'DESPESA', 'ADMINISTRATIVA'], ['Material de escritório e limpeza', 'DESPESA', 'ADMINISTRATIVA'], ['Outras despesas', 'DESPESA', 'ADMINISTRATIVA'],
  ['Marketing e anúncios', 'DESPESA', 'VENDAS_MARKETING'], ['Taxas de cartão e Pix', 'DESPESA', 'VENDAS_MARKETING'],
  ['Entregas (motoboys)', 'DESPESA', 'LOGISTICA'], ['Combustível e manutenção de veículo', 'DESPESA', 'LOGISTICA'],
  ['Impostos sobre vendas (DAS/Simples)', 'DESPESA', 'IMPOSTOS'], ['Taxas e alvarás (Vigilância, CRF)', 'DESPESA', 'IMPOSTOS'],
  ['Tarifas bancárias e juros', 'DESPESA', 'FINANCEIRAS'], ['Equipamentos e móveis', 'DESPESA', 'INVESTIMENTO'], ['Retirada dos sócios', 'DESPESA', 'RETIRADA_SOCIOS'],
];

/** Cria o plano de contas e a conta "Caixa da loja" na primeira vez. */
export async function garantirPlanoPadrao() {
  if ((await db.categoriaFinanceira.count()) === 0) await db.categoriaFinanceira.createMany({ data: PLANO.map(([nome, tipo, grupo]) => ({ nome, tipo, grupo })), skipDuplicates: true });
  if ((await db.contaFinanceira.count()) === 0) await db.contaFinanceira.createMany({ data: [{ nome: 'Caixa da loja', tipo: 'CAIXA' }, { nome: 'Conta bancária', tipo: 'BANCO' }] });
}

const categoriaPorNome = async (nome: string) => { await garantirPlanoPadrao(); return db.categoriaFinanceira.findFirstOrThrow({ where: { nome } }); };
const somaMeses = (d: Date, n: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };

export type NovoLancamento = {
  tipo: TipoLancamento; descricao: string; valor: number; vencimento: Date; competencia?: Date; categoriaId: string; contaId?: string | null;
  fornecedorId?: string | null; funcionarioId?: string | null; pessoa?: string | null; documento?: string | null; observacao?: string | null;
  formaPagamento?: string | null; parcelas?: number; repetirMeses?: number; jaPago?: boolean; origem?: string; compraId?: string | null;
};

/** Cria um lançamento, parcelado (divide o valor) ou recorrente (repete o valor por N meses). */
export async function criarLancamento(d: NovoLancamento, usuarioId: string | null) {
  if (d.valor <= 0) throw new ErroNegocio('Informe um valor maior que zero.');
  const parcelas = Math.max(1, Math.min(d.parcelas ?? 1, 60));
  const repetir = Math.max(1, Math.min(d.repetirMeses ?? 1, 60));
  if (parcelas > 1 && repetir > 1) throw new ErroNegocio('Escolha parcelar ou repetir, não os dois.');
  const n = Math.max(parcelas, repetir);
  const grupo = n > 1 ? crypto.randomUUID() : null;
  const base = Math.floor(d.valor / parcelas);
  const itens = Array.from({ length: n }, (_, i) => {
    const valor = parcelas > 1 ? (i === n - 1 ? d.valor - base * (n - 1) : base) : d.valor;
    const venc = somaMeses(d.vencimento, i);
    return {
      tipo: d.tipo, descricao: n > 1 ? `${d.descricao} (${i + 1}/${n})` : d.descricao, valor, vencimento: venc, competencia: d.competencia && i === 0 ? d.competencia : venc,
      categoriaId: d.categoriaId, contaId: d.contaId ?? null, fornecedorId: d.fornecedorId ?? null, funcionarioId: d.funcionarioId ?? null, pessoa: d.pessoa ?? null,
      documento: d.documento ?? null, observacao: d.observacao ?? null, formaPagamento: d.formaPagamento ?? null, grupoParcelas: grupo, parcela: n > 1 ? i + 1 : null,
      totalParcelas: n > 1 ? n : null, origem: d.origem ?? 'manual', compraId: d.compraId ?? null, criadoPor: usuarioId,
      ...(d.jaPago && i === 0 ? { status: 'PAGO' as const, pagoEm: venc, valorPago: valor } : {}),
    };
  });
  await db.lancamento.createMany({ data: itens });
  await auditar('financeiro.lancamento', { usuarioId, detalhes: { tipo: d.tipo, descricao: d.descricao, valor: d.valor, n } });
}

export async function baixarLancamento(id: string, d: { pagoEm: Date; valorPago: number; contaId?: string | null; formaPagamento?: string | null }, usuarioId: string) {
  const l = await db.lancamento.findUnique({ where: { id } });
  if (!l) throw new ErroNegocio('Lançamento não encontrado.', 404);
  if (l.status !== 'ABERTO') throw new ErroNegocio('Este lançamento não está em aberto.');
  await db.lancamento.update({ where: { id }, data: { status: 'PAGO', pagoEm: d.pagoEm, valorPago: d.valorPago, contaId: d.contaId ?? l.contaId, formaPagamento: d.formaPagamento ?? l.formaPagamento } });
  await auditar('financeiro.baixa', { usuarioId, alvo: id, detalhes: { valor: d.valorPago } });
}

export async function reabrirLancamento(id: string, usuarioId: string) {
  await db.lancamento.update({ where: { id }, data: { status: 'ABERTO', pagoEm: null, valorPago: null } });
  await auditar('financeiro.estorno', { usuarioId, alvo: id });
}

export async function cancelarLancamento(id: string, usuarioId: string) {
  await db.lancamento.update({ where: { id }, data: { status: 'CANCELADO' } });
  await auditar('financeiro.cancelado', { usuarioId, alvo: id });
}

const STATUS_VENDA = { notIn: ['CANCELADO', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_RECEITA'] as ('CANCELADO' | 'AGUARDANDO_PAGAMENTO' | 'AGUARDANDO_RECEITA')[] };

/** Resumo do período: vendas, DRE gerencial (competência), fluxo de caixa (pagamentos) e posição de contas. */
export async function resumoFinanceiro(inicio: Date, fim: Date) {
  await garantirPlanoPadrao();
  const agora = new Date();
  const em7 = new Date(agora.getTime() + 7 * 86_400_000);
  const [vendas, cmv, porGrupo, pagos, abertos, contas, vendasDia] = await Promise.all([
    db.pedido.aggregate({ where: { status: STATUS_VENDA, criadoEm: { gte: inicio, lt: fim } }, _sum: { total: true, subtotal: true, descontoPromocoes: true, descontoCupom: true, frete: true }, _count: true }),
    db.$queryRaw<{ cmv: bigint | null }[]>`SELECT SUM(i."custoUnitario" * i.quantidade) AS cmv FROM "PedidoItem" i JOIN "Pedido" p ON p.id = i."pedidoId" WHERE p.status NOT IN ('CANCELADO','AGUARDANDO_PAGAMENTO','AGUARDANDO_RECEITA') AND p."criadoEm" >= ${inicio} AND p."criadoEm" < ${fim}`,
    db.$queryRaw<{ grupo: string; tipo: string; categoria: string; total: bigint }[]>`SELECT c.grupo, l.tipo::text AS tipo, c.nome AS categoria, SUM(COALESCE(l."valorPago", l.valor)) AS total FROM "Lancamento" l JOIN "CategoriaFinanceira" c ON c.id = l."categoriaId" WHERE l.status <> 'CANCELADO' AND l.competencia >= ${inicio} AND l.competencia < ${fim} GROUP BY 1,2,3`,
    db.lancamento.findMany({ where: { status: 'PAGO', pagoEm: { gte: inicio, lt: fim } }, select: { tipo: true, valorPago: true, valor: true, pagoEm: true } }),
    db.lancamento.findMany({ where: { status: 'ABERTO', vencimento: { lt: em7 } }, orderBy: { vencimento: 'asc' }, take: 50, select: { id: true, tipo: true, descricao: true, valor: true, vencimento: true, pessoa: true, fornecedor: { select: { nomeFantasia: true } }, funcionario: { select: { nome: true } } } }),
    db.$queryRaw<{ id: string; nome: string; tipo: string; saldo: bigint }[]>`SELECT c.id, c.nome, c.tipo, c."saldoInicial" + COALESCE(SUM(CASE WHEN l.tipo = 'RECEITA' THEN COALESCE(l."valorPago", l.valor) ELSE -COALESCE(l."valorPago", l.valor) END) FILTER (WHERE l.status = 'PAGO'), 0) AS saldo FROM "ContaFinanceira" c LEFT JOIN "Lancamento" l ON l."contaId" = c.id WHERE c.ativa GROUP BY c.id ORDER BY c.nome`,
    db.$queryRaw<{ dia: Date; total: bigint }[]>`SELECT date_trunc('day', "criadoEm" AT TIME ZONE 'America/Sao_Paulo') AS dia, SUM(total) AS total FROM "Pedido" WHERE status NOT IN ('CANCELADO','AGUARDANDO_PAGAMENTO','AGUARDANDO_RECEITA') AND ("metodoPagamento" IS NULL OR "metodoPagamento" NOT IN ('CREDIARIO','CONVENIO')) AND "criadoEm" >= ${inicio} AND "criadoEm" < ${fim} GROUP BY 1`,
  ]);
  const receitaVendas = (vendas._sum.subtotal ?? 0) + (vendas._sum.frete ?? 0);
  const descontos = (vendas._sum.descontoPromocoes ?? 0) + (vendas._sum.descontoCupom ?? 0);
  const custoMercadorias = Number(cmv[0]?.cmv ?? 0);
  const linhas = porGrupo.map((g) => ({ grupo: g.grupo, tipo: g.tipo, categoria: g.categoria, total: Number(g.total) }));
  const somaGrupo = (fora: boolean, tipo: string) => linhas.filter((l) => !!GRUPOS[l.grupo]?.fora === fora && l.tipo === tipo).reduce((s, l) => s + l.total, 0);
  const outrasReceitas = somaGrupo(false, 'RECEITA');
  const despesasOperacionais = somaGrupo(false, 'DESPESA');
  const lucroBruto = receitaVendas - descontos - custoMercadorias;
  const resultado = lucroBruto + outrasReceitas - despesasOperacionais;

  // fluxo de caixa diário
  const dias = new Map<string, { entradas: number; saidas: number }>();
  const chave = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  for (let t = inicio.getTime(); t < fim.getTime(); t += 86_400_000) dias.set(chave(new Date(t)), { entradas: 0, saidas: 0 });
  for (const v of vendasDia) { const k = new Date(v.dia).toISOString().slice(0, 10); const d = dias.get(k); if (d) d.entradas += Number(v.total); }
  for (const p of pagos) { const d = dias.get(chave(p.pagoEm!)); if (d) d[p.tipo === 'RECEITA' ? 'entradas' : 'saidas'] += p.valorPago ?? p.valor; }
  const fluxo = [...dias.entries()].map(([dia, v]) => ({ dia, ...v }));

  return {
    vendas: { quantidade: vendas._count, bruto: receitaVendas, descontos, liquido: vendas._sum.total ?? 0 },
    dre: { receitaVendas, descontos, custoMercadorias, lucroBruto, outrasReceitas, despesasOperacionais, resultado, linhas, margem: receitaVendas ? resultado / (receitaVendas - descontos || 1) : 0 },
    fluxo, abertos,
    contas: contas.map((c) => ({ ...c, saldo: Number(c.saldo) })),
    totaisAbertos: {
      pagarVencido: abertos.filter((a) => a.tipo === 'DESPESA' && a.vencimento < agora).reduce((s, a) => s + a.valor, 0),
      receberVencido: abertos.filter((a) => a.tipo === 'RECEITA' && a.vencimento < agora).reduce((s, a) => s + a.valor, 0),
      pagar7: abertos.filter((a) => a.tipo === 'DESPESA' && a.vencimento >= agora).reduce((s, a) => s + a.valor, 0),
      receber7: abertos.filter((a) => a.tipo === 'RECEITA' && a.vencimento >= agora).reduce((s, a) => s + a.valor, 0),
    },
  };
}

/** Gera (uma vez por mês) as contas a pagar da folha: salário + benefícios + ocorrências do mês. */
export async function gerarFolha(mesIso: string, usuarioId: string) {
  if (!/^\d{4}-\d{2}$/.test(mesIso)) throw new ErroNegocio('Mês inválido.');
  const inicio = new Date(`${mesIso}-01T00:00:00-03:00`);
  const fim = somaMeses(inicio, 1);
  const [salarios, beneficios] = await Promise.all([categoriaPorNome('Salários'), categoriaPorNome('Benefícios (VT, VR)')]);
  const funcs = await db.funcionario.findMany({ where: { ativo: true, admissao: { lt: fim }, OR: [{ demissao: null }, { demissao: { gte: inicio } }] }, include: { ocorrencias: { where: { inicio: { gte: inicio, lt: fim } } } } });
  const venc = new Date(fim.getTime() + 4 * 86_400_000); // 5º dia do mês seguinte
  let criados = 0;
  for (const f of funcs) {
    const ja = await db.lancamento.count({ where: { funcionarioId: f.id, origem: 'folha', competencia: inicio } });
    if (ja) continue;
    const mais = f.ocorrencias.filter((o) => ['HORA_EXTRA', 'BONUS'].includes(o.tipo)).reduce((s, o) => s + (o.valor ?? 0), 0);
    const menos = f.ocorrencias.filter((o) => ['DESCONTO', 'FALTA', 'ADIANTAMENTO'].includes(o.tipo)).reduce((s, o) => s + (o.valor ?? 0), 0);
    const liquido = Math.max(0, f.salario + mais - menos);
    const itens = [{ categoriaId: salarios.id, descricao: `Folha ${mesIso.split('-').reverse().join('/')} · ${f.nome}`, valor: liquido }];
    const benef = f.valeTransporte + f.valeRefeicao + f.outrosBeneficios;
    if (benef > 0) itens.push({ categoriaId: beneficios.id, descricao: `Benefícios ${mesIso.split('-').reverse().join('/')} · ${f.nome}`, valor: benef });
    for (const it of itens) {
      if (it.valor <= 0) continue;
      await db.lancamento.create({ data: { tipo: 'DESPESA', ...it, vencimento: venc, competencia: inicio, funcionarioId: f.id, pessoa: f.nome, origem: 'folha', criadoPor: usuarioId } });
      criados++;
    }
  }
  await auditar('financeiro.folha', { usuarioId, detalhes: { mes: mesIso, criados } });
  return criados;
}

/** Gera contas a pagar dos repasses dos motoboys no período (uma por motoboy). */
export async function gerarRepasses(inicio: Date, fim: Date, usuarioId: string) {
  const cat = await categoriaPorNome('Entregas (motoboys)');
  const mapa = await repasses(inicio, fim);
  const motoboys = await db.motoboy.findMany({ where: { id: { in: [...mapa.keys()] } }, select: { id: true, nome: true } });
  const ref = `${inicio.toISOString().slice(0, 10)}_${fim.toISOString().slice(0, 10)}`;
  let n = 0;
  for (const m of motoboys) {
    const r = mapa.get(m.id)!;
    if (!r.repasse) continue;
    if (await db.lancamento.count({ where: { origem: 'repasse', documento: `${m.id}:${ref}` } })) continue;
    await db.lancamento.create({ data: { tipo: 'DESPESA', descricao: `Repasse de entregas · ${m.nome} (${r.entregas})`, valor: r.repasse, vencimento: new Date(), competencia: inicio, categoriaId: cat.id, pessoa: m.nome, origem: 'repasse', documento: `${m.id}:${ref}`, criadoPor: usuarioId } });
    n++;
  }
  return n;
}

/** Compra recebida vira conta a pagar ao fornecedor. */
export async function contaDaCompra(compra: { id: string; numero: number; total: number; fornecedorId: string; notaFiscal?: string | null }, usuarioId: string, prazoDias = 28) {
  if (await db.lancamento.count({ where: { compraId: compra.id } })) return;
  const cat = await categoriaPorNome('Compra de mercadorias');
  await db.lancamento.create({ data: { tipo: 'DESPESA', descricao: `Compra #${compra.numero}`, valor: compra.total, vencimento: new Date(Date.now() + prazoDias * 86_400_000), competencia: new Date(), categoriaId: cat.id, fornecedorId: compra.fornecedorId, documento: compra.notaFiscal ?? null, compraId: compra.id, origem: 'compra', criadoPor: usuarioId } });
}
