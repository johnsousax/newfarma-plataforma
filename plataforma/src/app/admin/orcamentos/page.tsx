import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { linkWhatsPara } from '@/server/configuracoes';
import { Badge, BotaoLink, Esqueleto, TituloPagina, Vazio, cx } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { cancelarOrcamentoAcao } from '@/app/acoes/gestao';
import { FARMACIA } from '@/lib/farmacia';
import { brl, dataHora } from '@/lib/formato';
import type { ItemOrcamento } from '@/server/admin/gestao';

export const metadata = { title: 'Orçamentos e pré-vendas' };
const STATUS = { ABERTO: ['Aberto', 'sky'], CONVERTIDO: ['Vendido', 'emerald'], CANCELADO: ['Cancelado', 'slate'] } as const;

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const u = await paginaAdmin('orcamentos');
  const sp = await searchParams;
  const todos = sp.todos === '1';
  const loja = lojaDoUsuario(u);
  const lista = await db.orcamento.findMany({ where: { ...(loja ? { lojaId: loja } : {}), ...(todos ? {} : { status: 'ABERTO', validoAte: { gt: new Date() } }) }, orderBy: { criadoEm: 'desc' }, take: 100 });
  const vend = await db.usuario.findMany({ where: { id: { in: [...new Set(lista.map((o) => o.vendedorId))] } }, select: { id: true, nome: true } });
  const pedidos = await db.pedido.findMany({ where: { id: { in: lista.map((o) => o.pedidoId).filter((x): x is string => !!x) } }, select: { id: true, numero: true } });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <BotaoLink href="/admin/orcamentos/novo">Nova pré-venda / orçamento</BotaoLink>
        <Link href="/admin/orcamentos" className={cx('rounded-full px-4 py-2', !todos ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}>Em aberto</Link>
        <Link href="/admin/orcamentos?todos=1" className={cx('rounded-full px-4 py-2', todos ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}>Histórico</Link>
      </div>
      {!lista.length ? <Vazio icone="orcamentos" titulo="Nada em aberto" texto="Monte uma pré-venda no balcão ou salve um orçamento pelo caixa." /> : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Nº</th><th>Tipo</th><th>Cliente</th><th>Vendedor</th><th>Criado</th><th className="text-right">Total</th><th>Situação</th><th /></tr></thead>
            <tbody>{lista.map((o) => {
              const itens = o.itens as ItemOrcamento[];
              const vencido = o.status === 'ABERTO' && o.validoAte < new Date();
              const p = pedidos.find((x) => x.id === o.pedidoId);
              const whats = o.telefone ? linkWhatsPara(o.telefone, `Olá${o.clienteNome ? `, ${o.clienteNome.split(' ')[0]}` : ''}! Segue seu orçamento nº ${o.numero} da ${FARMACIA.nome}:\n${itens.map((i) => `• ${i.quantidade}x ${i.nome} — ${brl(i.total)}`).join('\n')}\nTotal: ${brl(o.total)}. Válido até ${o.validoAte.toLocaleDateString('pt-BR')}.`) : null;
              return (
                <tr key={o.id}>
                  <td className="font-bold">{o.numero}</td>
                  <td>{o.tipo === 'ORCAMENTO' ? 'Orçamento' : 'Pré-venda'}</td>
                  <td>{o.clienteNome ?? '—'}<span className="block text-xs text-slate-500">{itens.length} item(ns)</span></td>
                  <td>{vend.find((v) => v.id === o.vendedorId)?.nome ?? '—'}</td>
                  <td>{dataHora(o.criadoEm)}</td>
                  <td className="text-right font-semibold">{brl(o.total)}</td>
                  <td><Badge cor={vencido ? 'amber' : STATUS[o.status][1]}>{vencido ? 'Vencido' : STATUS[o.status][0]}</Badge>{p && <Link href={`/admin/pedidos/${p.id}`} className="ml-1 text-xs hover:underline">#{p.numero}</Link>}</td>
                  <td className="space-x-2 whitespace-nowrap text-sm">
                    <a href={`/imprimir/orcamento/${o.id}`} target="_blank" className="text-marca-700 hover:underline">Imprimir</a>
                    {whats && <a href={whats} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">WhatsApp</a>}
                    {o.status === 'ABERTO' && <BotaoAcao acao={cancelarOrcamentoAcao.bind(null, o.id)} confirmar="Cancelar?" variante="fantasma">Cancelar</BotaoAcao>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Orcamentos(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><TituloPagina titulo="Orçamentos e pré-vendas" subtitulo="O balconista monta, o caixa finaliza pelo número; orçamento vale 7 dias" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
