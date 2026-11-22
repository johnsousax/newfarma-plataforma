'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { biparCodigoAcao } from '@/app/acoes/admin';
import { Icone } from '@/components/icones';

type Detector = { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> };

/**
 * Leitor de código de barras: funciona com leitor USB/Bluetooth (ele "digita" o código e dá Enter)
 * ou com a câmera do celular/computador (navegadores com BarcodeDetector: Chrome e Edge).
 */
export function BiparCodigo() {
  const [codigo, setCodigo] = useState('');
  const [camera, setCamera] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [p, iniciar] = useTransition();
  const video = useRef<HTMLVideoElement>(null);

  const buscar = (c: string) => iniciar(async () => {
    setErro(null);
    const r = await biparCodigoAcao(c);
    if (r && !r.ok) setErro(r.erro);
  });

  useEffect(() => {
    if (!camera) return;
    let parar = false;
    let fluxo: MediaStream | null = null;
    (async () => {
      const Classe = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!Classe) { setErro('Este navegador não lê código pela câmera. Use o Chrome ou um leitor USB.'); setCamera(false); return; }
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch { setErro('Sem acesso à câmera. Permita o uso no navegador.'); setCamera(false); return; }
      const v = video.current!;
      v.srcObject = fluxo;
      await v.play();
      const det = new Classe({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      while (!parar) {
        const achados = await det.detect(v).catch(() => []);
        if (achados[0]?.rawValue) { setCamera(false); setCodigo(achados[0].rawValue); buscar(achados[0].rawValue); break; }
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
    return () => { parar = true; fluxo?.getTracks().forEach((t) => t.stop()); };
  }, [camera]);

  return (
    <div className="relative">
      <form onSubmit={(e) => { e.preventDefault(); if (codigo.trim()) buscar(codigo); }} className="flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
        <Icone nome="codigoBarras" className="ml-2 h-5 w-5 text-slate-500" />
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" placeholder="Bipe ou digite o código de barras" aria-label="Código de barras" className="w-56 border-0 bg-transparent px-2 py-1.5 text-sm outline-none" />
        <button type="button" onClick={() => setCamera((c) => !c)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" title="Ler com a câmera"><Icone nome="camera" className="h-5 w-5" /></button>
        <button disabled={p} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{p ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {erro && <p className="absolute right-0 top-full mt-1 w-72 rounded-lg bg-red-50 p-2 text-xs text-red-700 shadow">{erro}</p>}
      {camera && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/80 p-4" onClick={() => setCamera(false)}>
          <video ref={video} playsInline muted className="w-full max-w-md rounded-2xl" />
          <p className="text-sm text-white">Aponte para o código de barras. Toque fora para cancelar.</p>
        </div>
      )}
    </div>
  );
}
