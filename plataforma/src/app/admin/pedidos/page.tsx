import { ImpressaoAutomatica } from '@/components/impressao/Impressao';
import { Icone } from '@/components/icones';
import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { Badge, Esqueleto, Paginacao, TituloPagina } from '@/components/ui';
import { STATUS_PEDIDO, MODALIDADE } from '@/lib/dominio';
import { brl, dataHora } from '@/lib/formato';
import type { Prisma } from '@/generated/prisma/client';
import { StatusPedido, Canal } from '@/generated/prisma/enums';

export const metadata = { title: 'Pedidos' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/admin/pedidos'>['searchParams'] }) {
  await connection();
  const u = await paginaAdmin('pedidos');
  const sp = await searchParams;
  const loja = lojaDoUsuario(u);
  const status = typeof sp.status === 'string' && sp.status in StatusPedido ? (sp.status as StatusPedido) : undefined;
  const canal = typeof sp.canal === 'string' && sp.canal in Canal ? (sp.canal as Canal) : undefined;
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const where: Prisma.PedidoWhereInput = {
    ...(loja ? { lojaId: loja } : typeof sp.loja === 'string' && sp.loja ? { lojaId: sp.loja } : {}),
    ...(status ? { status } : {}), ...(canal ? { canal } : {}),
    ...(q ? (/^\d+$/.test(q) ? { numero: Number(q) } : { OR: [{ clienteNome: { contains: q, mode: 'insensitive' } }, { usuario: { email: { contains: q, mode: 'insensitive' } } }] }) : {}),
  };
  const [total, pedidos, lojas, contagem] = await Promise.all([
    db.pedido.count({ where }),
    db.pedido.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * 30, take: 30, include: { loja: { select: { nome: true } }, _count: { select: { itens: true } } } }),
    db.loja.findMany({ orderBy: { nome: 'asc' } }),
    db.pedido.groupBy({ by: ['status'], where: loja ? { lojaId: loja } : {}, _count: true }),
  ]);
  const cont = Object.fromEntries(contagem.map((c) => [c.status, c._count]));
  const url = (m: Record<string, string | undefined>) => { const x = new URLSearchParams(); for (const [k, v] of Object.entries({ status, canal, q, loja: typeof sp.loja === 'string' ? sp.loja : undefined, ...m })) if (v) x.set(k, v); return `/admin/pedidos?${x}`; };
  return (
    <>
      <div className="sem-barra mb-4 flex gap-2 overflow-x-auto">
        <Link href={url({ status: undefined, pagina: undefined })} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${!status ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200'}`}>Todos</Link>
        {Object.entries(STATUS_PEDIDO).map(([s, v]) => <Link key={s} href={url({ status: s, pagina: undefined })} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${status === s ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200'}`}>{v.rotulo} <span className="opacity-60">{cont[s] ?? 0}</span></Link>)}
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Nº do pedido, nome ou e-mail" className="campo max-w-xs" />
        <select name="canal" defaultValue={canal ?? ''} className="campo w-auto"><option value="">Todos os canais</option>{Object.keys(Canal).map((c) => <option key={c}>{c}</option>)}</select>
        {!loja && <select name="loja" defaultValue={typeof sp.loja === 'string' ? sp.loja : ''} className="campo w-auto"><option value="">Todas as lojas</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>}
        <button className="rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Filtrar</button>
      </form>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nº</th><th>Cliente</th><th>Canal</th><th>Entrega</th><th>Loja</th><th>Status</th><th>Data</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/admin/pedidos/${p.id}`} className="link">#{p.numero}</Link></td>
                <td>{p.clienteNome ?? '—'}<span className="block text-xs text-slate-500">{p._count.itens} item(ns)</span></td>
                <td>{p.canal}</td><td>{MODALIDADE[p.modalidade]}</td><td>{p.loja.nome}</td>
                <td><Badge cor={STATUS_PEDIDO[p.status].cor}>{STATUS_PEDIDO[p.status].rotulo}</Badge></td>
                <td className="whitespace-nowrap text-slate-500">{dataHora(p.criadoEm)}</td>
                <td className="text-right font-semibold">{brl(p.total)}</td>
              </tr>
            ))}
            {!pedidos.length && <tr><td colSpan={8} className="py-10 text-center text-slate-500">Nenhum pedido encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Paginacao pagina={pagina} paginas={Math.ceil(total / 30)} href={(n) => url({ pagina: String(n) })} />
    </>
  );
}

export default function Pedidos(props: PageProps<'/admin/pedidos'>) {
  return <><TituloPagina titulo="Pedidos" subtitulo="Acompanhe e movimente os pedidos de todos os canais" acoes={<div className="flex flex-wrap gap-2"><ImpressaoAutomatica /><Link href="/admin/compras?aba=assistente" className="inline-flex items-center gap-2 rounded-full bg-marca-600 px-3 py-1.5 text-sm font-semibold text-white"><Icone nome="assistente" className="h-4 w-4" />Assistente de compras</Link><Link href="/admin/entregas" className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200"><Icone nome="entregas" className="h-4 w-4" />Despacho</Link></div>} /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
