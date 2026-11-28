import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { conferir, type ItemNotaEntrada } from '@/server/compras/entrada-nota';
import { Badge, Esqueleto } from '@/components/ui';
import { ConferenciaNota } from '@/components/admin/ConferenciaNota';
import { brl, data, dataHora } from '@/lib/formato';

export const metadata = { title: 'Conferência da nota' };

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const u = await paginaAdmin('notasEntrada');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const n = await db.notaEntrada.findUnique({ where: { id }, select: { id: true, chave: true, numero: true, serie: true, emitidaEm: true, emitenteNome: true, emitenteCnpj: true, fornecedorId: true, lojaId: true, destCnpj: true, valorTotal: true, autorizada: true, status: true, itens: true, duplicatas: true, lancadaEm: true, compraId: true } });
  const loja = lojaDoUsuario(u);
  if (!n || (loja && n.lojaId !== loja)) notFound();
  const [c, compras] = await Promise.all([
    conferir(n),
    db.pedidoCompra.findMany({ where: { fornecedorId: n.fornecedorId, status: 'ENVIADO' }, orderBy: { criadoEm: 'desc' }, select: { id: true, numero: true, total: true } }),
  ]);
  const itens = n.itens as ItemNotaEntrada[];
  const dups = n.duplicatas as { numero: string; vencimento: string; valor: number }[];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/entrada-nota" className="text-sm text-marca-700 hover:underline">← Notas</Link>
        <h1 className="text-2xl font-bold">NF {n.numero} — {n.emitenteNome}</h1>
        <Badge cor={n.status === 'PENDENTE' ? 'amber' : n.status === 'LANCADA' ? 'emerald' : 'slate'}>{n.status === 'PENDENTE' ? 'Conferindo' : n.status === 'LANCADA' ? `No estoque desde ${dataHora(n.lancadaEm)}` : 'Descartada'}</Badge>
        {n.autorizada && <Badge cor="sky">Autorizada na SEFAZ</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Valor da nota', brl(n.valorTotal)], ['Emissão', data(n.emitidaEm)], ['Itens', `${itens.length} (${itens.filter((i) => i.produtoId || i.ignorar).length} prontos)`], ['Duplicatas', dups.length ? dups.map((d) => `${d.vencimento.split('-').reverse().join('/')} ${brl(d.valor)}`).join(' · ') : 'à vista / sem duplicata']].map(([r, v]) => (
          <div key={r} className="cartao p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r}</p><p className="mt-1 font-bold">{v}</p></div>
        ))}
      </div>
      <p className="font-mono text-xs text-slate-500">Chave {n.chave.replace(/(\d{4})/g, '$1 ').trim()}</p>
      <ConferenciaNota notaId={n.id} aberta={n.status === 'PENDENTE'} itens={itens} bloqueios={c.bloqueios} atencao={c.atencao} compras={compras} />
    </div>
  );
}

export default function ConferenciaNotaPagina(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo params={props.params} /></Suspense>;
}
