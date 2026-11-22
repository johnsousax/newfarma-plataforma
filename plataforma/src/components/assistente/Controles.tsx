'use client';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { perguntarAcao, chamarFarmaceuticoAcao, novaConversaAcao, aceitarTermoAssistente } from '@/app/acoes/assistente';
import { Aviso, Botao } from '@/components/ui';

/** Reduz a foto no navegador (máx. 1568 px, JPEG): envio mais rápido e sem metadados de localização (EXIF). */
async function prepararFoto(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao processar a foto'))), 'image/jpeg', 0.85));
  return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
}

export function FormPergunta({ desativado }: { desativado?: boolean }) {
  const [estado, acao, pendente] = useActionState(perguntarAcao, null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);


  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setErroFoto(null);
    if (!f) return;
    try {
      const p = await prepararFoto(f);
      setFoto(p);
      setPrevia(URL.createObjectURL(p));
    } catch { setErroFoto('Não consegui abrir essa foto. Tente outra (JPG ou PNG).'); }
  }

  return (
    <form ref={form} action={(fd) => { fd.delete('foto'); if (foto) fd.set('foto', foto); setFoto(null); setPrevia(null); form.current?.reset(); return acao(fd); }} className="cartao space-y-3 p-4">
      {previa && (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previa} alt="Foto escolhida" className="h-28 rounded-xl border object-cover" />
          <button type="button" onClick={() => { setFoto(null); setPrevia(null); }} className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-slate-900 text-xs text-white" aria-label="Remover foto">✕</button>
        </div>
      )}
      <textarea name="texto" rows={2} maxLength={1500} disabled={desativado || pendente} placeholder="Ex.: Para que serve este remédio? (você pode só mandar a foto)" className="campo resize-none" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-full border-2 border-marca-600 px-4 py-2 text-sm font-bold text-marca-600 hover:bg-marca-50">
          📷 Foto do remédio ou da receita
          <input type="file" accept="image/*" capture="environment" onChange={escolher} className="sr-only" disabled={desativado || pendente} />
        </label>
        <Botao disabled={desativado || pendente} className="ml-auto rounded-full">{pendente ? 'Analisando…' : 'Enviar'}</Botao>
      </div>
      {erroFoto && <p className="text-xs text-rose-600">{erroFoto}</p>}
      {estado && !estado.ok && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <p className="text-xs text-slate-500">A foto é usada só para responder e não fica guardada. Evite mostrar documentos.</p>
    </form>
  );
}

export function BotoesConversa({ podeChamar }: { podeChamar: boolean }) {
  const [p, iniciar] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {podeChamar && <Botao variante="oferta" className="rounded-full" disabled={p} onClick={() => iniciar(async () => { await chamarFarmaceuticoAcao(); })}>🧑‍⚕️ Falar com farmacêutico</Botao>}
      <Botao variante="fantasma" disabled={p} onClick={() => iniciar(async () => { await novaConversaAcao(); })}>↺ Nova conversa</Botao>
    </div>
  );
}

export function AceitarTermo() {
  const [p, iniciar] = useTransition();
  const [ok, setOk] = useState(false);
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 h-4 w-4 accent-marca-600" /> Entendi que o assistente só dá informações gerais da bula, não substitui médico ou farmacêutico, e autorizo o tratamento das minhas mensagens e fotos para responder minhas dúvidas (LGPD, art. 11).</label>
      <Botao disabled={!ok || p} onClick={() => iniciar(async () => { await aceitarTermoAssistente(); })}>Começar</Botao>
    </div>
  );
}

/** Atualiza a conversa a cada 10 s enquanto espera o farmacêutico. */
export function AtualizarSozinho({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [ativo, router]);
  return null;
}
