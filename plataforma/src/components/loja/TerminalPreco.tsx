'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { consultarPreco } from '@/app/acoes/busca';
import { brl } from '@/lib/formato';
import { REGRAS } from '@/lib/dominio';
import { Icone, IconeProduto } from '@/components/icones';

type Res = Awaited<ReturnType<typeof consultarPreco>>;

export function TerminalPreco({ loja }: { loja: string }) {
  const [codigo, setCodigo] = useState('');
  const [res, setRes] = useState<Res | 'nada' | null>(null);
  const [pendente, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);

  // Volta para a tela inicial depois de 15 s e mantém o foco no campo (o leitor "digita" nele)
  useEffect(() => {
    if (!res) return;
    const t = setTimeout(() => setRes(null), 15_000);
    return () => clearTimeout(t);
  }, [res]);
  useEffect(() => {
    const foco = () => campo.current?.focus();
    const i = setInterval(foco, 2000);
    return () => clearInterval(i);
  }, []);

  const consultar = (e: React.FormEvent) => {
    e.preventDefault();
    const c = codigo.trim();
    if (!c) return;
    setCodigo('');
    iniciar(async () => setRes((await consultarPreco(c)) ?? 'nada'));
  };

  return (
    <main className="flex min-h-screen flex-col bg-marca-700 text-white">
      <header className="flex items-center justify-between px-8 py-5">
        <span className="text-2xl font-extrabold">{loja}</span>
        <span className="flex items-center gap-2 text-lg text-white/80"><Icone nome="codigoBarras" className="h-6 w-6" /> Consulta de preço</span>
      </header>
      <form onSubmit={consultar} className="px-8">
        <input ref={campo} autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Passe o código de barras no leitor ou digite o nome" aria-label="Código de barras ou nome do produto"
          className="w-full rounded-2xl border-0 bg-white/15 px-6 py-5 text-2xl text-white placeholder:text-white/60 focus:outline-none focus:ring-4 focus:ring-amarelo-400" />
      </form>
      <section className="flex flex-1 items-center justify-center p-8" aria-live="polite">
        {pendente ? <Icone nome="carregando" className="h-16 w-16 animate-spin" /> : res === 'nada' ? (
          <p className="text-center text-3xl font-bold">Produto não encontrado.<span className="mt-2 block text-xl font-normal text-white/80">Peça ajuda a um atendente.</span></p>
        ) : res ? (
          <div className="w-full max-w-3xl rounded-3xl bg-white p-10 text-slate-900 shadow-2xl">
            <div className="flex items-start gap-6">
              <IconeProduto emoji={res.icone} className="h-20 w-20 shrink-0 text-marca-600" />
              <div className="min-w-0 flex-1">
                <p className="text-3xl font-extrabold leading-tight">{res.nome}</p>
                <p className="mt-1 text-lg text-slate-500">{res.marca}{res.apresentacao ? ` · ${res.apresentacao}` : ''}</p>
                {REGRAS[res.classificacao].exigeReceita && <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">{REGRAS[res.classificacao].curto} — venda com receita</p>}
              </div>
            </div>
            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                {res.precoDe && <p className="text-2xl text-slate-400 line-through">{brl(res.precoDe)}</p>}
                <p className="text-7xl font-black text-marca-700">{brl(res.preco)}</p>
              </div>
              {res.selo && <span className="rounded-2xl bg-oferta-600 px-5 py-3 text-2xl font-extrabold text-white">{res.selo}</span>}
            </div>
          </div>
        ) : (
          <p className="text-center text-3xl font-semibold text-white/90"><Icone nome="codigoBarras" className="mx-auto mb-6 h-24 w-24" />Aproxime o código de barras do leitor</p>
        )}
      </section>
      <footer className="px-8 pb-5 text-sm text-white/60">Preços válidos hoje na loja. Imagens ilustrativas.</footer>
    </main>
  );
}
