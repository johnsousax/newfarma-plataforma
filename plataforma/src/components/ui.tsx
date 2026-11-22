import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { brl, percentual } from '@/lib/formato';
import { Icone, IconeProduto, type NomeIcone } from '@/components/icones';
import { REGRAS } from '@/lib/dominio';
import type { Classificacao } from '@/generated/prisma/enums';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const VARIANTES = {
  primario: 'bg-marca-600 text-white hover:bg-marca-700 shadow-sm',
  secundario: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50',
  oferta: 'bg-oferta-600 text-white hover:bg-oferta-700 shadow-sm',
  fantasma: 'text-slate-700 hover:bg-slate-100',
  perigo: 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50',
  escuro: 'bg-slate-900 text-white hover:bg-slate-800',
} as const;
const TAMANHOS = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3.5 text-base' } as const;

type BotaoProps = { variante?: keyof typeof VARIANTES; tamanho?: keyof typeof TAMANHOS; bloco?: boolean };

export function Botao({ variante = 'primario', tamanho = 'md', bloco, className, ...p }: BotaoProps & ComponentProps<'button'>) {
  return (
    <button
      {...p}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', VARIANTES[variante], TAMANHOS[tamanho], bloco && 'w-full', className)}
    />
  );
}

export function BotaoLink({ variante = 'primario', tamanho = 'md', bloco, className, ...p }: BotaoProps & ComponentProps<typeof Link>) {
  return <Link {...p} className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition', VARIANTES[variante], TAMANHOS[tamanho], bloco && 'w-full', className)} />;
}

const CORES_BADGE: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  zinc: 'bg-zinc-800 text-white ring-zinc-800',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  marca: 'bg-marca-50 text-marca-700 ring-marca-200',
};

export function Badge({ cor = 'slate', children, className }: { cor?: string; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', CORES_BADGE[cor] ?? CORES_BADGE.slate, className)}>{children}</span>;
}

export function SeloClassificacao({ c, curto = true }: { c: Classificacao; curto?: boolean }) {
  if (c === 'NAO_MEDICAMENTO') return null;
  const r = REGRAS[c];
  return <Badge cor={r.cor}>{c === 'CONTROLADO' && <Lock className="h-3 w-3" aria-hidden />}{curto ? r.curto : r.rotulo}</Badge>;
}

export function Preco({ preco, precoDe, tamanho = 'md' }: { preco: number; precoDe?: number | null; tamanho?: 'sm' | 'md' | 'lg' }) {
  const pct = precoDe ? percentual(precoDe, preco) : 0;
  return (
    <div className="leading-tight">
      {precoDe ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="line-through">{brl(precoDe)}</span>
          <span className="rounded bg-oferta-50 px-1 font-bold text-oferta-600">-{pct}%</span>
        </div>
      ) : null}
      <div className={cx('font-extrabold tracking-tight text-oferta-600', tamanho === 'lg' ? 'text-3xl' : tamanho === 'md' ? 'text-xl' : 'text-base')}>{brl(preco)}</div>
    </div>
  );
}

export function Estrelas({ nota, total, tamanho = 'sm' }: { nota: number | null; total?: number; tamanho?: 'sm' | 'md' }) {
  if (nota == null) return null;
  const cheias = Math.round(nota);
  return (
    <span className={cx('inline-flex items-center gap-1', tamanho === 'md' ? 'text-base' : 'text-xs')} aria-label={`Nota ${nota.toFixed(1)} de 5`}>
      <span className="tracking-tighter text-amber-400">{'★'.repeat(cheias)}<span className="text-slate-300">{'★'.repeat(5 - cheias)}</span></span>
      <span className="text-slate-500">{nota.toFixed(1)}{total != null ? ` (${total})` : ''}</span>
    </span>
  );
}

