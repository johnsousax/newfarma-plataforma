import { Suspense } from 'react';
import { connection } from 'next/server';
import { paginaAdmin } from '@/server/auth';
import { caixaAberto, resumoCaixa } from '@/server/admin/operacoes';
import { db } from '@/server/db';
import { Aviso, Esqueleto, TituloPagina, Badge } from '@/components/ui';
import { FormAcao } from '@/components/admin/Acoes';
import { Pdv } from '@/components/admin/Pdv';
import { abrirCaixaAcao, fecharCaixaAcao, movimentarCaixaAcao } from '@/app/acoes/admin';
import { METODO_PAGAMENTO } from '@/lib/dominio';
import { brl, dataHora } from '@/lib/formato';

export const metadata = { title: 'PDV' };

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('pdv');
  if (!u.lojaId) return <Aviso tipo="alerta">Seu usuário não está vinculado a uma loja. Peça ao administrador para definir sua loja em Equipe.</Aviso>;
  const caixa = await caixaAberto(u.id);
  if (!caixa) {
    const ultimos = await db.caixaSessao.findMany({ where: { operadorId: u.id, status: 'FECHADO' }, orderBy: { fechadoEm: 'desc' }, take: 5 });
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <FormAcao acao={abrirCaixaAcao} rotulo="Abrir caixa" className="cartao space-y-3 p-6">
          <h2 className="text-lg font-bold">Abrir caixa</h2>
          <label className="block"><span className="rotulo">Fundo de troco (R$)</span><input name="valor" defaultValue="200,00" className="campo text-lg" /></label>
        </FormAcao>
        <div className="cartao p-6 text-sm">
          <h2 className="mb-3 font-semibold">Últimos fechamentos</h2>
          {ultimos.map((c) => <p key={c.id} className="flex justify-between border-b border-slate-100 py-2"><span>{dataHora(c.fechadoEm)}</span><span>Esperado {brl(c.valorEsperado ?? 0)} · <strong className={c.diferenca ? 'text-rose-700' : 'text-emerald-700'}>{c.diferenca ? `dif. ${brl(c.diferenca)}` : 'sem diferença'}</strong></span></p>)}
          {!ultimos.length && <p className="text-slate-500">Nenhum.</p>}
        </div>
      </div>
    );
  }
  const r = resumoCaixa(caixa);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge cor="emerald" className="px-3 py-1">● Caixa aberto · {caixa.loja.nome}</Badge>
        <span className="text-slate-500">desde {dataHora(caixa.abertoEm)} · vendas {brl(r.totalVendas)} · dinheiro na gaveta {brl(r.dinheiroEsperado)}</span>
      </div>
      <Pdv farmaceutico={u.papel === 'FARMACEUTICO'} />
      <details className="cartao p-5">
        <summary className="cursor-pointer font-semibold">Sangria, suprimento e fechamento</summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <FormAcao acao={movimentarCaixaAcao} rotulo="Registrar">
            <select name="tipo" className="campo"><option value="SANGRIA">Sangria (retirada)</option><option value="SUPRIMENTO">Suprimento (reforço)</option></select>
            <input name="valor" placeholder="Valor (R$)" required className="campo" />
            <input name="descricao" placeholder="Descrição" className="campo" />
          </FormAcao>
          <div className="text-sm">
            <p className="mb-2 font-semibold">Vendas por forma de pagamento</p>
            {Object.entries(r.porMetodo).map(([m, v]) => <p key={m} className="flex justify-between"><span>{METODO_PAGAMENTO[m as keyof typeof METODO_PAGAMENTO]}</span><strong>{brl(v)}</strong></p>)}
            <p className="mt-2 flex justify-between border-t pt-2"><span>Dinheiro esperado</span><strong>{brl(r.dinheiroEsperado)}</strong></p>
          </div>
          <FormAcao acao={fecharCaixaAcao} rotulo="Fechar caixa" variante="escuro">
            <label className="block"><span className="rotulo">Dinheiro contado na gaveta (R$)</span><input name="valor" required className="campo" /></label>
          </FormAcao>
        </div>
      </details>
    </div>
  );
}

export default function PaginaPdv() {
  return <><TituloPagina titulo="PDV — Venda no balcão" subtitulo="Leitor de código de barras, pagamento presencial, pontos por CPF e dispensação com escrituração" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
