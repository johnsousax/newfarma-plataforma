'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { aceitarTermoAssistente } from '@/app/acoes/assistente';
import { Botao } from '@/components/ui';

export function AceitarTermo() {
  const [p, iniciar] = useTransition();
  const [ok, setOk] = useState(false);
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 h-4 w-4 accent-marca-600" /> Entendi que a assistente dá informações gerais sobre medicamentos, não substitui médico ou farmacêutico, e autorizo o tratamento das minhas mensagens e fotos para responder minhas dúvidas (LGPD, art. 11).</label>
      <Botao disabled={!ok || p} onClick={() => iniciar(async () => { await aceitarTermoAssistente(); })}>Começar</Botao>
    </div>
  );
}

/** Atualiza a página a cada 10 s (fila do farmacêutico, painel). */
export function AtualizarSozinho({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [ativo, router]);
  return null;
}
