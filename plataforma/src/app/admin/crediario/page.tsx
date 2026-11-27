import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { situacaoContas, situacaoVazia } from '@/server/crediario';
import { Badge, Esqueleto, TituloPagina, Vazio, Aviso, cx } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { FormContaCrediario } from '@/components/admin/FormContaCrediario';
import { enviarCobrancasAcao } from '@/app/acoes/gestao';
import { brl, data } from '@/lib/formato';

export const metadata = { title: 'Crediário' };

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  await paginaAdmin('crediario');
  const sp = await searchParams;
  const filtro = sp.f === 'vencidos' ? 'vencidos' : sp.f === 'devendo' ? 'devendo' : 'todos';
  const busca = typeof sp.q === 'string' ? sp.q.trim() : '';
  const [contas, convenios] = await Promise.all([
    db.contaCrediario.findMany({ where: { ativa: true, ...(busca ? { OR: [{ nome: { contains: busca, mode: 'insensitive' } }, { matricula: busca }] } : {}) }, include: { convenio: { select: { nome: true } } }, orderBy: { nome: 'asc' } }),
    db.convenio.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, limitePadrao: true } }),
  ]);
  const sit = await situacaoContas();
  const linhas = contas.map((c) => ({ ...c, s: sit.get(c.id) ?? situacaoVazia }));
  const visiveis = linhas.filter((l) => filtro === 'todos' || (filtro === 'vencidos' ? l.s.vencido > 0 : l.s.saldo > 0));
  const aReceber = linhas.reduce((s, l) => s + Math.max(0, l.s.saldo), 0);
  const vencido = linhas.reduce((s, l) => s + l.s.vencido, 0);
  const devedores = linhas.filter((l) => l.s.vencido > 0).length;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['A receber', brl(aReceber)], ['Vencido', brl(vencido)], ['Clientes com atraso', String(devedores)], ['Contas ativas', String(contas.length)]].map(([r, v]) => (
          <div key={r} className="cartao p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[['todos', 'Todos'], ['devendo', 'Com saldo'], ['vencidos', 'Vencidos']].map(([k, r]) => <Link key={k} href={`/admin/crediario?f=${k}`} className={cx('rounded-full px-4 py-1.5 text-sm', filtro === k ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}>{r}</Link>)}
        <form className="ml-auto"><input name="q" defaultValue={busca} placeholder="Buscar cliente ou matrícula" className="campo py-1.5" /></form>
        <BotaoAcao acao={enviarCobrancasAcao} confirmar={`Enviar lembrete pelo WhatsApp para ${devedores} cliente(s) em atraso?`} variante="primario">Cobrar atrasados no WhatsApp</BotaoAcao>
      </div>
      <Aviso tipo="info">A cobrança automática roda todo dia às 10h (cada cliente recebe no máximo um lembrete a cada 3 dias), desde que o WhatsApp da loja esteja conectado.</Aviso>
      {!visiveis.length ? <Vazio icone="crediario" titulo="Nenhuma conta aqui" texto="Abra a primeira conta de crediário no formulário abaixo." /> : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Cliente</th><th>Convênio</th><th className="text-right">Limite</th><th className="text-right">Saldo devedor</th><th className="text-right">Vencido</th><th>Próx. vencimento</th><th /></tr></thead>
            <tbody>{visiveis.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/admin/crediario/${l.id}`} className="font-semibold hover:underline">{l.nome}</Link>{l.bloqueada && <Badge cor="rose" className="ml-2">Bloqueada</Badge>}</td>
                <td>{l.convenio?.nome ?? '—'}</td>
                <td className="text-right">{brl(l.limite)}</td>
                <td className="text-right font-semibold">{brl(l.s.saldo)}</td>
                <td className={cx('text-right', l.s.vencido > 0 && 'font-bold text-rose-700')}>{l.s.vencido ? brl(l.s.vencido) : '—'}</td>
                <td>{l.s.proximoVencimento ? data(l.s.proximoVencimento) : '—'}</td>
                <td><Link href={`/admin/crediario/${l.id}`} className="text-sm text-marca-700 hover:underline">Abrir</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <details className="cartao p-5">
        <summary className="cursor-pointer font-semibold">Abrir nova conta de crediário</summary>
        <div className="mt-4"><FormContaCrediario convenios={convenios} /></div>
      </details>
    </div>
  );
}

export default function Crediario(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><TituloPagina titulo="Crediário" subtitulo="Venda a prazo (fiado) com limite por cliente, recebimentos e cobrança" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
