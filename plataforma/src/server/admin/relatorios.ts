import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { db } from '../db';

const VALIDOS = Prisma.sql`p.status NOT IN ('CANCELADO', 'AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO')`;
const filtroLoja = (lojaId?: string | null) => (lojaId ? Prisma.sql`AND p."lojaId" = ${lojaId}` : Prisma.empty);

export type Periodo = { de: Date; ate: Date; lojaId?: string | null };

export function periodoDe(dias: number, lojaId?: string | null): Periodo {
  const ate = new Date();
  const de = new Date(ate.getTime() - dias * 86_400_000);
  de.setHours(0, 0, 0, 0);
  return { de, ate, lojaId };
}

export async function kpis({ de, ate, lojaId }: Periodo) {
  const duracao = ate.getTime() - de.getTime();
  const deAnt = new Date(de.getTime() - duracao);
  const q = (a: Date, b: Date) => db.$queryRaw<{ receita: bigint | null; pedidos: bigint; clientes: bigint; custo: bigint | null }[]>`
    SELECT SUM(p.total) AS receita, COUNT(*) AS pedidos, COUNT(DISTINCT p."usuarioId") AS clientes,
      (SELECT SUM(i."custoUnitario" * i.quantidade) FROM "PedidoItem" i JOIN "Pedido" p2 ON p2.id = i."pedidoId"
        WHERE p2."criadoEm" >= ${a} AND p2."criadoEm" < ${b} AND p2.status NOT IN ('CANCELADO','AGUARDANDO_RECEITA','AGUARDANDO_PAGAMENTO') ${lojaId ? Prisma.sql`AND p2."lojaId" = ${lojaId}` : Prisma.empty}) AS custo
    FROM "Pedido" p WHERE p."criadoEm" >= ${a} AND p."criadoEm" < ${b} AND ${VALIDOS} ${filtroLoja(lojaId)}`;
  const [[atual], [anterior], novos] = await Promise.all([
    q(de, ate), q(deAnt, de),
    db.usuario.count({ where: { papel: 'CLIENTE', criadoEm: { gte: de, lt: ate } } }),
  ]);
  const n = (x: bigint | null) => Number(x ?? 0);
  const receita = n(atual.receita), pedidos = n(atual.pedidos);
  const receitaAnt = n(anterior.receita), pedidosAnt = n(anterior.pedidos);
  const varr = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
  return {
    receita, pedidos, ticket: pedidos ? Math.round(receita / pedidos) : 0, clientes: n(atual.clientes), novosClientes: novos,
    margem: receita ? ((receita - n(atual.custo)) / receita) * 100 : 0,
    varReceita: varr(receita, receitaAnt), varPedidos: varr(pedidos, pedidosAnt),
    varTicket: varr(pedidos ? receita / pedidos : 0, pedidosAnt ? receitaAnt / pedidosAnt : 0),
  };
}

export async function vendasPorDia({ de, ate, lojaId }: Periodo) {
  const linhas = await db.$queryRaw<{ dia: Date; receita: bigint; pedidos: bigint }[]>`
    SELECT date_trunc('day', p."criadoEm" AT TIME ZONE 'America/Sao_Paulo') AS dia, SUM(p.total) AS receita, COUNT(*) AS pedidos
    FROM "Pedido" p WHERE p."criadoEm" >= ${de} AND p."criadoEm" < ${ate} AND ${VALIDOS} ${filtroLoja(lojaId)}
    GROUP BY 1 ORDER BY 1`;
  const mapa = new Map(linhas.map((l) => [l.dia.toISOString().slice(0, 10), l]));
  const out: { dia: string; receita: number; pedidos: number }[] = [];
  for (let d = new Date(de); d < ate; d = new Date(d.getTime() + 86_400_000)) {
    const k = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).toISOString().slice(0, 10);
    const l = mapa.get(k);
    if (!out.find((o) => o.dia === k)) out.push({ dia: k, receita: Number(l?.receita ?? 0), pedidos: Number(l?.pedidos ?? 0) });
  }
  return out;
}

