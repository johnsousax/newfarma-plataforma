import 'server-only';
import { cache } from 'react';
import { db } from './db';
import { disponibilidade } from './estoque';
import { calcularOferta, promocoesAtivas, type Oferta } from './precos';
import { normalizar } from '@/lib/texto';
import type { Prisma } from '@/generated/prisma/client';
import type { Classificacao } from '@/generated/prisma/enums';

const selecaoCard = {
  id: true, slug: true, nome: true, icone: true, preco: true, precoDe: true, classificacao: true, tipo: true,
  categoriaId: true, marcaId: true, descricaoCurta: true, principioAtivo: true, concentracao: true,
  marca: { select: { nome: true, slug: true } },
  categoria: { select: { paiId: true, nome: true, cor: true, slug: true } },
  imagens: { select: { id: true }, orderBy: { ordem: 'asc' }, take: 1 },
} satisfies Prisma.ProdutoSelect;

type ProdutoCardBruto = Prisma.ProdutoGetPayload<{ select: typeof selecaoCard }>;

export type ProdutoCard = Omit<ProdutoCardBruto, 'preco' | 'precoDe'> & {
  oferta: Oferta;
  disponivel: number;
  nota: number | null;
  avaliacoes: number;
};

/** Enriquece produtos com oferta vigente, estoque disponível e nota média. */
export async function enriquecer(produtos: ProdutoCardBruto[]): Promise<ProdutoCard[]> {
  if (!produtos.length) return [];
  const ids = produtos.map((p) => p.id);
  const [promos, disp, notas] = await Promise.all([
    promocoesAtivas(),
    disponibilidade(ids),
    db.avaliacao.groupBy({ by: ['produtoId'], where: { produtoId: { in: ids }, status: 'APROVADA' }, _avg: { nota: true }, _count: true }),
  ]);
  const mapaNotas = new Map(notas.map((n) => [n.produtoId, n]));
  return produtos.map(({ preco, precoDe, ...p }) => {
    const n = mapaNotas.get(p.id);
    return {
      ...p,
      oferta: calcularOferta({ id: p.id, preco, precoDe, categoriaId: p.categoriaId, marcaId: p.marcaId, categoriaPaiId: p.categoria.paiId }, promos),
      disponivel: disp.get(p.id) ?? 0,
      nota: n?._avg.nota ?? null,
      avaliacoes: n?._count ?? 0,
    };
  });
}

export const categoriasMenu = cache(async () =>
  db.categoria.findMany({ where: { paiId: null }, orderBy: { ordem: 'asc' }, include: { filhas: { orderBy: { ordem: 'asc' } } } }),
);

export type Ordem = 'relevancia' | 'mais-vendidos' | 'menor-preco' | 'maior-preco' | 'nome' | 'lancamentos';
export const ORDENS: Record<Ordem, string> = {
  relevancia: 'Mais relevantes',
  'mais-vendidos': 'Mais vendidos',
  'menor-preco': 'Menor preço',
  'maior-preco': 'Maior preço',
  nome: 'Nome (A–Z)',
  lancamentos: 'Lançamentos',
};

export type FiltrosBusca = {
  q?: string;
  categoria?: string;
  marcas?: string[];
  classificacoes?: Classificacao[];
  generico?: boolean;
  precoMin?: number;
  precoMax?: number;
  emEstoque?: boolean;
  ordem?: Ordem;
  pagina?: number;
  porPagina?: number;
};

