'use client';
import { useState, useTransition } from 'react';
import { despacharAcao } from '@/app/acoes/admin';
import { Botao } from '@/components/ui';
import { Icone } from '@/components/icones';

type Motoboy = { id: string; nome: string };

/** Escolhe o motoboy, despacha e abre o WhatsApp dele com o resumo da entrega e o link do app. */
export function DespacharPedido({ pedidoId, numero, endereco, mapa, motoboys, atual, rotulo = 'Despachar' }: { pedidoId: string; numero: number; endereco: string; mapa: string | null; motoboys: Motoboy[]; atual?: string | null; rotulo?: string }) {
  const [m, setM] = useState(atual ?? motoboys[0]?.id ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [p, iniciar] = useTransition();
  if (!motoboys.length) return <p className="text-xs text-amber-700">Cadastre um motoboy na aba Motoboys.</p>;
  const enviar = () => iniciar(async () => {
    setErro(null);
    const r = await despacharAcao(pedidoId, m);
    if (!r.ok) { setErro(r.erro); return; }
    if (r.dados) {
      const texto = [`*Entrega #${numero}*`, endereco, mapa && `Rota: ${mapa}`, `Seus pedidos e confirmação de entrega: ${location.origin}/entregador/${r.dados.token}`].filter(Boolean).join('\n');
      window.open(`https://wa.me/55${r.dados.telefone.replace(/^55/, '')}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    }
  });
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <select value={m} onChange={(e) => setM(e.target.value)} className="campo py-1.5 text-sm" aria-label="Motoboy">
          {motoboys.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
        <Botao tamanho="sm" disabled={p || !m} onClick={enviar}><Icone nome="motoboy" />{p ? 'Enviando…' : rotulo}</Botao>
      </div>
      {erro && <p className="text-xs text-red-700">{erro}</p>}
    </div>
  );
}
