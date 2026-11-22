import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { motoboyPorToken } from '@/server/entregas';
import { linkWhatsPara } from '@/server/configuracoes';
import { Esqueleto } from '@/components/ui';
import { Icone } from '@/components/icones';
import { LogoCompleto } from '@/components/Logo';
import { CompartilharPosicao, ConfirmarEntrega } from '@/components/entregador/Entregador';
import { linhaEndereco, linkMapa, type EnderecoPedido } from '@/lib/endereco';
import { brl } from '@/lib/formato';

export const metadata = { title: 'Minhas entregas', robots: { index: false, follow: false } };

async function Conteudo({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const m = await motoboyPorToken(token);
  if (!m?.ativo) notFound();
  const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
  const [emRota, hoje] = await Promise.all([
    db.pedido.findMany({
      where: { motoboyId: m.id, status: 'SAIU_PARA_ENTREGA' }, orderBy: { despachadoEm: 'asc' },
      select: { id: true, numero: true, total: true, metodoPagamento: true, enderecoEntrega: true, observacao: true, usuario: { select: { nome: true, telefone: true } }, pagamentos: { where: { status: 'APROVADO' }, select: { id: true }, take: 1 } },
    }),
    db.pedido.aggregate({ where: { motoboyId: m.id, status: 'ENTREGUE', entregueEm: { gte: inicioDia } }, _count: true, _sum: { taxaMotoboy: true } }),
  ]);
  return (
    <main className="mx-auto max-w-lg space-y-4 p-4">
      <header className="flex items-center justify-between"><LogoCompleto className="h-9" /><span className="text-sm text-slate-500">{m.nome.split(' ')[0]}</span></header>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="cartao p-3"><p className="text-2xl font-bold">{hoje._count}</p><p className="text-xs text-slate-500">entregas hoje</p></div>
        <div className="cartao p-3"><p className="text-2xl font-bold">{brl(hoje._sum.taxaMotoboy ?? 0)}</p><p className="text-xs text-slate-500">a receber hoje</p></div>
      </div>
      <CompartilharPosicao token={token} />
      <h1 className="text-lg font-bold">Em rota ({emRota.length})</h1>
      {!emRota.length && <p className="cartao p-6 text-center text-sm text-slate-500">Nenhuma entrega com você agora. Quando a loja despachar, ela aparece aqui.</p>}
      {emRota.map((p) => {
        const e = p.enderecoEntrega as EnderecoPedido | null;
        const wa = linkWhatsPara(p.usuario?.telefone, `Olá, ${p.usuario?.nome?.split(' ')[0] ?? ''}! Sou o entregador da farmácia com o seu pedido #${p.numero}.`);
        return (
          <article key={p.id} className="cartao space-y-3 p-4">
            <div className="flex items-center justify-between"><strong className="text-lg">#{p.numero}</strong><span className="text-sm">{p.pagamentos.length ? 'Pago' : `Cobrar ${brl(p.total)}`}</span></div>
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
      <p className="text-center text-xs text-slate-400">Este link é pessoal. Não compartilhe.</p>
    </main>
  );
}

export default function Entregador(props: PageProps<'/entregador/[token]'>) {
  return <Suspense fallback={<Esqueleto className="m-4 h-96" />}><Conteudo params={props.params} /></Suspense>;
}
