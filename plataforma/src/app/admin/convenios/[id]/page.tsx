import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { situacaoContas, situacaoVazia } from '@/server/crediario';
import { Esqueleto, Aviso } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { FormConvenio } from '@/components/admin/FormConvenio';
import { receberFaturaConvenioAcao } from '@/app/acoes/gestao';
import { brl, data, dataHora } from '@/lib/formato';

export const metadata = { title: 'Fechamento do convênio' };

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await paginaAdmin('convenios');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await db.convenio.findUnique({ where: { id }, include: { contas: { orderBy: { nome: 'asc' }, include: { movimentos: { where: { tipo: 'COMPRA' }, orderBy: { criadoEm: 'asc' } } } } } });
  if (!c) notFound();
  const sit = await situacaoContas(c.contas.map((x) => x.id));
  const linhas = c.contas.map((x) => ({ ...x, s: sit.get(x.id) ?? situacaoVazia })).filter((x) => x.s.saldo > 0);
  const total = linhas.reduce((s, x) => s + x.s.saldo, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/admin/convenios" className="text-sm text-marca-700 hover:underline">← Convênios</Link>
        <span className="ml-auto" />
        {total > 0 && <BotaoAcao acao={receberFaturaConvenioAcao.bind(null, c.id)} confirmar={`Confirmar que ${c.nome} pagou ${brl(total)}? As contas dos conveniados serão quitadas.`} variante="primario">Registrar pagamento da fatura</BotaoAcao>}
      </div>
      <section className="cartao p-6">
        <h1 className="text-2xl font-bold">Fatura do convênio — {c.nome}</h1>
        <p className="text-sm text-slate-500">{c.cnpj ? `CNPJ ${c.cnpj} · ` : ''}Emitida em {dataHora(new Date())} · desconto aos conveniados {(c.descontoBp / 100).toLocaleString('pt-BR')}%</p>
        {!linhas.length ? <Aviso tipo="sucesso" className="mt-4">Nenhum valor em aberto.</Aviso> : (
          <table className="tabela mt-4">
            <thead><tr><th>Conveniado</th><th>Matrícula</th><th>Compras</th><th className="text-right">Valor</th></tr></thead>
            <tbody>{linhas.map((x) => (
              <tr key={x.id}>
                <td className="font-semibold">{x.nome}</td><td>{x.matricula ?? '—'}</td>
                <td className="text-xs text-slate-600">{x.movimentos.slice(-6).map((m) => `${data(m.criadoEm)} ${brl(m.valor)}`).join(' · ')}</td>
                <td className="text-right font-semibold">{brl(x.s.saldo)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={3} className="text-right font-bold">Total a pagar</td><td className="text-right text-lg font-extrabold">{brl(total)}</td></tr></tfoot>
          </table>
        )}
        <p className="mt-4 text-xs text-slate-500 print:block">Use Imprimir do navegador (Ctrl+P) para enviar à empresa ou para o desconto em folha.</p>
      </section>
      <section className="cartao p-5 print:hidden">
        <h2 className="mb-3 font-bold">Dados do convênio</h2>
        <FormConvenio c={c} />
      </section>
    </div>
  );
}

export default function FaturaConvenio(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo params={props.params} /></Suspense>;
}
