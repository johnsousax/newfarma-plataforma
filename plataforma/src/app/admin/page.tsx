import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { kpis, vendasPorDia, topProdutos, vendasPor, pedidosPorStatus, periodoDe } from '@/server/admin/relatorios';
import { alertas } from '@/server/estoque';
import { GraficoColunas, BarrasHorizontais, Kpi } from '@/components/admin/Graficos';
import { Aviso, Badge, Esqueleto, TituloPagina } from '@/components/ui';
import { STATUS_PEDIDO, pode } from '@/lib/dominio';
import { brl, dataHora } from '@/lib/formato';

const brlCurto = (c: number) => (c >= 100_000_00 ? `R$${(c / 100_000_00).toFixed(1)}M` : c >= 100_000 ? `R$${(c / 100_000).toFixed(0)}k` : brl(c).replace(',00', ''));
const CANAL: Record<string, string> = { SITE: 'Site', PDV: 'Loja (PDV)', IFOOD: 'iFood', WHATSAPP: 'WhatsApp' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/admin'>['searchParams'] }) {
  await connection();
  const u = await paginaAdmin('painel');
  const sp = await searchParams;
  const dias = [7, 30, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const loja = lojaDoUsuario(u);
  const per = periodoDe(dias, loja);
  const verVendas = pode(u.papel, 'relatorios');
  const [k, serie, top, canais, status, al, receitas, recentes] = await Promise.all([
    kpis(per), vendasPorDia(per), topProdutos(per, 8), vendasPor('canal', per), pedidosPorStatus(loja),
    pode(u.papel, 'estoque') ? alertas(loja ?? undefined) : Promise.resolve([]),
    db.receita.count({ where: { status: 'PENDENTE' } }),
    db.pedido.findMany({ where: loja ? { lojaId: loja } : {}, orderBy: { criadoEm: 'desc' }, take: 8, include: { loja: { select: { nome: true } } } }),
  ]);
  const contAlertas = { RUPTURA: 0, REPOSICAO: 0, VENCIDO: 0, VENCENDO: 0 };
  for (const a of al) contAlertas[a.tipo]++;

  return (
    <div className="space-y-6">
      {sp.negado && <Aviso tipo="alerta">Seu perfil não tem acesso àquela área.</Aviso>}
      <TituloPagina titulo={`Bom dia, ${u.nome.split(' ')[0]}`} subtitulo={loja ? 'Indicadores da sua loja' : 'Indicadores de toda a rede'} acoes={
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
          {[7, 30, 90].map((d) => <Link key={d} href={`/admin?dias=${d}`} className={`rounded-lg px-3 py-1.5 ${d === dias ? 'bg-slate-900 font-semibold text-white' : 'text-slate-600'}`}>{d} dias</Link>)}
        </div>
      } />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries({ PAGO: 'Pagos — separar', AGUARDANDO_RECEITA: 'Aguardando receita', EM_SEPARACAO: 'Em separação', SAIU_PARA_ENTREGA: 'Em rota' }).map(([s, r]) => (
          <Link key={s} href={`/admin/pedidos?status=${s}`} className="cartao flex items-center justify-between p-4 hover:shadow-md">
            <span className="text-sm text-slate-600">{r}</span>
            <span className="text-2xl font-bold">{status[s] ?? 0}</span>
          </Link>
        ))}
      </div>

      {(receitas > 0 || contAlertas.RUPTURA + contAlertas.VENCIDO > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {receitas > 0 && pode(u.papel, 'verReceitas') && <Link href="/admin/receitas"><Aviso tipo="alerta"><strong>{receitas} receita(s)</strong> aguardando validação farmacêutica →</Aviso></Link>}
          {contAlertas.RUPTURA + contAlertas.VENCIDO > 0 && <Link href="/admin/estoque"><Aviso tipo="erro"><strong>{contAlertas.RUPTURA}</strong> rupturas e <strong>{contAlertas.VENCIDO}</strong> lotes vencidos · {contAlertas.REPOSICAO} itens abaixo do mínimo →</Aviso></Link>}
        </div>
      )}

      {verVendas && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi rotulo="Faturamento" valor={brl(k.receita)} variacao={k.varReceita} />
            <Kpi rotulo="Pedidos" valor={String(k.pedidos)} variacao={k.varPedidos} />
            <Kpi rotulo="Ticket médio" valor={brl(k.ticket)} variacao={k.varTicket} />
            <Kpi rotulo="Margem bruta" valor={`${k.margem.toFixed(1)}%`} ajuda={`${k.clientes} clientes compraram · ${k.novosClientes} novos cadastros`} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <section className="cartao p-5">
              <h2 className="mb-1 font-semibold">Faturamento por dia</h2>
              <p className="mb-4 text-xs text-slate-500">Pedidos pagos, em separação, enviados e entregues · últimos {dias} dias</p>
              <GraficoColunas titulo="Faturamento diário" formatar={brlCurto} dados={serie.map((d) => ({ rotulo: d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7), valor: d.receita, dica: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}: ${brl(d.receita)} · ${d.pedidos} pedidos` }))} />
            </section>
            <section className="cartao p-5">
              <h2 className="mb-4 font-semibold">Vendas por canal</h2>
              <BarrasHorizontais formatar={brl} dados={canais.map((c) => ({ rotulo: CANAL[c.rotulo] ?? c.rotulo, valor: c.receita, extra: `${c.pedidos} pedidos` }))} />
            </section>
          </div>
          <section className="cartao p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Produtos mais vendidos</h2><Link href="/admin/relatorios" className="link text-sm">Relatórios completos →</Link></div>
            <BarrasHorizontais formatar={brl} dados={top.map((t) => ({ rotulo: t.nome, valor: t.receita, extra: `${t.quantidade} un. · margem ${t.margem.toFixed(0)}%` }))} />
          </section>
        </>
      )}

      <section className="cartao overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3"><h2 className="font-semibold">Pedidos recentes</h2><Link href="/admin/pedidos" className="link text-sm">Ver todos →</Link></div>
        <table className="tabela">
          <thead><tr><th>Nº</th><th>Cliente</th><th>Loja</th><th>Status</th><th>Quando</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {recentes.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/admin/pedidos/${p.id}`} className="link">#{p.numero}</Link></td>
                <td>{p.clienteNome ?? '—'}</td><td>{p.loja.nome}</td>
                <td><Badge cor={STATUS_PEDIDO[p.status].cor}>{STATUS_PEDIDO[p.status].rotulo}</Badge></td>
                <td className="text-slate-500">{dataHora(p.criadoEm)}</td>
                <td className="text-right font-semibold">{brl(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default function Painel(props: PageProps<'/admin'>) {
  return <Suspense fallback={<div className="space-y-4"><Esqueleto className="h-10 w-64" /><Esqueleto className="h-28" /><Esqueleto className="h-72" /></div>}><Conteudo searchParams={props.searchParams} /></Suspense>;
}
