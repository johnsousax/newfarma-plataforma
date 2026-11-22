import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { ResultadoBusca } from '@/components/loja/ResultadoBusca';
import { EsqueletoListagem } from '@/components/loja/Esqueletos';

export async function generateMetadata({ params }: PageProps<'/categoria/[slug]'>) {
  const { slug } = await params;
  const c = await db.categoria.findUnique({ where: { slug }, select: { nome: true } });
  return { title: c?.nome ?? 'Categoria' };
}

async function Conteudo({ params, searchParams }: PageProps<'/categoria/[slug]'>) {
  const { slug } = await params;
  const existe = await db.categoria.count({ where: { slug } });
  if (!existe) notFound();
  return <ResultadoBusca base={`/categoria/${slug}`} sp={await searchParams} categoriaSlug={slug} />;
}

export default function Categoria(props: PageProps<'/categoria/[slug]'>) {
  return <Suspense fallback={<EsqueletoListagem />}><Conteudo {...props} /></Suspense>;
}
