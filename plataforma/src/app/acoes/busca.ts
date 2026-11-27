'use server';
import { sugestoesBusca } from '@/server/catalogo';

export async function sugerir(q: string) {
  const termo = String(q ?? '').slice(0, 60);
  const r = await sugestoesBusca(termo);
  return r.map((p) => ({ slug: p.slug, nome: p.nome, icone: p.icone, preco: p.oferta.preco, marca: p.marca.nome }));
}

/** Terminal de consulta de preço (totem na loja): bipa o código de barras e mostra o preço. */
export async function consultarPreco(codigo: string) {
  const { limitarTaxa, ipAtual } = await import('@/server/auth');
  const { db } = await import('@/server/db');
  const { calcularOferta, promocoesAtivas } = await import('@/server/precos');
  const { normalizar } = await import('@/lib/texto');
  limitarTaxa(`preco:${await ipAtual()}`, 120, 60_000);
  const t = String(codigo ?? '').trim().slice(0, 40);
  if (t.length < 3) return null;
  const digitos = t.replace(/\D/g, '');
  const p = await db.produto.findFirst({
    where: { ativo: true, OR: [...(digitos.length >= 8 ? [{ ean: digitos }] : []), { sku: t.toUpperCase() }, { busca: { contains: normalizar(t) } }] },
    orderBy: { vendas: 'desc' },
    select: { id: true, nome: true, preco: true, precoDe: true, categoriaId: true, marcaId: true, icone: true, classificacao: true, apresentacao: true, categoria: { select: { paiId: true } }, marca: { select: { nome: true } } },
  });
  if (!p) return null;
  const o = calcularOferta({ id: p.id, preco: p.preco, precoDe: p.precoDe, categoriaId: p.categoriaId, marcaId: p.marcaId, categoriaPaiId: p.categoria.paiId }, await promocoesAtivas());
  return { nome: p.nome, marca: p.marca.nome, apresentacao: p.apresentacao, icone: p.icone, classificacao: p.classificacao, preco: o.preco, precoDe: o.precoDe, selo: o.selo };
}
