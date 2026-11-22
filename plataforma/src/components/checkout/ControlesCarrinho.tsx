'use client';
import { useActionState, useTransition, useState } from 'react';
import { alterarQuantidade, aplicarCupom, removerCupom } from '@/app/acoes/carrinho';
import { Aviso } from '@/components/ui';
import { Icone } from '@/components/icones';

export function SeletorQuantidade({ produtoId, quantidade, max }: { produtoId: string; quantidade: number; max: number }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const mudar = (q: number) => iniciar(async () => { const r = await alterarQuantidade(produtoId, q); setErro(r.ok ? null : r.erro); });
  return (
    <div>
      <div className={`flex items-center gap-3 ${pendente ? 'opacity-50' : ''}`}>
        <div className="flex items-center rounded-xl border border-slate-300 bg-white">
          <button onClick={() => mudar(quantidade - 1)} disabled={pendente} className="px-3 py-1.5 text-lg text-slate-600" aria-label="Diminuir">−</button>
          <span className="w-8 text-center text-sm font-semibold">{quantidade}</span>
          <button onClick={() => mudar(quantidade + 1)} disabled={pendente || quantidade >= Math.min(20, max)} className="px-3 py-1.5 text-lg text-slate-600 disabled:opacity-30" aria-label="Aumentar">+</button>
        </div>
        <button onClick={() => mudar(0)} disabled={pendente} className="text-sm text-slate-500 underline hover:text-rose-600">Remover</button>
      </div>
      {erro && <p className="mt-1 text-xs text-rose-600">{erro}</p>}
    </div>
  );
}

export function FormCupom({ codigo, erroCupom }: { codigo: string | null; erroCupom: string | null }) {
  const [estado, acao, pendente] = useActionState(aplicarCupom, null);
  const [, iniciar] = useTransition();
  if (codigo) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-xl border border-dashed border-emerald-400 bg-emerald-50 px-3 py-2 text-sm">
          <span className="flex items-center gap-2"><Icone nome="etiqueta" className="text-emerald-700" /><strong>{codigo}</strong></span>
          <button onClick={() => iniciar(async () => { await removerCupom(); })} className="text-xs underline">remover</button>
        </div>
        {erroCupom && <Aviso tipo="alerta">{erroCupom}</Aviso>}
      </div>
    );
  }
  return (
    <form action={acao} className="space-y-2">
      <div className="flex gap-2">
        <input name="codigo" placeholder="Cupom de desconto" className="campo uppercase" aria-label="Cupom" />
        <button disabled={pendente} className="shrink-0 rounded-xl border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50">Aplicar</button>
      </div>
      {estado && !estado.ok && <p className="text-xs text-rose-600">{estado.erro}</p>}
    </form>
  );
}
