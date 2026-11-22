'use client';
import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/components/icones';

/** Abre o diálogo de impressão ao carregar e fecha a janela depois (quando aberta pelo sistema). */
export function AutoImprimir({ ativo }: { ativo: boolean }) {
  useEffect(() => {
    if (!ativo) return;
    const fechar = () => { if (window.opener) window.close(); };
    window.addEventListener('afterprint', fechar);
    const t = setTimeout(() => window.print(), 300);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fechar); };
  }, [ativo]);
  return (
    <button onClick={() => window.print()} className="no-print fixed right-3 top-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
      <Icone nome="impressora" className="h-4 w-4" />Imprimir
    </button>
  );
}

const CHAVE = 'nf_impressao_auto';

/** Liga/desliga, neste computador, a impressão automática de pedidos novos (pagos). */
export function ImpressaoAutomatica() {
  const [ligado, setLigado] = useState(false);
  const desde = useRef(0);
  const vistos = useRef(new Set<string>());
  useEffect(() => { setLigado(localStorage.getItem(CHAVE) === '1'); }, []); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!ligado) return;
    if (!desde.current) desde.current = Date.now();
    const verificar = async () => {
      const r = await fetch(`/api/admin/pedidos/novos?desde=${desde.current}`, { cache: 'no-store' }).catch(() => null);
      if (!r?.ok) return;
      const { pedidos, agora } = (await r.json()) as { pedidos: { id: string }[]; agora: number };
      desde.current = agora;
      for (const p of pedidos) {
        if (vistos.current.has(p.id)) continue;
        vistos.current.add(p.id);
        window.open(`/imprimir/pedido/${p.id}?auto=1`, `imp-${p.id}`, 'width=380,height=640');
      }
    };
    const t = setInterval(verificar, 20_000);
    return () => clearInterval(t);
  }, [ligado]);
  const alternar = () => { const v = !ligado; setLigado(v); localStorage.setItem(CHAVE, v ? '1' : '0'); };
  return (
    <button onClick={alternar} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ring-1 ${ligado ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-white text-slate-600 ring-slate-200'}`} title="Vale só para este computador. Permita pop-ups do site no navegador.">
      <Icone nome="impressora" className="h-4 w-4" />Impressão automática: {ligado ? 'ligada neste computador' : 'desligada'}
    </button>
  );
}