export async function buscar(f: FiltrosBusca) {
  const porPagina = Math.min(f.porPagina ?? 24, 60);
  const pagina = Math.max(1, f.pagina ?? 1);
  const base: Prisma.ProdutoWhereInput[] = [{ ativo: true }];

  if (f.q) {
    const termos = normalizar(f.q).split(' ').filter((t) => t.length >= 2).slice(0, 6);
    for (const t of termos) base.push({ busca: { contains: t } });
  }

  let categoria = null;
  if (f.categoria) {
    categoria = await db.categoria.findUnique({ where: { slug: f.categoria }, include: { filhas: true, pai: true } });
    if (categoria) base.push({ categoriaId: { in: [categoria.id, ...categoria.filhas.map((c) => c.id)] } });
  }
  if (f.classificacoes?.length) base.push({ classificacao: { in: f.classificacoes } });
  if (f.generico) base.push({ tipo: 'GENERICO' });
  if (f.precoMin) base.push({ preco: { gte: f.precoMin } });
  if (f.precoMax) base.push({ preco: { lte: f.precoMax } });
  if (f.emEstoque) base.push({ lotes: { some: { validade: { gt: new Date() }, quantidade: { gt: 0 } } } });

  // Facetas de marca calculadas sem o próprio filtro de marca (padrão de e-commerce)
  const whereSemMarca: Prisma.ProdutoWhereInput = { AND: base };
  const where: Prisma.ProdutoWhereInput = f.marcas?.length ? { AND: [...base, { marca: { slug: { in: f.marcas } } }] } : whereSemMarca;

  const orderBy: Prisma.ProdutoOrderByWithRelationInput[] = (() => {
    switch (f.ordem) {
      case 'menor-preco': return [{ preco: 'asc' }];
      case 'maior-preco': return [{ preco: 'desc' }];
      case 'nome': return [{ nome: 'asc' }];
      case 'lancamentos': return [{ criadoEm: 'desc' }];
      case 'mais-vendidos': return [{ vendas: 'desc' }, { nome: 'asc' }];
      default: return [{ destaque: 'desc' }, { vendas: 'desc' }, { nome: 'asc' }];
    }
  })();

  const [total, brutos, marcasAgg, classAgg] = await Promise.all([
    db.produto.count({ where }),
    db.produto.findMany({ where, orderBy, skip: (pagina - 1) * porPagina, take: porPagina, select: selecaoCard }),
    db.produto.groupBy({ by: ['marcaId'], where: whereSemMarca, _count: true }),
    db.produto.groupBy({ by: ['classificacao'], where, _count: true }),
  ]);
  const marcas = await db.marca.findMany({ where: { id: { in: marcasAgg.map((m) => m.marcaId) } }, orderBy: { nome: 'asc' } });
  const contagem = new Map(marcasAgg.map((m) => [m.marcaId, m._count]));

  return {
    produtos: await enriquecer(brutos),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    categoria,
    facetas: {
      marcas: marcas.map((m) => ({ slug: m.slug, nome: m.nome, total: contagem.get(m.id) ?? 0 })),
      classificacoes: classAgg.map((c) => ({ valor: c.classificacao, total: c._count })),
    },
  };
}

export async function vitrine(tipo: 'destaques' | 'mais-vendidos' | 'ofertas' | 'categoria', opcoes: { categoriaSlug?: string; limite?: number } = {}) {
  const limite = opcoes.limite ?? 12;
  if (tipo === 'ofertas') {
    const promos = await promocoesAtivas();
    const where: Prisma.ProdutoWhereInput = {
      ativo: true,
      OR: [
        { precoDe: { not: null } },
        { promocoes: { some: { id: { in: promos.map((p) => p.id) } } } },
        { categoriaId: { in: promos.map((p) => p.categoriaId).filter((x): x is string => !!x) } },
        { marcaId: { in: promos.map((p) => p.marcaId).filter((x): x is string => !!x) } },
      ],
    };
    const brutos = await db.produto.findMany({ where, take: limite * 2, orderBy: { vendas: 'desc' }, select: selecaoCard });
    return (await enriquecer(brutos)).filter((p) => p.oferta.selo && p.disponivel > 0).slice(0, limite);
  }
  const where: Prisma.ProdutoWhereInput = { ativo: true };
  if (tipo === 'destaques') where.destaque = true;
  if (tipo === 'categoria' && opcoes.categoriaSlug) where.categoria = { OR: [{ slug: opcoes.categoriaSlug }, { pai: { slug: opcoes.categoriaSlug } }] };
  const brutos = await db.produto.findMany({ where, take: limite, orderBy: tipo === 'destaques' ? { nome: 'asc' } : { vendas: 'desc' }, select: selecaoCard });
  return enriquecer(brutos);
}

