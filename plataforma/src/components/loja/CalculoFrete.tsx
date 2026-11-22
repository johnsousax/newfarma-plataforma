'use client';
import { useState, useTransition } from 'react';
import { cotarFrete } from '@/app/acoes/carrinho';
import { brl } from '@/lib/formato';

type Cot = Extract<Awaited<ReturnType<typeof cotarFrete>>, { ok: true }>['dados'];

export function CalculoFrete({ produtoId, cepInicial = '' }: { produtoId?: string; cepInicial?: string }) {
  const [cep, setCep] = useState(cepInicial);
  const [r, setR] = useState<Cot | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const calcular = (e: React.FormEvent) => {
    e.preventDefault();
    iniciar(async () => {
      const x = await cotarFrete(cep, produtoId);
      if (x.ok) { setR(x.dados ?? null); setErro(null); } else { setErro(x.erro); setR(null); }
    });
  };
  return (
    <div>
      <form onSubmit={calcular} className="flex gap-2">
        <input value={cep} onChange={(e) => setCep(e.target.value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2'))} inputMode="numeric" placeholder="00000-000" aria-label="CEP" className="campo" />
        <button disabled={pendente} className="shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60">{pendente ? '…' : 'Calcular'}</button>
      </form>
      <a href="https://buscacepinter.correios.com.br/" target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-slate-500 underline">Não sei meu CEP</a>
      {erro && <p className="mt-2 text-sm text-rose-600">{erro}</p>}
      {r && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {r.entregas.map((e) => (
            <li key={e.modalidade} className={`flex items-center justify-between gap-3 px-3 py-2.5 ${e.disponivel ? '' : 'opacity-50'}`}>
              <span><strong>{e.rotulo}</strong> · {e.disponivel ? e.prazo : e.motivo}</span>
              {e.disponivel && <span className={e.preco === 0 ? 'font-bold text-emerald-700' : 'font-semibold'}>{e.preco === 0 ? 'Grátis' : brl(e.preco)}</span>}
            </li>
          ))}
          {r.retiradas.map((x) => (
            <li key={x.loja} className="flex items-center justify-between px-3 py-2.5"><span><strong>Retirar em {x.loja}</strong> · {x.prazo}</span><span className="font-bold text-emerald-700">Grátis</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}
