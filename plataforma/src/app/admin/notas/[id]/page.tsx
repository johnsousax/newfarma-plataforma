import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Badge, Esqueleto } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { cancelarNotaAcao } from '@/app/acoes/admin';
import { COR_NOTA } from '@/lib/fiscal';
import { brl, dataHora } from '@/lib/formato';

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await paginaAdmin('notas');
  const { id } = await params;
  const n = /^[0-9a-f-]{36}$/.test(id) ? await db.notaFiscal.findUnique({ where: { id }, include: { pedido: { select: { id: true, numero: true } } } }) : null;
  if (!n) notFound();
  return (
    <div className="space-y-5">
      <Link href="/admin/notas" className="text-sm text-slate-500 hover:underline">← Notas fiscais</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{n.modelo} série {n.serie} nº {n.numero} <Badge cor={COR_NOTA[n.status].cor} className="align-middle">{COR_NOTA[n.status].rotulo}</Badge></h1>
        {n.status !== 'CANCELADA' && <BotaoAcao variante="perigo" pedirTexto="Justificativa (mín. 15 caracteres)" acao={cancelarNotaAcao.bind(null, n.id)}>Cancelar nota</BotaoAcao>}
      </div>
      <dl className="cartao grid gap-3 p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Chave de acesso</dt><dd className="break-all font-mono">{n.chaveAcesso.replace(/(\d{4})/g, '$1 ')}</dd></div>
        <div><dt className="text-slate-500">Pedido</dt><dd><Link href={`/admin/pedidos/${n.pedido.id}`} className="link">#{n.pedido.numero}</Link></dd></div>
        <div><dt className="text-slate-500">Valor</dt><dd>{brl(n.valorTotal)}</dd></div>
        <div><dt className="text-slate-500">Emissão</dt><dd>{dataHora(n.criadoEm)} · {n.ambiente}</dd></div>
        <div><dt className="text-slate-500">Provedor</dt><dd>{n.provedor}</dd></div>
        <div><dt className="text-slate-500">Protocolo</dt><dd>{n.protocolo ?? '—'}</dd></div>
        {n.motivo && <div className="sm:col-span-2"><dt className="text-slate-500">Mensagem</dt><dd>{n.motivo}</dd></div>}
      </dl>
      <details className="cartao p-5"><summary className="cursor-pointer font-semibold">Conteúdo da nota (layout 4.00)</summary><pre className="mt-3 max-h-[60vh] overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">{JSON.stringify(n.conteudo, null, 2)}</pre></details>
    </div>
  );
}

export default function Nota(props: PageProps<'/admin/notas/[id]'>) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo params={props.params} /></Suspense>;
}