export function Vazio({ icone = 'vazio', titulo, texto, acao }: { icone?: NomeIcone; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="cartao flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-marca-50 text-marca-600"><Icone nome={icone} className="h-7 w-7" /></div>
      <h3 className="text-lg font-semibold text-slate-900">{titulo}</h3>
      {texto ? <p className="mt-1 max-w-md text-sm text-slate-500">{texto}</p> : null}
      {acao ? <div className="mt-5">{acao}</div> : null}
    </div>
  );
}

export function Aviso({ tipo = 'info', children, className }: { tipo?: 'info' | 'alerta' | 'erro' | 'sucesso'; children: ReactNode; className?: string }) {
  const estilos = {
    info: 'bg-sky-50 text-sky-900 border-sky-200',
    alerta: 'bg-amber-50 text-amber-900 border-amber-200',
    erro: 'bg-rose-50 text-rose-900 border-rose-200',
    sucesso: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  };
  return <div role={tipo === 'erro' ? 'alert' : 'status'} className={cx('rounded-xl border px-4 py-3 text-sm', estilos[tipo], className)}>{children}</div>;
}

export function Campo({ rotulo, erro, ajuda, children, className }: { rotulo: string; erro?: string; ajuda?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="rotulo">{rotulo}</span>
      {children}
      {erro ? <span className="mt-1 block text-xs text-rose-600">{erro}</span> : ajuda ? <span className="mt-1 block text-xs text-slate-500">{ajuda}</span> : null}
    </label>
  );
}

export function Paginacao({ pagina, paginas, href }: { pagina: number; paginas: number; href: (p: number) => string }) {
  if (paginas <= 1) return null;
  const nums = Array.from({ length: paginas }, (_, i) => i + 1).filter((n) => n === 1 || n === paginas || Math.abs(n - pagina) <= 2);
  return (
    <nav className="mt-8 flex items-center justify-center gap-1" aria-label="Paginação">
      {pagina > 1 && <Link href={href(pagina - 1)} className="rounded-lg px-3 py-2 text-sm hover:bg-white">‹ Anterior</Link>}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center">
          {i > 0 && nums[i - 1] !== n - 1 && <span className="px-1 text-slate-400">…</span>}
          <Link href={href(n)} aria-current={n === pagina ? 'page' : undefined} className={cx('min-w-9 rounded-lg px-3 py-2 text-center text-sm', n === pagina ? 'bg-marca-600 font-semibold text-white' : 'hover:bg-white')}>{n}</Link>
        </span>
      ))}
      {pagina < paginas && <Link href={href(pagina + 1)} className="rounded-lg px-3 py-2 text-sm hover:bg-white">Próxima ›</Link>}
    </nav>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-slate-200/70', className)} />;
}

export function TituloPagina({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{titulo}</h1>
        {subtitulo ? <p className="mt-1 text-sm text-slate-500">{subtitulo}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap gap-2">{acoes}</div> : null}
    </div>
  );
}

/** Foto do produto; sem foto cadastrada, mostra o ícone sobre fundo na cor da categoria. */
export function ImagemProduto({ icone, cor = '#1B2A72', tamanho = 'md', className, imagemId, alt = '' }: { icone: string; cor?: string; tamanho?: 'sm' | 'md' | 'lg'; className?: string; imagemId?: string | null; alt?: string }) {
  const t = { sm: 'h-14 w-14 text-2xl rounded-xl', md: 'aspect-square w-full text-6xl rounded-2xl', lg: 'aspect-square w-full text-[8rem] rounded-3xl' }[tamanho];
  if (imagemId) {
    return (
      <div className={cx('flex shrink-0 items-center justify-center overflow-hidden bg-white', t, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/imagens/${imagemId}`} alt={alt} loading="lazy" className="h-full w-full object-contain p-2" />
      </div>
    );
  }
  return (
    <div className={cx('flex shrink-0 items-center justify-center', t, className)} style={{ background: `linear-gradient(135deg, ${cor}10, ${cor}24)`, color: cor }} aria-hidden>
      <IconeProduto emoji={icone} className={tamanho === 'sm' ? 'h-6 w-6' : tamanho === 'md' ? 'h-14 w-14' : 'h-28 w-28'} />
    </div>
  );
}
