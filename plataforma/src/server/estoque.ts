import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { db, type Tx } from './db';
import { ErroNegocio } from './erros';

export type Alocacao = { loteId: string; codigo: string; validade: string; quantidade: number };

/** Unidades disponíveis (quantidade − reservado, lotes não vencidos) por produto. */
export async function disponibilidade(produtoIds: string[], lojaId?: string) {
  if (!produtoIds.length) return new Map<string, number>();
  const linhas = await db.$queryRaw<{ produtoId: string; disp: bigint }[]>`
    SELECT l."produtoId", COALESCE(SUM(l.quantidade - l.reservado), 0) AS disp
    FROM "Lote" l JOIN "Loja" j ON j.id = l."lojaId"
    WHERE l."produtoId" = ANY(${produtoIds}::text[]) AND l.validade > now() AND j.ativa
      ${lojaId ? Prisma.sql`AND l."lojaId" = ${lojaId}` : Prisma.empty}
    GROUP BY l."produtoId"`;
  const mapa = new Map<string, number>(produtoIds.map((id) => [id, 0]));
  for (const l of linhas) mapa.set(l.produtoId, Number(l.disp));
  return mapa;
}

/** Disponibilidade de um conjunto de itens em cada loja (para escolher quem atende o pedido). */
export async function disponibilidadePorLoja(produtoIds: string[]) {
  if (!produtoIds.length) return new Map<string, Map<string, number>>();
  const linhas = await db.$queryRaw<{ lojaId: string; produtoId: string; disp: bigint }[]>`
    SELECT l."lojaId", l."produtoId", COALESCE(SUM(l.quantidade - l.reservado), 0) AS disp
    FROM "Lote" l WHERE l."produtoId" = ANY(${produtoIds}::text[]) AND l.validade > now()
    GROUP BY l."lojaId", l."produtoId"`;
  const porLoja = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    if (!porLoja.has(l.lojaId)) porLoja.set(l.lojaId, new Map());
    porLoja.get(l.lojaId)!.set(l.produtoId, Number(l.disp));
  }
  return porLoja;
}

/**
 * Reserva estoque FEFO (primeiro que vence, primeiro que sai) com bloqueio de linha
 * (SELECT … FOR UPDATE): dois pedidos simultâneos nunca reservam a mesma unidade.
 * Tudo-ou-nada: se faltar qualquer item, lança erro e a transação é desfeita.
 */
export async function reservar(tx: Tx, lojaId: string, itens: { produtoId: string; quantidade: number; nome?: string }[], ctx: { pedidoId?: string; usuarioId?: string | null }) {
  const ids = [...new Set(itens.map((i) => i.produtoId))];
  const lotes = await tx.$queryRaw<{ id: string; produtoId: string; codigo: string; validade: Date; quantidade: number; reservado: number }[]>`
    SELECT id, "produtoId", codigo, validade, quantidade, reservado FROM "Lote"
    WHERE "produtoId" = ANY(${ids}::text[]) AND "lojaId" = ${lojaId} AND validade > now() AND quantidade - reservado > 0
    ORDER BY validade ASC, "criadoEm" ASC
    FOR UPDATE`;
  const resultado = new Map<string, Alocacao[]>();
  for (const item of itens) {
    let falta = item.quantidade;
    const aloc: Alocacao[] = [];
    for (const l of lotes.filter((x) => x.produtoId === item.produtoId)) {
      if (falta <= 0) break;
      const livre = l.quantidade - l.reservado;
      if (livre <= 0) continue;
      const q = Math.min(livre, falta);
      l.reservado += q;
      falta -= q;
      aloc.push({ loteId: l.id, codigo: l.codigo, validade: l.validade.toISOString(), quantidade: q });
    }
    if (falta > 0) throw new ErroNegocio(`Estoque insuficiente para "${item.nome ?? 'produto'}". Disponível: ${item.quantidade - falta}.`, 409);
    resultado.set(item.produtoId, aloc);
  }
  for (const [produtoId, aloc] of resultado) {
    for (const a of aloc) {
      await tx.lote.update({ where: { id: a.loteId }, data: { reservado: { increment: a.quantidade } } });
      await tx.movimentoEstoque.create({ data: { produtoId, lojaId, loteId: a.loteId, tipo: 'RESERVA', quantidade: a.quantidade, pedidoId: ctx.pedidoId, usuarioId: ctx.usuarioId ?? null } });
    }
  }
  return resultado;
}

type ItemAlocado = { produtoId: string; alocacoes: Prisma.JsonValue | Prisma.InputJsonValue };
const alocs = (i: ItemAlocado) => (Array.isArray(i.alocacoes) ? (i.alocacoes as unknown as Alocacao[]) : []);

/** Devolve ao estoque livre o que estava reservado (cancelamento). */
export async function liberar(tx: Tx, lojaId: string, itens: ItemAlocado[], ctx: { pedidoId: string; usuarioId?: string | null }) {
  for (const item of itens) {
    for (const a of alocs(item)) {
      await tx.lote.update({ where: { id: a.loteId }, data: { reservado: { decrement: a.quantidade } } });
      await tx.movimentoEstoque.create({ data: { produtoId: item.produtoId, lojaId, loteId: a.loteId, tipo: 'LIBERACAO', quantidade: a.quantidade, pedidoId: ctx.pedidoId, usuarioId: ctx.usuarioId ?? null } });
    }
  }
}

