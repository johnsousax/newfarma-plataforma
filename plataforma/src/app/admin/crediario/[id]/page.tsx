import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { situacaoContas, situacaoVazia, textoCobranca } from '@/server/crediario';
import { linkWhatsPara } from '@/server/configuracoes';
import { Badge, Esqueleto, Aviso, cx } from '@/components/ui';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { FormContaCrediario } from '@/components/admin/FormContaCrediario';
import { receberCrediarioAcao, alternarBloqueioContaAcao } from '@/app/acoes/gestao';
import { FARMACIA } from '@/lib/farmacia';
import { brl, data, dataHora, telefone } from '@/lib/formato';

export const metadata = { title: 'Conta de crediário' };

const TIPO = { COMPRA: 'Compra', PAGAMENTO: 'Pagamento', ESTORNO: 'Estorno', AJUSTE: 'Ajuste' } as const;

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await paginaAdmin('crediario');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c, convenios, contasFin] = await Promise.all([
    db.contaCrediario.findUnique({ where: { id }, include: { convenio: true, movimentos: { orderBy: { criadoEm: 'desc' }, take: 200 } } }),
    db.convenio.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, limitePadrao: true } }),
    db.contaFinanceira.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ]);
  if (!c) notFound();
  const s = (await situacaoContas([c.id])).get(c.id) ?? situacaoVazia;
  const pedidos = await db.pedido.findMany({ where: { id: { in: c.movimentos.map((m) => m.pedidoId).filter((x): x is string => !!x) } }, select: { id: true, numero: true } });
  const whats = s.vencido > 0 ? linkWhatsPara(c.telefone, textoCobranca(c.nome, s.vencido, s.saldo, FARMACIA.nome)) : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/crediario" className="text-sm text-marca-700 hover:underline">← Crediário</Link>
        <h1 className="text-2xl font-bold">{c.nome}</h1>
        {c.convenio && <Badge cor="sky">Convênio {c.convenio.nome}{c.matricula ? ` · mat. ${c.matricula}` : ''}</Badge>}
        {c.bloqueada && <Badge cor="rose">Bloqueada</Badge>}
        <span className="text-sm text-slate-500">{c.telefone ? telefone(c.telefone.replace(/^55/, '')) : 'sem telefone'}{c.cpfFinal ? ` · CPF final ${c.cpfFinal}` : ''}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Saldo devedor', brl(s.saldo)], ['Vencido', brl(s.vencido)], ['Disponível para compras', brl(Math.max(0, c.limite - s.saldo))], ['Próximo vencimento', s.proximoVencimento ? data(s.proximoVencimento) : '—']].map(([r, v]) => (
          <div key={r} className="cartao p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r}</p><p className={cx('mt-1 text-2xl font-bold', r === 'Vencido' && s.vencido > 0 && 'text-rose-700')}>{v}</p></div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="cartao space-y-3 p-5">
          <h2 className="font-bold">Receber pagamento</h2>
          {s.saldo <= 0 ? <Aviso tipo="sucesso">Nada em aberto.</Aviso> : (
            <FormAcao acao={receberCrediarioAcao.bind(null, c.id)} rotulo="Registrar pagamento" className="grid gap-3 sm:grid-cols-3">
              <label><span className="rotulo">Valor (R$)</span><input name="valor" required defaultValue={(s.vencido || s.saldo) / 100 ? ((s.vencido || s.saldo) / 100).toFixed(2).replace('.', ',') : ''} className="campo" /></label>
              <label><span className="rotulo">Forma</span><select name="forma" className="campo"><option value="DINHEIRO">Dinheiro</option><option value="PIX">PIX</option><option value="CARTAO_DEBITO">Cartão de débito</option><option value="CARTAO_CREDITO">Cartão de crédito</option><option value="TRANSFERENCIA">Transferência</option></select></label>
              <label><span className="rotulo">Entrou em</span><select name="contaFinanceiraId" className="campo"><option value="">—</option>{contasFin.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
              <p className="text-xs text-slate-500 sm:col-span-3">Em dinheiro, o valor entra na gaveta do seu caixa aberto. Todo recebimento aparece no Financeiro.</p>
            </FormAcao>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {whats && <a href={whats} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Cobrar pelo WhatsApp</a>}
            <BotaoAcao acao={alternarBloqueioContaAcao.bind(null, c.id)} variante={c.bloqueada ? 'secundario' : 'perigo'} confirmar={c.bloqueada ? 'Liberar novas compras?' : 'Bloquear novas compras no crediário?'}>{c.bloqueada ? 'Desbloquear' : 'Bloquear conta'}</BotaoAcao>
          </div>
        </section>
        <section className="cartao p-5">
          <h2 className="mb-3 font-bold">Dados da conta</h2>
          <FormContaCrediario conta={c} convenios={convenios} />
        </section>
      </div>
      <section className="cartao overflow-x-auto">
        <h2 className="p-5 pb-0 font-bold">Extrato</h2>
        <table className="tabela">
          <thead><tr><th>Data</th><th>Lançamento</th><th>Vencimento</th><th className="text-right">Valor</th></tr></thead>
          <tbody>{c.movimentos.map((m) => {
            const p = pedidos.find((x) => x.id === m.pedidoId);
            return (
              <tr key={m.id}>
                <td>{dataHora(m.criadoEm)}</td>
                <td><Badge cor={m.valor > 0 ? 'amber' : 'emerald'}>{TIPO[m.tipo]}</Badge> {p ? <Link href={`/admin/pedidos/${p.id}`} className="hover:underline">{m.descricao}</Link> : m.descricao}</td>
                <td>{m.vencimento ? data(m.vencimento) : '—'}</td>
                <td className={cx('text-right font-semibold', m.valor < 0 && 'text-emerald-700')}>{brl(m.valor)}</td>
              </tr>
            );
          })}{!c.movimentos.length && <tr><td colSpan={4} className="py-8 text-center text-slate-400">Sem movimentos.</td></tr>}</tbody>
        </table>
      </section>
    </div>
  );
}

export default function ContaCrediario(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo params={props.params} /></Suspense>;
}
