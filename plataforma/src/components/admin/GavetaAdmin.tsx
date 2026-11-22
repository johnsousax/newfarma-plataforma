'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Icone } from '@/components/icones';
import { cx } from '@/components/ui';

/** Menu do painel no celular: abre uma gaveta e fecha ao clicar fora, trocar de página ou apertar Esc. */
export function GavetaAdmin({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const rota = usePathname();
  const [rotaAnterior, setRotaAnterior] = useState(rota);
  if (rota !== rotaAnterior) { setRotaAnterior(rota); setAberto(false); }
  const noNavegador = useSyncExternalStore(() => () => {}, () => true, () => false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    const clique = (e: MouseEvent) => { if ((e.target as HTMLElement).closest('a')) setAberto(false); };
    document.addEventListener('keydown', esc);
    caixa.current?.addEventListener('click', clique);
    const c = caixa.current;
    return () => { document.removeEventListener('keydown', esc); c?.removeEventListener('click', clique); };
  }, [aberto]);
  return (
    <>
      <button type="button" onClick={() => setAberto((a) => !a)} className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden" aria-label={aberto ? 'Fechar menu' : 'Abrir menu'} aria-expanded={aberto}>
        <Icone nome={aberto ? 'fechar' : 'menu'} className="h-6 w-6" />
      </button>
      {noNavegador && createPortal(
        <>
          <div onClick={() => setAberto(false)} className={cx('fixed inset-0 z-[60] bg-slate-950/40 transition-opacity lg:hidden', aberto ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-hidden />
          <div ref={caixa} className={cx('fixed inset-y-0 left-0 z-[70] w-72 max-w-[85vw] overflow-y-auto bg-slate-900 p-3 shadow-2xl transition-transform duration-200 lg:hidden', aberto ? 'translate-x-0' : '-translate-x-full')}>
            <div className="mb-2 flex justify-end"><button type="button" onClick={() => setAberto(false)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Fechar menu"><Icone nome="fechar" className="h-5 w-5" /></button></div>
            {children}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
