import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Badge, BotaoLink, Esqueleto, TituloPagina } from '@/components/ui';
import { brl, data } from '@/lib/formato';
import { COR_COMPRA } from '@/lib/dominio';

export const metadata = { title: 'Compras' };

async function Conteudo() {
  await connection();
  await paginaAdmin('compras');
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

export default function Compras() {
  return <><TituloPagina titulo="Compras" subtitulo="Pedidos aos fornecedores com sugestão automática de reposição" acoes={<BotaoLink href="/admin/compras/nova">+ Novo pedido de compra</BotaoLink>} /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
