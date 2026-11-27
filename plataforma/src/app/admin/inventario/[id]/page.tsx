import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { Badge, Esqueleto } from '@/components/ui';
import { ContagemInventario } from '@/components/admin/ContagemInventario';
import { dataHora } from '@/lib/formato';

export const metadata = { title: 'Contagem do inventário' };

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const u = await paginaAdmin('inventario');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const inv = await db.inventario.findUnique({ where: { id }, include: { itens: { orderBy: [{ produtoNome: 'asc' }, { validade: 'asc' }] } } });
  const loja = lojaDoUsuario(u);
  if (!inv || (loja && inv.lojaId !== loja)) notFound();
  const eans = await db.produto.findMany({ where: { id: { in: [...new Set(inv.itens.map((i) => i.produtoId))] } }, select: { id: true, ean: true } });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/inventario" className="text-sm text-marca-700 hover:underline">← Inventários</Link>
        <h1 className="text-2xl font-bold">Inventário nº {inv.numero} — {inv.descricao}</h1>
        <Badge cor={inv.status === 'ABERTO' ? 'amber' : inv.status === 'FECHADO' ? 'emerald' : 'slate'}>{inv.status === 'ABERTO' ? 'Em contagem' : inv.status === 'FECHADO' ? `Fechado em ${dataHora(inv.fechadoEm)}` : 'Cancelado'}</Badge>
      </div>
      <ContagemInventario inventarioId={inv.id} aberto={inv.status === 'ABERTO'} itens={inv.itens.map((i) => ({ id: i.id, produtoNome: i.produtoNome, loteCodigo: i.loteCodigo, validade: i.validade.toISOString(), esperado: i.esperado, contado: i.contado, ean: eans.find((e) => e.id === i.produtoId)?.ean ?? null }))} />
    </div>
  );
}

export default function Inventario(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo params={props.params} /></Suspense>;
}
