import { Suspense } from 'react';
import { connection } from 'next/server';
import { paginaAdmin } from '@/server/auth';
import { Aviso, Esqueleto, TituloPagina } from '@/components/ui';
import { Pdv } from '@/components/admin/Pdv';
import { lojaDoCaixa } from '@/server/admin/operacoes';
import { atuaComoFarmaceutico } from '@/lib/dominio';

export const metadata = { title: 'Nova pré-venda' };

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('orcamentos');
  if (!(await lojaDoCaixa(u))) return <Aviso tipo="alerta">Seu usuário não está vinculado a uma loja. Peça ao administrador para definir sua loja em Equipe.</Aviso>;
  return <Pdv farmaceutico={atuaComoFarmaceutico(u.papel)} modo="prevenda" />;
}

export default function NovaPreVenda() {
  return <><TituloPagina titulo="Pré-venda no balcão" subtitulo="Monte o pedido com o cliente; o caixa finaliza pelo número" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
