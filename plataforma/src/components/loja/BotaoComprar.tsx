'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { adicionarAoCarrinho } from '@/app/acoes/carrinho';
import { cx } from '@/components/ui';

export function BotaoComprar({ produtoId, disponivel, controlado, compacto, quantidadeInicial = 1, comSeletor }: { produtoId: string; disponivel: number; controlado?: boolean; compacto?: boolean; quantidadeInicial?: number; comSeletor?: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [qtd, setQtd] = useState(quantidadeInicial);

  if (controlado) {
    return <Link href="/lojas" className="block rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-center text-sm font-semibold text-zinc-700 hover:bg-zinc-100">🔒 Somente na loja</Link>;
  }
  if (disponivel <= 0) {
    return <button disabled className="w-full cursor-not-allowed rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-400">Esgotado</button>;
  }

  const comprar = () =>
    iniciar(async () => {
      const r = await adicionarAoCarrinho(produtoId, qtd);
      setMsg(r.ok ? { ok: true, texto: 'Adicionado ✓' } : { ok: false, texto: r.erro });
      setTimeout(() => setMsg(null), 2500);
    });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {comSeletor && (
          <div className="flex items-center rounded-xl border border-slate-300 bg-white">
            <button type="button" onClick={() => setQtd((q) => Math.max(1, q - 1))} className="px-3 py-2 text-lg text-slate-600" aria-label="Diminuir">−</button>
            <span className="w-8 text-center font-semibold" aria-live="polite">{qtd}</span>
            <button type="button" onClick={() => setQtd((q) => Math.min(Math.min(20, disponivel), q + 1))} className="px-3 py-2 text-lg text-slate-600" aria-label="Aumentar">+</button>
          </div>
        )}
        <button
          type="button"
          onClick={comprar}
          disabled={pendente}
          className={cx('flex-1 rounded-full px-3 font-extrabold text-white shadow-sm transition disabled:opacity-60', compacto ? 'py-2 text-sm' : 'py-3 text-base', msg?.ok ? 'bg-emerald-600' : 'bg-oferta-600 hover:bg-oferta-700')}
        >
          {pendente ? 'Adicionando…' : msg?.ok ? msg.texto : compacto ? 'Adicionar' : 'Adicionar ao carrinho'}
        </button>
      </div>
      {msg && !msg.ok && <p className="text-xs text-rose-600" role="alert">{msg.texto}</p>}
    </div>
  );
}