export async function produtoPorSlug(slug: string) {
  const p = await db.produto.findUnique({
    where: { slug },
    include: { marca: true, categoria: { include: { pai: true } }, imagens: { select: { id: true }, orderBy: { ordem: 'asc' } } },
  });
  if (!p || !p.ativo) return null;
  const [card] = await enriquecer([{ ...p, imagens: [], marca: { nome: p.marca.nome, slug: p.marca.slug }, categoria: { paiId: p.categoria.paiId, nome: p.categoria.nome, cor: p.categoria.cor, slug: p.categoria.slug } }]);
  return { ...p, oferta: card.oferta, disponivel: card.disponivel, nota: card.nota, totalAvaliacoes: card.avaliacoes };
}

/** Mesmo princípio ativo e concentração: referência, genéricos e similares (intercambialidade). */
export async function equivalentes(p: { id: string; principioAtivo: string | null; concentracao: string | null }) {
  if (!p.principioAtivo) return [];
  const brutos = await db.produto.findMany({
    where: { ativo: true, id: { not: p.id }, principioAtivo: { equals: p.principioAtivo, mode: 'insensitive' }, ...(p.concentracao ? { concentracao: p.concentracao } : {}) },
    select: selecaoCard,
    orderBy: { preco: 'asc' },
    take: 8,
  });
  return enriquecer(brutos);
}

/** "Quem comprou, levou também": coocorrência em pedidos, com fallback para a categoria. */
export async function compradosJuntos(produtoId: string, categoriaId: string) {
  const linhas = await db.$queryRaw<{ produtoId: string; n: bigint }[]>`
    SELECT b."produtoId", COUNT(*) AS n FROM "PedidoItem" a
    JOIN "PedidoItem" b ON a."pedidoId" = b."pedidoId" AND b."produtoId" <> a."produtoId"
    WHERE a."produtoId" = ${produtoId}
    GROUP BY b."produtoId" ORDER BY n DESC LIMIT 8`;
  let ids = linhas.map((l) => l.produtoId);
  if (ids.length < 4) {
    const extra = await db.produto.findMany({ where: { ativo: true, categoriaId, id: { notIn: [produtoId, ...ids] } }, orderBy: { vendas: 'desc' }, take: 8 - ids.length, select: { id: true } });
    ids = [...ids, ...extra.map((e) => e.id)];
  }
  const brutos = await db.produto.findMany({ where: { id: { in: ids }, ativo: true }, select: selecaoCard });
  return (await enriquecer(brutos)).filter((p) => p.classificacao !== 'CONTROLADO');
}

export async function avaliacoesDoProduto(produtoId: string) {
  const [lista, dist] = await Promise.all([
    db.avaliacao.findMany({ where: { produtoId, status: 'APROVADA' }, orderBy: { criadoEm: 'desc' }, take: 20, include: { usuario: { select: { nome: true } } } }),
    db.avaliacao.groupBy({ by: ['nota'], where: { produtoId, status: 'APROVADA' }, _count: true }),
  ]);
  return {
    lista: lista.map((a) => ({ ...a, autor: a.usuario.nome.split(' ')[0] })),
    distribuicao: [5, 4, 3, 2, 1].map((n) => ({ nota: n, total: dist.find((d) => d.nota === n)?._count ?? 0 })),
  };
}

export async function sugestoesBusca(q: string) {
  const t = normalizar(q);
  if (t.length < 2) return [];
  const brutos = await db.produto.findMany({ where: { ativo: true, busca: { contains: t } }, orderBy: [{ vendas: 'desc' }], take: 6, select: selecaoCard });
  return enriquecer(brutos);
}
