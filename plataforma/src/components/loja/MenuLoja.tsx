'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icone, IconeProduto } from '@/components/icones';
import { cx } from '@/components/ui';

type Cat = { id: string; nome: string; slug: string; icone: string; cor: string; filhas: { id: string; nome: string; slug: string; icone: string }[] };

/** Menu único (três tracinhos): abre um painel lateral e fecha ao clicar fora, trocar de página ou apertar Esc. */
export function MenuLoja({ categorias, whatsapp }: { categorias: Cat[]; whatsapp: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [expandida, setExpandida] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const rota = usePathname();
  const noNavegador = useSyncExternalStore(() => () => {}, () => true, () => false);

  // fecha ao trocar de página (ajuste de estado durante a renderização, padrão do React)
  const [rotaAnterior, setRotaAnterior] = useState(rota);
  if (rota !== rotaAnterior) { setRotaAnterior(rota); setAberto(false); }
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (!caixa.current?.contains(alvo) && !botao.current?.contains(alvo)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(false); botao.current?.focus(); } };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const item = 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-marca-600 hover:bg-marca-50';
  return (
    <>
      <button ref={botao} type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} aria-controls="menu-loja" aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-marca-600 hover:bg-marca-50">
        <Icone nome={aberto ? 'fechar' : 'menu'} className="h-6 w-6" />
      </button>
      {noNavegador && createPortal(<>
      <div onClick={() => setAberto(false)} className={cx('fixed inset-0 z-[60] bg-marca-950/30 transition-opacity', aberto ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-hidden />
      <nav id="menu-loja" ref={caixa} aria-label="Menu principal"
        className={cx('fixed inset-y-0 left-0 z-[70] flex w-80 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-2xl transition-transform duration-200', aberto ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-500">Navegar</span>
          <button type="button" onClick={() => setAberto(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar menu"><Icone nome="fechar" className="h-5 w-5" /></button>
        </div>
        <div className="space-y-1 p-3">
          <Link href="/ofertas" className={cx(item, 'text-oferta-600 hover:bg-oferta-50')}><Icone nome="oferta" className="h-5 w-5" />Ofertas da semana</Link>
          <Link href="/assistente" className={item}><Icone nome="assistente" className="h-5 w-5" />Tire dúvidas sobre remédios</Link>
        </div>
        <p className="px-6 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Departamentos</p>
        <ul className="space-y-0.5 px-3 pb-3">
          {categorias.map((c) => (
            <li key={c.id}>
              <div className="flex items-center">
                <Link href={`/categoria/${c.slug}`} className={cx(item, 'flex-1')}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${c.cor}14`, color: c.cor }}><IconeProduto emoji={c.icone} className="h-[18px] w-[18px]" /></span>
                  {c.nome}
                </Link>
                {c.filhas.length > 0 && (
                  <button type="button" onClick={() => setExpandida((x) => (x === c.id ? null : c.id))} aria-expanded={expandida === c.id} aria-label={`Ver subcategorias de ${c.nome}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                    <Icone nome="seta" className={cx('h-4 w-4 transition-transform', expandida === c.id ? 'rotate-90' : '')} />
                  </button>
                )}
              </div>
              {expandida === c.id && (
                <ul className="mb-2 ml-14 space-y-0.5 border-l border-slate-100 pl-3">
                  {c.filhas.map((f) => <li key={f.id}><Link href={`/categoria/${f.slug}`} className="block rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-marca-600">{f.nome}</Link></li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-auto space-y-1 border-t border-slate-100 p-3">
          <Link href="/conta" className={item}><Icone nome="usuario" className="h-5 w-5" />Minha conta</Link>
          <Link href="/conta/pedidos" className={item}><Icone nome="pedidos" className="h-5 w-5" />Meus pedidos</Link>
          <Link href="/lojas" className={item}><Icone nome="local" className="h-5 w-5" />Nossa loja</Link>
          {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={item}><Icone nome="whatsapp" className="h-5 w-5" />Fale no WhatsApp</a>}
        </div>
      </nav>
      </>, document.body)}
    </>
  );
}
