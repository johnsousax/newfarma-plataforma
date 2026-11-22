import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Badge, BotaoLink, Esqueleto, TituloPagina, cx } from '@/components/ui';
import { Icone } from '@/components/icones';
import { AssistenteCompras } from '@/components/admin/AssistenteCompras';
import { brl, data } from '@/lib/formato';
import { COR_COMPRA } from '@/lib/dominio';

export const metadata = { title: 'Compras' };

async function Lista() {
  const compras = await db.pedidoCompra.findMany({ orderBy: { criadoEm: 'desc' }, take: 100, include: { fornecedor: { select: { nomeFantasia: true } }, loja: { select: { nome: true } }, _count: { select: { itens: true } } } });
  return (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr><th>Nº</th><th>Fornecedor</th><th>Loja</th><th>Itens</th><th>Status</th><th>Criado</th><th className="text-right">Total</th></tr></thead>
        <tbody>
          {compras.map((c) => <tr key={c.id}><td><Link href={`/admin/compras/${c.id}`} className="link">#{c.numero}</Link></td><td>{c.fornecedor.nomeFantasia}</td><td>{c.loja.nome}</td><td>{c._count.itens}</td><td><Badge cor={COR_COMPRA[c.status]}>{c.status}</Badge></td><td>{data(c.criadoEm)}</td><td className="text-right font-semibold">{brl(c.total)}</td></tr>)}
          {!compras.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">Nenhum pedido de compra.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  await paginaAdmin('compras');
  const aba = (await searchParams).aba === 'assistente' ? 'assistente' : 'lista';
  const fornecedores = aba === 'assistente' ? await db.fornecedor.findMany({ where: { ativo: true }, orderBy: { nomeFantasia: 'asc' }, select: { id: true, nomeFantasia: true } }) : [];
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-2">
        <Link href="/admin/compras" className={cx('inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm', aba === 'lista' ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}><Icone nome="compras" className="h-4 w-4" />Pedidos de compra</Link>
        <Link href="/admin/compras?aba=assistente" className={cx('inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm', aba === 'assistente' ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}><Icone nome="assistente" className="h-4 w-4" />Assistente de compras (IA)</Link>
      </nav>
      {aba === 'assistente' ? <AssistenteCompras fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nomeFantasia }))} /> : <Lista />}
    </div>
  );
}

export default function Compras(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><TituloPagina titulo="Compras" subtitulo="Pedidos aos fornecedores, sugestão de reposição e assistente com IA" acoes={<BotaoLink href="/admin/compras/nova">+ Novo pedido de compra</BotaoLink>} /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
