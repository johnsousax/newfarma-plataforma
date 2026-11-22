import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { resumoFinanceiro, garantirPlanoPadrao, GRUPOS } from '@/server/financeiro';
import { Badge, Esqueleto, TituloPagina, Vazio, cx } from '@/components/ui';
import { Icone, type NomeIcone } from '@/components/icones';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { FiltroPeriodo } from '@/components/FiltroPeriodo';
import {
  salvarLancamentoAcao, baixarLancamentoAcao, reabrirLancamentoAcao, cancelarLancamentoAcao, salvarContaFinanceiraAcao,
  salvarCategoriaFinanceiraAcao, gerarFolhaAcao, gerarRepassesAcao,
} from '@/app/acoes/admin';
import { lerPeriodo, isoDia } from '@/lib/periodo';
import { brl, data } from '@/lib/formato';

export const metadata = { title: 'Financeiro' };
type SP = Record<string, string | string[] | undefined>;

const ABAS: { id: string; rotulo: string; icone: NomeIcone }[] = [
  { id: 'visao', rotulo: 'Visão geral', icone: 'painel' }, { id: 'pagar', rotulo: 'Contas a pagar', icone: 'saida' }, { id: 'receber', rotulo: 'Contas a receber', icone: 'entrada' },
  { id: 'dre', rotulo: 'DRE', icone: 'relatorios' }, { id: 'cadastros', rotulo: 'Contas, categorias e rotinas', icone: 'configuracoes' },
];
const FORMAS = ['Pix', 'Boleto', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Débito automático'];
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');

function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: 'bom' | 'ruim' }) {
  return (
    <div className="cartao p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={cx('mt-1 text-2xl font-bold', tom === 'bom' && 'text-emerald-700', tom === 'ruim' && 'text-rose-700')}>{valor}</p>
      {detalhe && <p className="text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

async function opcoes() {
  await garantirPlanoPadrao();
  const [categorias, contas, fornecedores, funcionarios] = await Promise.all([
    db.categoriaFinanceira.findMany({ where: { ativa: true }, orderBy: [{ tipo: 'asc' }, { nome: 'asc' }] }),
    db.contaFinanceira.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' } }),
    db.fornecedor.findMany({ where: { ativo: true }, orderBy: { nomeFantasia: 'asc' }, select: { id: true, nomeFantasia: true } }),
    db.funcionario.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ]);
  return { categorias, contas, fornecedores, funcionarios };
}
type Opcoes = Awaited<ReturnType<typeof opcoes>>;

function FormLancamento({ tipo, o }: { tipo: 'RECEITA' | 'DESPESA'; o: Opcoes }) {
  const hoje = isoDia(new Date());
  return (
    <FormAcao acao={salvarLancamentoAcao} rotulo={tipo === 'DESPESA' ? 'Lançar conta a pagar' : 'Lançar conta a receber'} className="grid gap-3 md:grid-cols-4">
      <input type="hidden" name="tipo" value={tipo} />
      <label className="md:col-span-2"><span className="rotulo">Descrição</span><input name="descricao" required placeholder={tipo === 'DESPESA' ? 'Ex.: Aluguel de novembro' : 'Ex.: Convênio Empresa X'} className="campo" /></label>
      <label><span className="rotulo">Valor (R$)</span><input name="valor" required inputMode="decimal" placeholder="0,00" className="campo" /></label>
      <label><span className="rotulo">Vencimento</span><input name="vencimento" type="date" required defaultValue={hoje} className="campo" /></label>
      <label><span className="rotulo">Categoria</span><select name="categoriaId" required className="campo">{o.categorias.filter((c) => c.tipo === tipo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      {tipo === 'DESPESA'
        ? <label><span className="rotulo">Fornecedor (opcional)</span><select name="fornecedorId" className="campo"><option value="">—</option>{o.fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nomeFantasia}</option>)}</select></label>
        : <label><span className="rotulo">Cliente / pagador</span><input name="pessoa" className="campo" /></label>}
      {tipo === 'DESPESA' && <label><span className="rotulo">Funcionário (opcional)</span><select name="funcionarioId" className="campo"><option value="">—</option>{o.funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>}
      {tipo === 'DESPESA' && <label><span className="rotulo">Favorecido (outro)</span><input name="pessoa" className="campo" /></label>}
      <label><span className="rotulo">Conta</span><select name="contaId" className="campo"><option value="">—</option>{o.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label><span className="rotulo">Forma</span><select name="formaPagamento" className="campo"><option value="">—</option>{FORMAS.map((f) => <option key={f}>{f}</option>)}</select></label>
      <label><span className="rotulo">Documento / NF</span><input name="documento" className="campo" /></label>
      <label><span className="rotulo">Repetição</span><select name="modo" className="campo"><option value="unico">Uma vez</option><option value="parcelado">Parcelado (divide o valor)</option><option value="mensal">Todo mês (repete o valor)</option></select></label>
      <label><span className="rotulo">Nº de parcelas / meses</span><input name="vezes" type="number" min={1} max={60} defaultValue={1} className="campo" /></label>
      <label className="md:col-span-2"><span className="rotulo">Observação</span><input name="observacao" className="campo" /></label>
      <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="jaPago" className="h-4 w-4 accent-marca-600" />Já {tipo === 'DESPESA' ? 'paga' : 'recebida'}</label>
    </FormAcao>
  );
}

async function Lista({ tipo, sp, o }: { tipo: 'RECEITA' | 'DESPESA'; sp: SP; o: Opcoes }) {
  const per = lerPeriodo(sp, 'mes');
  const filtro = typeof sp.status === 'string' ? sp.status : 'abertos';
  const agora = new Date();
  const where = {
    tipo,
    ...(filtro === 'abertos' ? { status: 'ABERTO' as const, vencimento: { lt: per.fim } } : filtro === 'vencidos' ? { status: 'ABERTO' as const, vencimento: { lt: agora } } : filtro === 'pagos' ? { status: 'PAGO' as const, pagoEm: { gte: per.inicio, lt: per.fim } } : { vencimento: { gte: per.inicio, lt: per.fim } }),
  };
  const lista = await db.lancamento.findMany({ where, orderBy: { vencimento: 'asc' }, take: 300, include: { categoria: { select: { nome: true } }, fornecedor: { select: { nomeFantasia: true } }, funcionario: { select: { nome: true } }, conta: { select: { nome: true } } } });
  const total = lista.filter((l) => l.status !== 'CANCELADO').reduce((s, l) => s + (l.valorPago ?? l.valor), 0);
  const aba = tipo === 'DESPESA' ? 'pagar' : 'receber';
  const filtros = [['abertos', 'Em aberto'], ['vencidos', 'Vencidos'], ['pagos', tipo === 'DESPESA' ? 'Pagos' : 'Recebidos'], ['todos', 'Todos do período']];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <FiltroPeriodo base="/admin/financeiro" atual={per.chave} de={per.de} ate={per.ate} extras={{ aba, status: filtro }} />
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">{filtros.map(([k, r]) => <Link key={k} href={`/admin/financeiro?aba=${aba}&status=${k}&p=${per.chave}${per.chave === 'datas' ? `&de=${per.de}&ate=${per.ate}` : ''}`} className={cx('rounded-lg px-3 py-1', filtro === k ? 'bg-white font-semibold shadow-sm' : 'text-slate-600')}>{r}</Link>)}</div>
      </div>
      <details className="cartao p-5"><summary className="flex cursor-pointer items-center gap-2 font-semibold text-marca-700"><Icone nome="mais" />Novo lançamento</summary><div className="mt-4"><FormLancamento tipo={tipo} o={o} /></div></details>
      {!lista.length ? <Vazio icone="financeiro" titulo="Nenhum lançamento neste filtro" /> : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>{tipo === 'DESPESA' ? 'Favorecido' : 'Pagador'}</th><th>Situação</th><th className="text-right">Valor</th><th /></tr></thead>
            <tbody>
              {lista.map((l) => {
                const vencido = l.status === 'ABERTO' && l.vencimento < agora;
                return (
                  <tr key={l.id} className={l.status === 'CANCELADO' ? 'opacity-50' : ''}>
                    <td className={cx(vencido && 'font-semibold text-rose-700')}>{data(l.vencimento)}</td>
                    <td>{l.descricao}{l.documento && <span className="block text-xs text-slate-500">Doc. {l.documento}</span>}</td>
                    <td className="text-sm">{l.categoria.nome}</td>
                    <td className="text-sm">{l.fornecedor?.nomeFantasia ?? l.funcionario?.nome ?? l.pessoa ?? '—'}</td>
                    <td>{l.status === 'PAGO' ? <Badge cor="emerald">{tipo === 'DESPESA' ? 'Pago' : 'Recebido'} {l.pagoEm && data(l.pagoEm)}</Badge> : l.status === 'CANCELADO' ? <Badge cor="slate">Cancelado</Badge> : vencido ? <Badge cor="red">Vencido</Badge> : <Badge cor="amber">Em aberto</Badge>}</td>
                    <td className="text-right font-semibold">{brl(l.valorPago ?? l.valor)}</td>
                    <td className="text-right">
                      {l.status === 'ABERTO' && (
                        <details className="inline-block text-left">
                          <summary className="cursor-pointer text-sm font-semibold text-marca-700">{tipo === 'DESPESA' ? 'Pagar' : 'Receber'}</summary>
                          <div className="absolute right-4 z-10 mt-2 w-80 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
                            <FormAcao acao={baixarLancamentoAcao.bind(null, l.id)} rotulo="Confirmar baixa" className="grid gap-2">
                              <label><span className="rotulo">Data</span><input name="pagoEm" type="date" defaultValue={isoDia(new Date())} className="campo" /></label>
                              <label><span className="rotulo">Valor (R$, com juros/desconto)</span><input name="valorPago" defaultValue={reais(l.valor)} className="campo" /></label>
                              <label><span className="rotulo">Conta</span><select name="contaId" defaultValue={l.contaId ?? ''} className="campo"><option value="">—</option>{o.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
                              <label><span className="rotulo">Forma</span><select name="formaPagamento" defaultValue={l.formaPagamento ?? ''} className="campo"><option value="">—</option>{FORMAS.map((f) => <option key={f}>{f}</option>)}</select></label>
                            </FormAcao>
                          </div>
                        </details>
                      )}
                      {l.status === 'PAGO' && <BotaoAcao variante="fantasma" confirmar="Desfazer a baixa?" acao={reabrirLancamentoAcao.bind(null, l.id)}>Estornar</BotaoAcao>}
                      {l.status === 'ABERTO' && <span className="ml-2"><BotaoAcao variante="fantasma" confirmar="Cancelar este lançamento?" acao={cancelarLancamentoAcao.bind(null, l.id)}><Icone nome="excluir" /></BotaoAcao></span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={5} className="text-right font-semibold">Total</td><td className="text-right font-bold">{brl(total)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

async function Visao({ sp }: { sp: SP }) {
  const per = lerPeriodo(sp, 'mes');
  const r = await resumoFinanceiro(per.inicio, per.fim);
  const max = Math.max(1, ...r.fluxo.map((d) => Math.max(d.entradas, d.saidas)));
  const entradas = r.fluxo.reduce((s, d) => s + d.entradas, 0);
  const saidas = r.fluxo.reduce((s, d) => s + d.saidas, 0);
  const agora = new Date();
  return (
    <div className="space-y-5">
      <FiltroPeriodo base="/admin/financeiro" atual={per.chave} de={per.de} ate={per.ate} extras={{ aba: 'visao' }} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo={`Vendas · ${per.rotulo.toLowerCase()}`} valor={brl(r.vendas.liquido)} detalhe={`${r.vendas.quantidade} pedidos`} />
        <Kpi rotulo="Resultado (DRE)" valor={brl(r.dre.resultado)} detalhe={`Margem ${(r.dre.margem * 100).toFixed(1).replace('.', ',')}%`} tom={r.dre.resultado >= 0 ? 'bom' : 'ruim'} />
        <Kpi rotulo="A pagar vencido" valor={brl(r.totaisAbertos.pagarVencido)} detalhe={`${brl(r.totaisAbertos.pagar7)} nos próximos 7 dias`} tom={r.totaisAbertos.pagarVencido ? 'ruim' : undefined} />
        <Kpi rotulo="A receber vencido" valor={brl(r.totaisAbertos.receberVencido)} detalhe={`${brl(r.totaisAbertos.receber7)} nos próximos 7 dias`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="cartao p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Fluxo de caixa</h2>
            <p className="flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />Entradas {brl(entradas)}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />Saídas {brl(saidas)}</span>
              <span className="font-semibold">Saldo {brl(entradas - saidas)}</span>
            </p>
          </div>
          <div className="flex h-48 items-end gap-[3px] border-b border-slate-200" role="img" aria-label="Entradas e saídas por dia">
            {r.fluxo.map((d) => (
              <div key={d.dia} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-px">
                <span className="w-1/2 max-w-3 rounded-t-[4px] bg-emerald-600" style={{ height: `${(d.entradas / max) * 100}%` }} />
                <span className="w-1/2 max-w-3 rounded-t-[4px] bg-rose-500" style={{ height: `${(d.saidas / max) * 100}%` }} />
                <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white group-hover:block">{d.dia.split('-').reverse().slice(0, 2).join('/')} · +{brl(d.entradas)} · −{brl(d.saidas)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 flex justify-between text-[11px] text-slate-400"><span>{per.de.split('-').reverse().join('/')}</span><span>{per.ate.split('-').reverse().join('/')}</span></p>
          <p className="mt-2 text-xs text-slate-500">Entradas: vendas do site e do balcão + contas recebidas. Saídas: contas pagas.</p>
        </section>
        <section className="cartao space-y-2 p-5">
          <h2 className="font-bold">Saldos das contas</h2>
          {r.contas.map((c) => <p key={c.id} className="flex justify-between text-sm"><span>{c.nome}</span><strong className={c.saldo < 0 ? 'text-rose-700' : ''}>{brl(c.saldo)}</strong></p>)}
          <p className="text-xs text-slate-500">Saldo inicial + baixas registradas em cada conta.</p>
        </section>
      </div>
      <section className="cartao p-5">
        <h2 className="mb-3 font-bold">Vencidos e vencendo em 7 dias</h2>
        {!r.abertos.length ? <p className="text-sm text-slate-500">Nada vencendo. Tudo em dia.</p> : (
          <ul className="divide-y divide-slate-100">
            {r.abertos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="flex items-center gap-2"><Icone nome={a.tipo === 'DESPESA' ? 'saida' : 'entrada'} className={cx('h-4 w-4', a.tipo === 'DESPESA' ? 'text-rose-600' : 'text-emerald-600')} />{a.descricao}<span className="text-slate-500">· {a.fornecedor?.nomeFantasia ?? a.funcionario?.nome ?? a.pessoa ?? ''}</span></span>
                <span className="flex items-center gap-3"><span className={cx(a.vencimento < agora && 'font-semibold text-rose-700')}>{data(a.vencimento)}</span><strong>{brl(a.valor)}</strong><Link href={`/admin/financeiro?aba=${a.tipo === 'DESPESA' ? 'pagar' : 'receber'}&status=vencidos`} className="link">Ver</Link></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Linha({ r, v, forte, menos, nivel = 0 }: { r: string; v: number; forte?: boolean; menos?: boolean; nivel?: number }) {
  return (
    <tr className={forte ? 'bg-slate-50 font-bold' : ''}><td style={{ paddingLeft: 12 + nivel * 18 }}>{r}</td><td className={cx('text-right tabular-nums', menos && v > 0 && 'text-rose-700')}>{menos && v > 0 ? `(${brl(v)})` : brl(v)}</td></tr>
  );
}

async function Dre({ sp }: { sp: SP }) {
  const per = lerPeriodo(sp, 'mes');
  const { dre } = await resumoFinanceiro(per.inicio, per.fim);
  const grupos = Object.entries(GRUPOS).filter(([, g]) => !g.fora).sort((a, b) => a[1].ordem - b[1].ordem);
  const fora = Object.entries(GRUPOS).filter(([, g]) => g.fora);
  return (
    <div className="space-y-4">
      <FiltroPeriodo base="/admin/financeiro" atual={per.chave} de={per.de} ate={per.ate} extras={{ aba: 'dre' }} />
      <div className="cartao max-w-3xl overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Demonstração de resultado · {per.rotulo}</th><th className="text-right">Valor</th></tr></thead>
          <tbody>
            <Linha r="Receita bruta de vendas (produtos + frete)" v={dre.receitaVendas} forte />
            <Linha r="(−) Descontos e cupons" v={dre.descontos} menos nivel={1} />
            <Linha r="(−) Custo das mercadorias vendidas (CMV)" v={dre.custoMercadorias} menos nivel={1} />
            <Linha r="= Lucro bruto" v={dre.lucroBruto} forte />
            {grupos.map(([k, g]) => {
              const itens = dre.linhas.filter((l) => l.grupo === k);
              if (!itens.length) return null;
              const tot = itens.reduce((s, l) => s + (l.tipo === 'RECEITA' ? l.total : -l.total), 0);
              return [
                <Linha key={k} r={g.rotulo} v={Math.abs(tot)} menos={tot < 0} forte={false} />,
                ...itens.map((l) => <Linha key={k + l.categoria} r={l.categoria} v={l.total} menos={l.tipo === 'DESPESA'} nivel={1} />),
              ];
            })}
            <Linha r="= Resultado operacional do período" v={dre.resultado} forte />
          </tbody>
        </table>
      </div>
      {dre.linhas.some((l) => GRUPOS[l.grupo]?.fora) && (
        <div className="cartao max-w-3xl p-5 text-sm">
          <h3 className="mb-2 font-semibold">Fora do resultado (movimentam o caixa)</h3>
          {fora.map(([k, g]) => { const v = dre.linhas.filter((l) => l.grupo === k).reduce((s, l) => s + l.total, 0); return v ? <p key={k} className="flex justify-between"><span>{g.rotulo}</span><span>{brl(v)}</span></p> : null; })}
        </div>
      )}
      <p className="text-xs text-slate-500">Regime de competência. O CMV usa o custo médio registrado em cada venda. Lançamentos cancelados não entram.</p>
    </div>
  );
}

async function Cadastros({ sp, o }: { sp: SP; o: Opcoes }) {
  const per = lerPeriodo(sp, 'mes');
  const todasContas = await db.contaFinanceira.findMany({ orderBy: { nome: 'asc' } });
  const mes = isoDia(new Date()).slice(0, 7);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="cartao space-y-3 p-5">
        <h2 className="font-bold">Rotinas</h2>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="mb-2 text-sm font-semibold">Gerar folha de pagamento</p>
          <p className="mb-3 text-xs text-slate-500">Cria as contas a pagar de salário e benefícios de cada funcionário ativo, somando horas extras e bônus e descontando faltas, descontos e adiantamentos do mês.</p>
          <FormAcao acao={gerarFolhaAcao} rotulo="Gerar folha" className="flex flex-wrap items-end gap-2"><input name="mes" type="month" defaultValue={mes} className="campo w-auto" /></FormAcao>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="mb-2 text-sm font-semibold">Repasse dos motoboys</p>
          <p className="mb-3 text-xs text-slate-500">Lança em contas a pagar o total de cada motoboy pelas entregas concluídas em {per.rotulo.toLowerCase()}.</p>
          <FiltroPeriodo base="/admin/financeiro" atual={per.chave} de={per.de} ate={per.ate} extras={{ aba: 'cadastros' }} />
          <div className="mt-3"><BotaoAcao variante="primario" acao={gerarRepassesAcao.bind(null, per.de, per.ate)}>Gerar repasses</BotaoAcao></div>
        </div>
        <p className="text-xs text-slate-500">Compras recebidas em Compras entram sozinhas em contas a pagar (vencimento em 28 dias, ajustável).</p>
      </section>
      <section className="cartao space-y-3 p-5">
        <h2 className="font-bold">Contas (caixa e bancos)</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {todasContas.map((c) => (
            <li key={c.id} className="py-2">
              <details><summary className="flex cursor-pointer justify-between"><span>{c.nome} <span className="text-xs text-slate-500">{c.tipo}</span> {!c.ativa && <Badge cor="slate">Inativa</Badge>}</span><span className="text-slate-500">saldo inicial {brl(c.saldoInicial)}</span></summary>
                <FormAcao acao={salvarContaFinanceiraAcao} className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="nome" defaultValue={c.nome} className="campo" aria-label="Nome" />
                  <select name="tipo" defaultValue={c.tipo} className="campo" aria-label="Tipo"><option value="CAIXA">Caixa</option><option value="BANCO">Banco</option><option value="CARTEIRA">Carteira digital</option></select>
                  <input name="saldoInicial" defaultValue={reais(c.saldoInicial)} className="campo" aria-label="Saldo inicial" />
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="inativa" defaultChecked={!c.ativa} />Inativa</label>
                </FormAcao>
              </details>
            </li>
          ))}
        </ul>
        <FormAcao acao={salvarContaFinanceiraAcao} rotulo="Adicionar conta" className="grid gap-2 sm:grid-cols-3">
          <input name="nome" required placeholder="Ex.: Banco do Brasil" className="campo" />
          <select name="tipo" className="campo"><option value="BANCO">Banco</option><option value="CAIXA">Caixa</option><option value="CARTEIRA">Carteira digital</option></select>
          <input name="saldoInicial" placeholder="Saldo inicial" className="campo" />
        </FormAcao>
      </section>
      <section className="cartao space-y-3 p-5 xl:col-span-2">
        <h2 className="font-bold">Plano de contas (categorias)</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(['DESPESA', 'RECEITA'] as const).map((t) => (
            <div key={t}>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{t === 'DESPESA' ? 'Despesas' : 'Receitas'}</p>
              <ul className="space-y-1 text-sm">{o.categorias.filter((c) => c.tipo === t).map((c) => <li key={c.id} className="flex justify-between"><span>{c.nome}</span><span className="text-xs text-slate-400">{GRUPOS[c.grupo]?.rotulo}</span></li>)}</ul>
            </div>
          ))}
        </div>
        <FormAcao acao={salvarCategoriaFinanceiraAcao} rotulo="Criar categoria" className="grid gap-2 sm:grid-cols-3">
          <input name="nome" required placeholder="Nome da categoria" className="campo" />
          <select name="tipo" className="campo"><option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option></select>
          <select name="grupo" className="campo">{Object.entries(GRUPOS).map(([k, g]) => <option key={k} value={k}>{g.rotulo}</option>)}</select>
        </FormAcao>
      </section>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  await paginaAdmin('financeiro');
  const sp = await searchParams;
  const aba = ABAS.find((a) => a.id === sp.aba)?.id ?? 'visao';
  const o = await opcoes();
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-2">
        {ABAS.map((a) => <Link key={a.id} href={`/admin/financeiro?aba=${a.id}`} className={cx('inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm', a.id === aba ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}><Icone nome={a.icone} className="h-4 w-4" />{a.rotulo}</Link>)}
      </nav>
      {aba === 'visao' ? <Visao sp={sp} /> : aba === 'pagar' ? <Lista tipo="DESPESA" sp={sp} o={o} /> : aba === 'receber' ? <Lista tipo="RECEITA" sp={sp} o={o} /> : aba === 'dre' ? <Dre sp={sp} /> : <Cadastros sp={sp} o={o} />}
    </div>
  );
}

export default function Financeiro(props: { searchParams: Promise<SP> }) {
  return <><TituloPagina titulo="Financeiro" subtitulo="Contas a pagar e receber, fluxo de caixa, saldos e DRE" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
