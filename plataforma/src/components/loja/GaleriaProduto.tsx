'use client';
import { useState } from 'react';
import { ImagemProduto, cx } from '@/components/ui';

export function GaleriaProduto({ imagens, icone, cor, nome }: { imagens: string[]; icone: string; cor: string; nome: string }) {
  const [atual, setAtual] = useState(0);
  return (
    <div className="space-y-3">
      <ImagemProduto icone={icone} cor={cor} tamanho="lg" imagemId={imagens[atual]} alt={nome} className="border border-slate-100" />
      {imagens.length > 1 && (
        <div className="flex gap-2">
          {imagens.map((id, i) => (
            <button key={id} onClick={() => setAtual(i)} aria-label={`Foto ${i + 1}`} className={cx('h-16 w-16 overflow-hidden rounded-xl border-2 bg-white', i === atual ? 'border-marca-600' : 'border-slate-200')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/imagens/${id}`} alt="" className="h-full w-full object-contain p-1" />
            </button>
          ))}
        </div>
      )}
      <p className="text-center text-xs text-slate-400">Imagem ilustrativa</p>
    </div>
  );
}
