'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { sugerir } from '@/app/acoes/busca';
import { brl } from '@/lib/formato';
import { Icone, IconeProduto } from '@/components/icones';

type Sugestao = Awaited<ReturnType<typeof sugerir>>[number];

export function CaixaBusca() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [lista, setLista] = useState<Sugestao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [, iniciar] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => iniciar(async () => setLista(await sugerir(q))), 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); setAberto(false); router.push(`/busca?q=${encodeURIComponent(q.trim())}`); }}
        className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 pl-4 transition focus-within:border-marca-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-marca-100"
      >
        <Icone nome="busca" className="h-5 w-5 text-slate-400" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          name="q"
          placeholder="Busque por medicamento, princípio ativo, marca…"
          aria-label="Buscar produtos"
          autoComplete="off"
          className="w-full bg-transparent px-3 py-3 text-sm outline-none"
        />
        <button className="m-1 rounded-xl bg-marca-600 px-4 py-2 text-sm font-semibold text-white hover:bg-marca-700">Buscar</button>
      </form>
      {aberto && q.trim().length >= 2 && lista.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {lista.map((s) => (
            <Link key={s.slug} href={`/produto/${s.slug}`} onClick={() => setAberto(false)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
              <IconeProduto emoji={s.icone} className="h-6 w-6 shrink-0 text-marca-600" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{s.nome}</span>
                <span className="block text-xs text-slate-500">{s.marca}</span>
              </span>
              <span className="text-sm font-bold text-slate-900">{brl(s.preco)}</span>
            </Link>
          ))}
          <Link href={`/busca?q=${encodeURIComponent(q)}`} onClick={() => setAberto(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-marca-700 hover:bg-marca-50">
            Ver todos os resultados para “{q}”
          </Link>
        </div>
      )}
    </div>
  );
}
