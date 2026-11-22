'use client';
import { useActionState, useState } from 'react';
import { avaliarProdutoAcao } from '@/app/acoes/conta';
import { Aviso, Botao } from '@/components/ui';

export function FormAvaliacao({ produtoId }: { produtoId: string }) {
  const [estado, acao, pendente] = useActionState(avaliarProdutoAcao, null);
  const [nota, setNota] = useState(5);
  if (estado?.ok) return <Aviso tipo="sucesso">{estado.mensagem}</Aviso>;
  return (
    <form action={acao} className="cartao space-y-3 p-5">
      <h3 className="font-semibold">Avalie este produto</h3>
      <input type="hidden" name="produtoId" value={produtoId} />
      <input type="hidden" name="nota" value={nota} />
      <div className="flex gap-1 text-3xl" role="radiogroup" aria-label="Nota">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={nota === n} aria-label={`${n} estrela(s)`} onClick={() => setNota(n)} className={n <= nota ? 'text-amber-400' : 'text-slate-300'}>★</button>
        ))}
      </div>
      <input name="titulo" required maxLength={80} placeholder="Resuma sua experiência" className="campo" />
      <textarea name="comentario" required minLength={10} maxLength={1000} rows={3} placeholder="O que você achou? (não informe dados de saúde pessoais)" className="campo" />
      {estado && !estado.ok && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <Botao disabled={pendente}>{pendente ? 'Enviando…' : 'Enviar avaliação'}</Botao>
    </form>
  );
}
