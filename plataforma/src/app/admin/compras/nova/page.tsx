import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { sugestaoReposicao } from '@/server/admin/operacoes';
import { Aviso, Esqueleto, TituloPagina } from '@/components/ui';
import { NovaCompra } from '@/components/admin/NovaCompra';

export const metadata = { title: 'Novo pedido de compra' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/admin/compras/nova'>['searchParams'] }) {
  await connection();
  const u = await paginaAdmin('compras');
  const sp = await searchParams;
  const [fornecedores, lojas, produtos] = await Promise.all([
    db.fornecedor.findMany({ where: { ativo: true }, orderBy: { nomeFantasia: 'asc' } }),
    db.loja.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' } }),
    db.produto.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, sku: true, custo: true } }),
  ]);
  if (!fornecedores.length) return <Aviso tipo="alerta">Cadastre um fornecedor primeiro.</Aviso>;
  const lojaId = (typeof sp.loja === 'string' && lojas.some((l) => l.id === sp.loja) ? sp.loja : u.lojaId) ?? lojas[0].id;
  const sugestao = await sugestaoReposicao(lojaId);
  return <NovaCompra fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nomeFantasia }))} lojas={lojas} produtos={produtos.map((p) => ({ ...p, custo: p.custo ?? 0 }))} sugestao={sugestao} lojaId={lojaId} />;
}

export default function NovaCompraPagina(props: PageProps<'/admin/compras/nova'>) {
  return <><TituloPagina titulo="Novo pedido de compra" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
