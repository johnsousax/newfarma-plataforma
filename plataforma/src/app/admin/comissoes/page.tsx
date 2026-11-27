import { Suspense } from 'react';
import { connection } from 'next/server';
import { paginaAdmin } from '@/server/auth';
import { comissoes } from '@/server/admin/gestao';
import { Esqueleto, TituloPagina, Aviso } from '@/components/ui';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { salvarComissaoAcao, lancarComissoesAcao } from '@/app/acoes/gestao';
import { PAPEL } from '@/lib/dominio';
import { brl } from '@/lib/formato';

export const metadata = { title: 'Comissões' };
const mesAtual = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  await paginaAdmin('comissoes');
  const sp = await searchParams;
  const mes = typeof sp.mes === 'string' && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesAtual();
  const inicio = new Date(`${mes}-01T03:00:00Z`);
  const fim = new Date(inicio); fim.setUTCMonth(fim.getUTCMonth() + 1);
  const lista = await comissoes(inicio, fim);
  const total = lista.reduce((s, l) => s + l.comissao, 0);
  const vendas = lista.reduce((s, l) => s + l.total, 0);
  return (
    <div className="space-y-5">
      <form className="flex flex-wrap items-end gap-2">
        <label><span className="rotulo">Mês</span><input type="month" name="mes" defaultValue={mes} className="campo" /></label>
        <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Ver</button>
      </form>
      <Aviso tipo="info">Vale para vendas no balcão (PDV). O vendedor é quem foi escolhido no caixa; se ninguém foi escolhido, conta para quem operou o caixa. Defina o percentual de cada pessoa na tabela.</Aviso>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Vendedor</th><th className="text-right">Vendas</th><th className="text-right">Total vendido</th><th>Comissão (%)</th><th className="text-right">A pagar</th></tr></thead>
          <tbody>{lista.map((l) => (
            <tr key={l.id}>
              <td className="font-semibold">{l.nome}<span className="block text-xs font-normal text-slate-500">{PAPEL[l.papel]}</span></td>
              <td className="text-right">{l.vendas}</td>
              <td className="text-right">{brl(l.total)}</td>
              <td>
                <FormAcao acao={salvarComissaoAcao} rotulo="Salvar" className="flex items-center gap-2">
                  <input type="hidden" name="usuarioId" value={l.id} />
                  <input name="percentual" defaultValue={String(l.comissaoBp / 100).replace('.', ',')} className="campo w-20 py-1.5" aria-label={`Comissão de ${l.nome}`} />
                </FormAcao>
              </td>
              <td className="text-right font-bold">{brl(l.comissao)}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td className="font-bold">Total</td><td /><td className="text-right font-bold">{brl(vendas)}</td><td /><td className="text-right text-lg font-extrabold">{brl(total)}</td></tr></tfoot>
        </table>
      </div>
      {total > 0 && <BotaoAcao acao={lancarComissoesAcao.bind(null, mes)} confirmar={`Lançar ${brl(total)} de comissões de ${mes} em Contas a pagar?`} variante="primario">Lançar no financeiro</BotaoAcao>}
    </div>
  );
}

export default function Comissoes(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><TituloPagina titulo="Comissões" subtitulo="Quanto cada vendedor vendeu no mês e quanto recebe de comissão" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
