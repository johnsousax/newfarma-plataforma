import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResultadoBusca } from '@/components/loja/ResultadoBusca';
import { EsqueletoListagem } from '@/components/loja/Esqueletos';

export const metadata: Metadata = { title: 'Buscar produtos' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/busca'>['searchParams'] }) {
  return <ResultadoBusca base="/busca" sp={await searchParams} />;
}

export default function Busca(props: PageProps<'/busca'>) {
  return <Suspense fallback={<EsqueletoListagem />}><Conteudo searchParams={props.searchParams} /></Suspense>;
}
