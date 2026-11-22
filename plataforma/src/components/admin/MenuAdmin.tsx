'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';

export type ItemMenu = { href: string; icone: string; rotulo: string; grupo: string; contador?: number };

export function MenuAdmin({ itens }: { itens: ItemMenu[] }) {
  const atual = usePathname();
  const grupos = [...new Set(itens.map((i) => i.grupo))];
  return (
    <nav className="space-y-5" aria-label="Painel">
      {grupos.map((g) => (
        <div key={g}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g}</p>
          {itens.filter((i) => i.grupo === g).map((i) => {
            const ativo = i.href === '/admin' ? atual === '/admin' : atual.startsWith(i.href);
            return (
              <Link key={i.href} href={i.href} aria-current={ativo ? 'page' : undefined} className={cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', ativo ? 'bg-white/10 font-semibold text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white')}>
                <span aria-hidden className="w-5 text-center">{i.icone}</span>
                <span className="flex-1">{i.rotulo}</span>
                {!!i.contador && <span className="rounded-full bg-oferta-600 px-1.5 text-[11px] font-bold text-white">{i.contador}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
