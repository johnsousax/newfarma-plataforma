import Link from 'next/link';
import { PERIODOS, type ChavePeriodo } from '@/lib/periodo';
import { Icone } from '@/components/icones';
import { cx } from '@/components/ui';

/** Atalhos (hoje, 7 dias, 30 dias, mês) e calendário de/até. Funciona sem JavaScript (formulário GET). */
export function FiltroPeriodo({ base, atual, de, ate, extras = {} }: { base: string; atual: ChavePeriodo; de: string; ate: string; extras?: Record<string, string> }) {
  const url = (q: Record<string, string>) => `${base}?${new URLSearchParams({ ...extras, ...q })}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIODOS.map((p) => (
        <Link key={p.chave} href={url({ p: p.chave })} className={cx('rounded-full px-3 py-1.5 text-sm', atual === p.chave ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}>{p.rotulo}</Link>
      ))}
      <form action={base} className={cx('flex flex-wrap items-center gap-1 rounded-full px-2 py-1 text-sm ring-1', atual === 'datas' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white ring-slate-200')}>
        {Object.entries(extras).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Icone nome="calendario" className="h-4 w-4" />
        <input type="date" name="de" defaultValue={de} aria-label="De" className="rounded bg-transparent px-1 text-inherit [color-scheme:light]" />
        <span>a</span>
        <input type="date" name="ate" defaultValue={ate} aria-label="Até" className="rounded bg-transparent px-1 text-inherit" />
        <button className="rounded-full bg-marca-600 px-2.5 py-0.5 text-xs font-semibold text-white">Ver</button>
      </form>
    </div>
  );
}
