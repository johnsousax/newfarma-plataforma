import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { motoboyPorToken } from '@/server/entregas';
import { linkWhatsPara } from '@/server/configuracoes';
import { Esqueleto } from '@/components/ui';
import { Icone } from '@/components/icones';
import { LogoCompleto } from '@/components/Logo';
import { CompartilharPosicao, ConfirmarEntrega, InstalarApp } from '@/components/entregador/Entregador';
import { FiltroPeriodo } from '@/components/FiltroPeriodo';
import { lerPeriodo } from '@/lib/periodo';
import { dataHora } from '@/lib/formato';
import { cx } from '@/components/ui';
import { linhaEndereco, linkMapa, type EnderecoPedido } from '@/lib/endereco';
import { brl } from '@/lib/formato';

export async function generateMetadata(props: PageProps<'/entregador/[token]'>): Promise<Metadata> {
  const { token } = await props.params;
  return { title: 'Minhas entregas', robots: { index: false, follow: false }, manifest: `/entregador/${token}/manifest.webmanifest`, appleWebApp: { capable: true, title: 'Entregas', statusBarStyle: 'default' } };
}

async function Conteudo({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { token } = await params;
  const sp = await searchParams;
  const aba = sp.aba === 'historico' ? 'historico' : 'rota';
  const per = lerPeriodo(sp, 'hoje');
  const m = await motoboyPorToken(token);
  if (!m?.ativo) notFound();
  const [emRota, hoje, historico] = await Promise.all([
    db.pedido.findMany({
      where: { motoboyId: m.id, status: 'SAIU_PARA_ENTREGA' }, orderBy: { despachadoEm: 'asc' },
      select: { id: true, numero: true, total: true, taxaMotoboy: true, metodoPagamento: true, enderecoEntrega: true, observacao: true, usuario: { select: { nome: true, telefone: true } }, pagamentos: { where: { status: 'APROVADO' }, select: { id: true }, take: 1 } },
    }),
    db.pedido.aggregate({ where: { motoboyId: m.id, status: 'ENTREGUE', entregueEm: { gte: per.inicio, lt: per.fim } }, _count: true, _sum: { taxaMotoboy: true } }),
    aba === 'historico' ? db.pedido.findMany({ where: { motoboyId: m.id, status: 'ENTREGUE', entregueEm: { gte: per.inicio, lt: per.fim } }, orderBy: { entregueEm: 'desc' }, take: 300, select: { id: true, numero: true, entregueEm: true, despachadoEm: true, taxaMotoboy: true, enderecoEntrega: true } }) : Promise.resolve([]),
  ]);
  const base = `/entregador/${token}`;
  return (
    <main className="mx-auto max-w-lg space-y-4 p-4">
      <header className="flex items-center justify-between"><LogoCompleto className="h-9" /><span className="text-sm text-slate-500">{m.nome.split(' ')[0]}</span></header>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="cartao p-3"><p className="text-2xl font-bold">{hoje._count}</p><p className="text-xs text-slate-500">entregas · {per.rotulo.toLowerCase()}</p></div>
        <div className="cartao p-3"><p className="text-2xl font-bold">{brl(hoje._sum.taxaMotoboy ?? 0)}</p><p className="text-xs text-slate-500">a receber · {per.rotulo.toLowerCase()}</p></div>
      </div>
      <p className="text-center text-xs text-slate-500">Você recebe {brl(m.taxaPorEntrega)} por entrega</p>
      <InstalarApp />
      <nav className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        <Link href={base} className={cx('rounded-lg py-2 text-center', aba === 'rota' ? 'bg-white text-marca-700 shadow-sm' : 'text-slate-500')}>Em rota ({emRota.length})</Link>
        <Link href={`${base}?aba=historico`} className={cx('rounded-lg py-2 text-center', aba === 'historico' ? 'bg-white text-marca-700 shadow-sm' : 'text-slate-500')}>Meus ganhos</Link>
      </nav>
      {aba === 'historico' ? (
        <section className="space-y-3">
          <FiltroPeriodo base={base} atual={per.chave} de={per.de} ate={per.ate} extras={{ aba: 'historico' }} />
          {!historico.length && <p className="cartao p-6 text-center text-sm text-slate-500">Nenhuma entrega em {per.rotulo.toLowerCase()}.</p>}
          <ul className="cartao divide-y divide-slate-100">
            {historico.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span><strong>#{h.numero}</strong> · {(h.enderecoEntrega as EnderecoPedido | null)?.bairro ?? ''}<span className="block text-xs text-slate-500">{h.entregueEm && dataHora(h.entregueEm)}{h.despachadoEm && h.entregueEm && ` · ${Math.max(1, Math.round((+h.entregueEm - +h.despachadoEm) / 60_000))} min de rota`}</span></span>
                <strong className="text-emerald-700">{brl(h.taxaMotoboy ?? 0)}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : (<>
      <CompartilharPosicao token={token} />
      {emRota.length > 1 && (() => {
        const ends = emRota.map((p) => p.enderecoEntrega as EnderecoPedido | null).filter(Boolean).map((e) => `${e!.logradouro}, ${e!.numero} - ${e!.bairro}, ${e!.cidade} - ${e!.uf}`);
        const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(ends[ends.length - 1])}&waypoints=${encodeURIComponent(ends.slice(0, -1).join('|'))}`;
        return <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-marca-600 py-3 text-sm font-bold text-white"><Icone nome="rota" />Rota com as {emRota.length} entregas</a>;
      })()}
      {!emRota.length && <p className="cartao p-6 text-center text-sm text-slate-500">Nenhuma entrega com você agora. Quando a loja despachar, ela aparece aqui.</p>}
      {emRota.map((p) => {
        const e = p.enderecoEntrega as EnderecoPedido | null;
        const wa = linkWhatsPara(p.usuario?.telefone, `Olá, ${p.usuario?.nome?.split(' ')[0] ?? ''}! Sou o entregador da farmácia com o seu pedido #${p.numero}.`);
        return (
          <article key={p.id} className="cartao space-y-3 p-4">
            <div className="flex items-center justify-between"><strong className="text-lg">#{p.numero}</strong><span className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold', p.pagamentos.length ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-900')}>{p.pagamentos.length ? 'Já pago' : `Cobrar ${brl(p.total)}`}</span></div>
            <p className="text-xs text-slate-500">Sua taxa nesta entrega: <strong className="text-slate-800">{brl(p.taxaMotoboy ?? m.taxaPorEntrega)}</strong></p>
            <div>
              <p className="font-semibold">{e?.destinatario ?? p.usuario?.nome}</p>
              <p className="text-sm text-slate-700">{linhaEndereco(e)}</p>
              {e?.cep && <p className="text-xs text-slate-500">CEP {e.cep}</p>}
              {p.observacao && <p className="mt-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{p.observacao}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {linkMapa(e) && <a href={linkMapa(e)!} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-marca-50 py-2.5 font-semibold text-marca-700"><Icone nome="rota" />Abrir rota</a>}
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-2.5 font-semibold text-emerald-700"><Icone nome="whatsapp" />Cliente</a>}
            </div>
            <ConfirmarEntrega token={token} pedidoId={p.id} />
          </article>
        );
      })}
      </>)}
      <p className="text-center text-xs text-slate-400">Este link é pessoal. Não compartilhe.</p>
    </main>
  );
}

export default function Entregador(props: PageProps<'/entregador/[token]'>) {
  return <Suspense fallback={<Esqueleto className="m-4 h-96" />}><Conteudo params={props.params} searchParams={props.searchParams} /></Suspense>;
}
