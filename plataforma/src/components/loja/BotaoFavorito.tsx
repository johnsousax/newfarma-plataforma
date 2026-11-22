'use client';
import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { alternarFavorito } from '@/app/acoes/conta';
import { Icone } from '@/components/icones';

export function BotaoFavorito({ produtoId, favorito, logado }: { produtoId: string; favorito: boolean; logado: boolean }) {
  const [estado, setEstado] = useOptimistic(favorito);
  const [, iniciar] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      aria-pressed={estado}
      onClick={() => {
        if (!logado) return router.push(`/entrar?voltar=${encodeURIComponent(location.pathname)}`);
        iniciar(async () => { setEstado(!estado); await alternarFavorito(produtoId); });
      }}
      className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
    >
      <Icone nome="coracao" className={estado ? 'fill-oferta-600 text-oferta-600' : 'text-slate-400'} />{estado ? 'Nos favoritos' : 'Favoritar'}
    </button>
  );
}
