import type { MetadataRoute } from 'next';
import { cacheLife } from 'next/cache';
import { db } from '@/server/db';
import { FARMACIA } from '@/lib/farmacia';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheLife('hours');
  const [produtos, categorias] = await Promise.all([
    db.produto.findMany({ where: { ativo: true }, select: { slug: true, atualizadoEm: true } }),
    db.categoria.findMany({ select: { slug: true } }),
  ]);
  const base = FARMACIA.site;
  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/ofertas`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/assistente`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/lojas`, changeFrequency: 'monthly', priority: 0.5 },
    ...categorias.map((c) => ({ url: `${base}/categoria/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...produtos.map((p) => ({ url: `${base}/produto/${p.slug}`, lastModified: p.atualizadoEm, changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
