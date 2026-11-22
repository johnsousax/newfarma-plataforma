import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { kpis, vendasPorDia, vendasPor, curvaABC } from '@/server/admin/relatorios';
import { BarrasHorizontais, GraficoColunas, Kpi } from '@/components/admin/Graficos';
import { Badge, Esqueleto, TituloPagina } from '@/components/ui';
import { METODO_PAGAMENTO, MODALIDADE } from '@/lib/dominio';
import { brl } from '@/lib/formato';

export const metadata = { title: 'Relatórios' };

const ROTULOS: Record<string, string> = { ...METODO_PAGAMENTO, ...MODALIDADE, SITE: 'Site', PDV: 'Loja (PDV)', IFOOD: 'iFood', WHATSAPP: 'WhatsApp' };
const brlCurto = (c: number) => (c >= 100_000 ? `R$${(c / 100_000).toFixed(0)}k` : brl(c).replace(',00', ''));

async function Conteudo({ searchParams }: { searchParams: PageProps<'/admin/relatorios'>['searchParams'] }) {
  await connection();
  const u = await paginaAdmin('relatorios');
  const sp = await searchParams;
  const lojas = await db.loja.findMany({ orderBy: { nome: 'asc' } });
  const fixa = lojaDoUsuario(u);
  const lojaId = fixa ?? (typeof sp.loja === 'string' && sp.loja ? sp.loja : null);
  const hoje = new Date();
  const de = typeof sp.de === 'string' && sp.de ? new Date(`${sp.de}T00:00:00-03:00`) : new Date(hoje.getTime() - 30 * 86_400_000);
  const ate = typeof sp.ate === 'string' && sp.ate ? new Date(`${sp.ate}T23:59:59-03:00`) : hoje;
  const per = { de, ate, lojaId };
  const [k, serie, canal, cat, pag, mod, porLoja, abc] = await Promise.all([
    kpis(per), vendasPorDia(per), vendasPor('canal', per), vendasPor('categoria', per), vendasPor('pagamento', per), vendasPor('modalidade', per), lojaId ? Promise.resolve([]) : vendasPor('loja', per), curvaABC(per),
  ]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const qs = new URLSearchParams({ de: iso(de), ate: iso(ate), ...(lojaId ? { loja: lojaId } : {}) });
  const contaABC = { A: abc.filter((x) => x.classe === 'A').length, B: abc.filter((x) => x.classe === 'B').length, C: abc.filter((x) => x.classe === 'C').length };
  return (
    <div className="space-y-6">
      <form className="cartao flex flex-wrap items-end gap-3 p-4">
        <label><span className="rotulo">De</span><input type="date" name="de" defaultValue={iso(de)} className="campo" /></label>
        <label><span className="rotulo">Até</span><input type="date" name="ate" defaultValue={iso(ate)} className="campo" /></label>
        {!fixa && <label><span className="rotulo">Loja</span><select name="loja" defaultValue={lojaId ?? ''} className="campo"><option value="">Toda a rede</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>}
        <button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Aplicar</button>
        <a href={`/api/admin/relatorios?${qs}`} className="ml-auto rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">⬇ Exportar vendas (CSV)</a>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi rotulo="Faturamento" valor={brl(k.receita)} variacao={k.varReceita} />
        <Kpi rotulo="Pedidos" valor={String(k.pedidos)} variacao={k.varPedidos} />
        <Kpi rotulo="Ticket médio" valor={brl(k.ticket)} variacao={k.varTicket} />
        <Kpi rotulo="Margem bruta" valor={`${k.margem.toFixed(1)}%`} ajuda="Sobre o custo médio dos itens" />
        <Kpi rotulo="Clientes únicos" valor={String(k.clientes)} ajuda={`${k.novosClientes} novos cadastros`} />
      </div>
      <section className="cartao p-5">
        <h2 className="mb-4 font-semibold">Faturamento diário</h2>
        <GraficoColunas titulo="Faturamento diário" formatar={brlCurto} dados={serie.map((d) => ({ rotulo: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`, valor: d.receita, dica: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}: ${brl(d.receita)} · ${d.pedidos} pedidos` }))} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="cartao p-5"><h2 className="mb-4 font-semibold">Por categoria</h2><BarrasHorizontais formatar={brl} dados={cat.map((c) => ({ rotulo: c.rotulo, valor: c.receita, extra: `${c.pedidos} pedidos` }))} /></section>
        {!lojaId && <section className="cartao p-5"><h2 className="mb-4 font-semibold">Por loja</h2><BarrasHorizontais formatar={brl} dados={porLoja.map((c) => ({ rotulo: c.rotulo, valor: c.receita, extra: `${c.pedidos} pedidos` }))} /></section>}
        <section className="cartao p-5"><h2 className="mb-4 font-semibold">Por canal</h2><BarrasHorizontais formatar={brl} dados={canal.map((c) => ({ rotulo: ROTULOS[c.rotulo] ?? c.rotulo, valor: c.receita, extra: `${c.pedidos} pedidos` }))} /></section>
        <section className="cartao p-5"><h2 className="mb-4 font-semibold">Por forma de pagamento</h2><BarrasHorizontais formatar={brl} dados={pag.map((c) => ({ rotulo: ROTULOS[c.rotulo] ?? c.rotulo, valor: c.receita, extra: `${c.pedidos} pedidos` }))} /></section>
        <section className="cartao p-5"><h2 className="mb-4 font-semibold">Por forma de entrega</h2><BarrasHorizontais formatar={brl} dados={mod.map((c) => ({ rotulo: ROTULOS[c.rotulo] ?? c.rotulo, valor: c.receita, extra: `${c.pedidos} pedidos` }))} /></section>
      </div>
      <section className="cartao overflow-x-auto">
        <div className="p-5 pb-3">
          <h2 className="font-semibold">Curva ABC de produtos</h2>
          <p className="text-sm text-slate-500">A = {contaABC.A} produtos que fazem 80% da receita · B = {contaABC.B} (15%) · C = {contaABC.C} (5%). Priorize estoque e negociação nos itens A.</p>
        </div>
        <table className="tabela">
          <thead><tr><th>Classe</th><th>Produto</th><th className="text-right">Unidades</th><th className="text-right">Receita</th><th className="text-right">Participação</th><th className="text-right">Acumulado</th><th className="text-right">Margem</th></tr></thead>
          <tbody>{abc.slice(0, 60).map((x) => <tr key={x.produtoId}><td><Badge cor={x.classe === 'A' ? 'emerald' : x.classe === 'B' ? 'amber' : 'slate'}>{x.classe}</Badge></td><td><Link href={`/admin/produtos/${x.produtoId}`} className="hover:text-marca-700">{x.nome}</Link></td><td className="text-right">{x.quantidade}</td><td className="text-right font-semibold">{brl(x.receita)}</td><td className="text-right">{x.participacao.toFixed(1)}%</td><td className="text-right text-slate-500">{x.acumulado.toFixed(1)}%</td><td className={`text-right ${x.margem < 20 ? 'text-rose-700' : ''}`}>{x.margem.toFixed(0)}%</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

export default function Relatorios(props: PageProps<'/admin/relatorios'>) {
  return <><TituloPagina titulo="Relatórios gerenciais" subtitulo="Vendas, margem, canais e curva ABC" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
