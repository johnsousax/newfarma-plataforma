import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { Badge, Esqueleto } from '@/components/ui';
import { PlanilhaCotacao } from '@/components/admin/PlanilhaCotacao';

export const metadata = { title: 'Cotação' };

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const u = await paginaAdmin('compras');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await db.cotacao.findUnique({ where: { id }, include: { itens: { orderBy: { produtoNome: 'asc' }, include: { precos: { select: { fornecedorId: true, custoUnitario: true, prazoDias: true } } } } } });
  const loja = lojaDoUsuario(u);
  if (!c || (loja && c.lojaId !== loja)) notFound();
  const fornecedores = await db.fornecedor.findMany({ where: { ativo: true }, orderBy: { nomeFantasia: 'asc' }, select: { id: true, nomeFantasia: true, telefone: true } });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/cotacoes" className="text-sm text-marca-700 hover:underline">← Cotações</Link>
        <h1 className="text-2xl font-bold">Cotação nº {c.numero} — {c.descricao}</h1>
        <Badge cor={c.status === 'ABERTA' ? 'amber' : c.status === 'FECHADA' ? 'emerald' : 'slate'}>{c.status === 'ABERTA' ? 'Aberta' : c.status === 'FECHADA' ? 'Pedidos gerados' : 'Cancelada'}</Badge>
        {c.status === 'FECHADA' && <Link href="/admin/compras" className="text-sm text-marca-700 hover:underline">Ver pedidos de compra →</Link>}
      </div>
      {!fornecedores.length ? <p className="text-sm">Cadastre fornecedores em <Link href="/admin/fornecedores" className="link">Fornecedores</Link> primeiro.</p> : (
        <PlanilhaCotacao cotacaoId={c.id} numero={c.numero} aberta={c.status === 'ABERTA'} itens={c.itens} fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nomeFantasia, telefone: f.telefone }))} />
      )}
    </div>
  );
}

export default function Cotacao(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo params={props.params} /></Suspense>;
}