/** Baixa definitiva na dispensação: sai do físico e da reserva. */
export async function baixar(tx: Tx, lojaId: string, itens: ItemAlocado[], ctx: { pedidoId: string; usuarioId?: string | null }) {
  for (const item of itens) {
    for (const a of alocs(item)) {
      await tx.lote.update({ where: { id: a.loteId }, data: { quantidade: { decrement: a.quantidade }, reservado: { decrement: a.quantidade } } });
      await tx.movimentoEstoque.create({ data: { produtoId: item.produtoId, lojaId, loteId: a.loteId, tipo: 'SAIDA_VENDA', quantidade: a.quantidade, pedidoId: ctx.pedidoId, usuarioId: ctx.usuarioId ?? null } });
    }
  }
}

/** Entrada de mercadoria (compra, devolução). Soma no lote existente ou cria um novo. */
export async function entrada(tx: Tx, d: { lojaId: string; produtoId: string; codigo: string; validade: Date; quantidade: number; custoUnit?: number | null; usuarioId?: string | null; compraId?: string; motivo?: string }) {
  if (d.quantidade <= 0) throw new ErroNegocio('Quantidade deve ser positiva.');
  if (d.validade <= new Date()) throw new ErroNegocio(`O lote ${d.codigo} já está vencido.`);
  const lote = await tx.lote.upsert({
    where: { produtoId_lojaId_codigo: { produtoId: d.produtoId, lojaId: d.lojaId, codigo: d.codigo } },
    create: { produtoId: d.produtoId, lojaId: d.lojaId, codigo: d.codigo, validade: d.validade, quantidade: d.quantidade, custoUnit: d.custoUnit ?? null },
    update: { quantidade: { increment: d.quantidade }, ...(d.custoUnit ? { custoUnit: d.custoUnit } : {}) },
  });
  await tx.movimentoEstoque.create({ data: { produtoId: d.produtoId, lojaId: d.lojaId, loteId: lote.id, tipo: 'ENTRADA', quantidade: d.quantidade, usuarioId: d.usuarioId ?? null, compraId: d.compraId, motivo: d.motivo ?? 'Entrada de mercadoria' } });
  if (d.custoUnit) {
    // custo médio ponderado simples
    const p = await tx.produto.findUniqueOrThrow({ where: { id: d.produtoId }, select: { custo: true } });
    const custo = p.custo ? Math.round((p.custo + d.custoUnit) / 2) : d.custoUnit;
    await tx.produto.update({ where: { id: d.produtoId }, data: { custo } });
  }
  return lote;
}

export type TipoAlerta = 'RUPTURA' | 'REPOSICAO' | 'VENCIDO' | 'VENCENDO';
export type Alerta = { tipo: TipoAlerta; produtoId: string; produto: string; sku: string; lojaId: string; loja: string; detalhe: string; quantidade: number };

/** Alertas calculados em tempo real a partir dos lotes (sem estado a ficar desatualizado). */
export async function alertas(lojaId?: string): Promise<Alerta[]> {
  const filtroLoja = lojaId ? Prisma.sql`AND j.id = ${lojaId}` : Prisma.empty;
  const niveis = await db.$queryRaw<{ produtoId: string; nome: string; sku: string; estoqueMinimo: number; lojaId: string; loja: string; disp: bigint }[]>`
    SELECT p.id AS "produtoId", p.nome, p.sku, p."estoqueMinimo", j.id AS "lojaId", j.nome AS loja,
      COALESCE(SUM(CASE WHEN l.validade > now() THEN l.quantidade - l.reservado ELSE 0 END), 0) AS disp
    FROM "Produto" p CROSS JOIN "Loja" j
    LEFT JOIN "Lote" l ON l."produtoId" = p.id AND l."lojaId" = j.id
    WHERE p.ativo AND j.ativa ${filtroLoja}
    GROUP BY p.id, j.id`;
  const out: Alerta[] = [];
  for (const n of niveis) {
    const disp = Number(n.disp);
    if (disp <= 0) out.push({ tipo: 'RUPTURA', produtoId: n.produtoId, produto: n.nome, sku: n.sku, lojaId: n.lojaId, loja: n.loja, detalhe: 'Sem estoque disponível', quantidade: 0 });
    else if (disp < n.estoqueMinimo) out.push({ tipo: 'REPOSICAO', produtoId: n.produtoId, produto: n.nome, sku: n.sku, lojaId: n.lojaId, loja: n.loja, detalhe: `${disp} un. (mínimo ${n.estoqueMinimo})`, quantidade: disp });
  }
  const em60 = new Date(Date.now() + 60 * 86_400_000);
  const lotes = await db.lote.findMany({
    where: { quantidade: { gt: 0 }, validade: { lte: em60 }, ...(lojaId ? { lojaId } : {}) },
    include: { produto: { select: { nome: true, sku: true } }, loja: { select: { nome: true } } },
    orderBy: { validade: 'asc' },
  });
  const agora = new Date();
  for (const l of lotes) {
    const dias = Math.ceil((l.validade.getTime() - agora.getTime()) / 86_400_000);
    out.push({
      tipo: dias <= 0 ? 'VENCIDO' : 'VENCENDO', produtoId: l.produtoId, produto: l.produto.nome, sku: l.produto.sku, lojaId: l.lojaId, loja: l.loja.nome,
      detalhe: dias <= 0 ? `Lote ${l.codigo} vencido — retirar da venda` : `Lote ${l.codigo} vence em ${dias} dia(s)`, quantidade: l.quantidade,
    });
  }
  const ordem: Record<TipoAlerta, number> = { VENCIDO: 0, RUPTURA: 1, VENCENDO: 2, REPOSICAO: 3 };
  return out.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
}
