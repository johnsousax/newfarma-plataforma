// Gráficos de série única em HTML/CSS (sem biblioteca): barras finas na cor da marca,
// grade discreta, rótulos em tinta neutra e tooltip ao passar o mouse/foco em cada coluna.
import { cx } from '@/components/ui';

type Ponto = { rotulo: string; valor: number; dica: string };

function escala(max: number) {
  if (max <= 0) return { topo: 1, marcas: [0] };
  const p = 10 ** Math.floor(Math.log10(max));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => max / s <= 4) ?? p * 10;
  const topo = Math.ceil(max / passo) * passo;
  return { topo, marcas: Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo) };
}

export function GraficoColunas({ dados, formatar, titulo, altura = 220 }: { dados: Ponto[]; formatar: (n: number) => string; titulo: string; altura?: number }) {
  const { topo, marcas } = escala(Math.max(...dados.map((d) => d.valor), 0));
  const cadaRotulo = Math.max(1, Math.ceil(dados.length / 10));
  return (
    <figure>
      <figcaption className="sr-only">{titulo}</figcaption>
      <div className="flex gap-2">
        <div className="relative w-14 shrink-0 text-right text-[11px] text-slate-400" style={{ height: altura }}>
          {marcas.map((m) => <span key={m} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(m / topo) * 100}%` }}>{formatar(m)}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-0" style={{ height: altura }}>
            {marcas.map((m) => <div key={m} className={cx('absolute inset-x-0 border-t', m === 0 ? 'border-slate-300' : 'border-slate-100')} style={{ bottom: `${(m / topo) * 100}%` }} />)}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height: altura }}>
            {dados.map((d, i) => (
              <div key={i} tabIndex={0} className="group relative flex h-full flex-1 items-end outline-none" aria-label={d.dica}>
                <div className="w-full rounded-t-[4px] bg-marca-500 transition group-hover:bg-marca-700 group-focus:bg-marca-700" style={{ height: `${(d.valor / topo) * 100}%`, minHeight: d.valor ? 2 : 0 }} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block group-focus:block">{d.dica}</div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-[2px] text-[11px] text-slate-400">
            {dados.map((d, i) => <span key={i} className="flex-1 text-center">{i % cadaRotulo === 0 ? d.rotulo : ''}</span>)}
          </div>
        </div>
      </div>
    </figure>
  );
}

/** Barras horizontais para rankings (uma série, rótulo direto do valor). */
export function BarrasHorizontais({ dados, formatar }: { dados: { rotulo: string; valor: number; extra?: string }[]; formatar: (n: number) => string }) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <ul className="space-y-2.5">
      {dados.map((d) => (
        <li key={d.rotulo} className="group text-sm" title={`${d.rotulo}: ${formatar(d.valor)}${d.extra ? ` · ${d.extra}` : ''}`}>
          <div className="mb-1 flex justify-between gap-3"><span className="truncate text-slate-700">{d.rotulo}</span><span className="shrink-0 font-semibold text-slate-900">{formatar(d.valor)}</span></div>
          <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-marca-500 group-hover:bg-marca-700" style={{ width: `${(d.valor / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Kpi({ rotulo, valor, variacao, ajuda }: { rotulo: string; valor: string; variacao?: number | null; ajuda?: string }) {
  return (
    <div className="cartao p-5">
      <p className="text-sm text-slate-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{valor}</p>
      {variacao != null ? (
        <p className={cx('mt-1 text-xs font-semibold', variacao >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{variacao >= 0 ? '▲' : '▼'} {Math.abs(variacao).toFixed(1)}% <span className="font-normal text-slate-500">vs. período anterior</span></p>
      ) : ajuda ? <p className="mt-1 text-xs text-slate-500">{ajuda}</p> : null}
    </div>
  );
}
