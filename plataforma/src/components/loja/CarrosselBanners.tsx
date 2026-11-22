'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IconeProduto } from '@/components/icones';

type Banner = { id: string; titulo: string; subtitulo: string | null; textoBotao: string; link: string; corDe: string; corPara: string; icone: string };

export function CarrosselBanners({ banners }: { banners: Banner[] }) {
  const [i, setI] = useState(0);
  const [pausado, setPausado] = useState(false);
  useEffect(() => {
    if (pausado || banners.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % banners.length), 6000);
    return () => clearInterval(t);
  }, [pausado, banners.length]);
  if (!banners.length) return null;
  return (
    <section className="relative overflow-hidden rounded-3xl" aria-roledescription="carrossel" onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)}>
      <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
        {banners.map((b, k) => (
          <div key={b.id} className="w-full shrink-0" aria-hidden={k !== i} style={{ background: `linear-gradient(120deg, ${b.corDe}, ${b.corPara})` }}>
            <div className="flex min-h-56 items-center justify-between gap-6 px-6 py-10 sm:min-h-72 sm:px-12">
              <div className="max-w-xl text-white">
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{b.titulo}</h2>
                {b.subtitulo && <p className="mt-3 text-base text-white/90 sm:text-lg">{b.subtitulo}</p>}
                <Link href={b.link} tabIndex={k === i ? 0 : -1} className="mt-6 inline-block rounded-xl bg-white px-6 py-3 font-bold text-slate-900 shadow-lg transition hover:scale-[1.02]">{b.textoBotao} →</Link>
              </div>
              <div className="hidden text-white/90 md:block" aria-hidden><IconeProduto emoji={b.icone} className="h-36 w-36" /></div>
            </div>
          </div>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          {banners.map((b, k) => (
            <button key={b.id} onClick={() => setI(k)} aria-label={`Banner ${k + 1}`} className={`h-2.5 rounded-full transition-all ${k === i ? 'w-8 bg-white' : 'w-2.5 bg-white/50'}`} />
          ))}
        </div>
      )}
    </section>
  );
}
