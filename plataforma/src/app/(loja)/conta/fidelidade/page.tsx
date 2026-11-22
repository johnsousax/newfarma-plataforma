import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { Esqueleto, TituloPagina } from '@/components/ui';
import { NIVEIS_FIDELIDADE, nivelFidelidade } from '@/lib/dominio';
import { brl, data } from '@/lib/formato';
import { diasAtras } from '@/lib/tempo';

export const metadata = { title: 'Pontos e níveis' };

async function Conteudo() {
  await connection();
  const u = await exigirLogin('/conta/fidelidade');
  const umAno = diasAtras(365);
  const [mov, gasto] = await Promise.all([
    db.movimentoPontos.findMany({ where: { usuarioId: u.id }, orderBy: { criadoEm: 'desc' }, take: 50 }),
    db.pedido.aggregate({ where: { usuarioId: u.id, status: 'ENTREGUE', criadoEm: { gte: umAno } }, _sum: { total: true } }),
  ]);
  const g = gasto._sum.total ?? 0;
  const n = nivelFidelidade(g);
  const progresso = n.proximo ? ((g - n.minimo) / (n.proximo.minimo - n.minimo)) * 100 : 100;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-gradient-to-br from-marca-700 to-marca-500 p-6 text-white">
          <p className="text-sm text-white/80">Saldo</p>
          <p className="text-5xl font-extrabold">{u.pontos}</p>
          <p className="text-white/90">pontos = {brl(Math.floor(u.pontos / 100) * 500)} em desconto</p>
          <p className="mt-3 text-xs text-white/70">Use no checkout em múltiplos de 100 (até 30% do pedido). Pontos valem 12 meses.</p>
        </div>
        <div className="cartao p-6">
          <p className="text-sm text-slate-500">Seu nível</p>
          <p className="text-3xl font-extrabold" style={{ color: n.cor }}>{n.nome} · {n.multiplicador}x pontos</p>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${progresso}%`, background: n.cor }} /></div>
          <p className="mt-2 text-sm text-slate-600">{n.proximo ? <>Compre mais <strong>{brl(n.faltam)}</strong> em 12 meses para chegar ao {n.proximo.nome}.</> : 'Você está no nível máximo!'}</p>
          <ul className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            {NIVEIS_FIDELIDADE.map((x) => <li key={x.nome} className="rounded-xl border p-2" style={{ borderColor: x.cor }}><strong style={{ color: x.cor }}>{x.nome}</strong><br />{x.multiplicador}x · {x.minimo ? `${brl(x.minimo)}+` : 'início'}</li>)}
          </ul>
        </div>
      </div>
      <section className="cartao overflow-hidden">
        <h2 className="p-5 pb-3 text-lg font-bold">Extrato</h2>
        <table className="tabela">
          <thead><tr><th>Data</th><th>Descrição</th><th>Validade</th><th className="text-right">Pontos</th></tr></thead>
          <tbody>
            {mov.map((m) => <tr key={m.id}><td>{data(m.criadoEm)}</td><td>{m.descricao}</td><td>{m.expiraEm ? data(m.expiraEm) : '—'}</td><td className={`text-right font-semibold ${m.pontos > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{m.pontos > 0 ? '+' : ''}{m.pontos}</td></tr>)}
            {!mov.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Sem movimentações ainda.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default function Fidelidade() {
  return <><TituloPagina titulo="Pontos e níveis" subtitulo="1 ponto por real gasto · Bronze, Prata e Ouro" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