export async function topProdutos({ de, ate, lojaId }: Periodo, limite = 10) {
  const linhas = await db.$queryRaw<{ produtoId: string; nome: string; quantidade: bigint; receita: bigint; custo: bigint | null }[]>`
    SELECT i."produtoId", MAX(i.nome) AS nome, SUM(i.quantidade) AS quantidade, SUM(i.total) AS receita, SUM(i."custoUnitario" * i.quantidade) AS custo
    FROM "PedidoItem" i JOIN "Pedido" p ON p.id = i."pedidoId"
    WHERE p."criadoEm" >= ${de} AND p."criadoEm" < ${ate} AND ${VALIDOS} ${filtroLoja(lojaId)}
    GROUP BY i."produtoId" ORDER BY receita DESC LIMIT ${limite}`;
  return linhas.map((l) => ({ produtoId: l.produtoId, nome: l.nome, quantidade: Number(l.quantidade), receita: Number(l.receita), margem: Number(l.receita) ? ((Number(l.receita) - Number(l.custo ?? 0)) / Number(l.receita)) * 100 : 0 }));
}

export async function vendasPor(dimensao: 'canal' | 'loja' | 'categoria' | 'pagamento' | 'modalidade', { de, ate, lojaId }: Periodo) {
  const expr = {
    canal: Prisma.sql`p.canal::text`,
    loja: Prisma.sql`(SELECT nome FROM "Loja" WHERE id = p."lojaId")`,
    pagamento: Prisma.sql`COALESCE(p."metodoPagamento"::text, 'N/D')`,
    modalidade: Prisma.sql`p.modalidade::text`,
    categoria: Prisma.empty,
  }[dimensao];
  if (dimensao === 'categoria') {
    const l = await db.$queryRaw<{ rotulo: string; receita: bigint; pedidos: bigint }[]>`
      SELECT COALESCE(cp.nome, c.nome) AS rotulo, SUM(i.total) AS receita, COUNT(DISTINCT p.id) AS pedidos
      FROM "PedidoItem" i JOIN "Pedido" p ON p.id = i."pedidoId" JOIN "Produto" pr ON pr.id = i."produtoId"
      JOIN "Categoria" c ON c.id = pr."categoriaId" LEFT JOIN "Categoria" cp ON cp.id = c."paiId"
      WHERE p."criadoEm" >= ${de} AND p."criadoEm" < ${ate} AND ${VALIDOS} ${filtroLoja(lojaId)}
      GROUP BY 1 ORDER BY receita DESC`;
    return l.map((x) => ({ rotulo: x.rotulo, receita: Number(x.receita), pedidos: Number(x.pedidos) }));
  }
  const l = await db.$queryRaw<{ rotulo: string; receita: bigint; pedidos: bigint }[]>`
    SELECT ${expr} AS rotulo, SUM(p.total) AS receita, COUNT(*) AS pedidos FROM "Pedido" p
    WHERE p."criadoEm" >= ${de} AND p."criadoEm" < ${ate} AND ${VALIDOS} ${filtroLoja(lojaId)}
    GROUP BY 1 ORDER BY receita DESC`;
  return l.map((x) => ({ rotulo: x.rotulo, receita: Number(x.receita), pedidos: Number(x.pedidos) }));
}

/** Curva ABC: A = 80% da receita, B = próximos 15%, C = restante. */
export async function curvaABC(p: Periodo) {
  const todos = await topProdutos(p, 1000);
  const total = todos.reduce((s, x) => s + x.receita, 0) || 1;
  let acum = 0;
  return todos.map((x) => {
    acum += x.receita;
    const pct = (acum / total) * 100;
    return { ...x, participacao: (x.receita / total) * 100, acumulado: pct, classe: pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C' };
  });
}

export async function pedidosPorStatus(lojaId?: string | null) {
  const g = await db.pedido.groupBy({ by: ['status'], where: { ...(lojaId ? { lojaId } : {}), status: { notIn: ['ENTREGUE', 'CANCELADO'] } }, _count: true });
  return Object.fromEntries(g.map((x) => [x.status, x._count])) as Record<string, number>;
}
