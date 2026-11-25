'use client';
import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { perguntarAcao } from '@/app/acoes/assistente';
import { ListaMensagens, type MensagemChat } from './Mensagens';
import { Icone } from '@/components/icones';
import { Aviso, cx } from '@/components/ui';

/** Reduz a foto no navegador (máx. 1568 px, JPEG): envio rápido e sem dados de localização (EXIF). */
async function prepararFoto(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('falha'))), 'image/jpeg', 0.85));
  return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
}

function Digitando({ nome, comFoto }: { nome: string; comFoto: boolean }) {
  return (
    <div className="flex gap-3" role="status" aria-live="polite">
      <span className="relative mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-marca-600 text-white">
        <Icone nome="assistente" />
        <span className="absolute inset-0 animate-ping rounded-full bg-marca-400 opacity-30" />
      </span>
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500">{nome}</p>
        <div className="flex items-center gap-3 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3">
          <span className="flex gap-1">
            {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-marca-500" style={{ animationDelay: `${d}ms` }} />)}
          </span>
          <span className="bg-gradient-to-r from-slate-500 via-marca-500 to-slate-500 bg-[length:200%_100%] bg-clip-text text-sm text-transparent [animation:brilho_2s_linear_infinite]">
            {comFoto ? 'Analisando a foto…' : 'Pensando na sua pergunta…'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Chat com a assistente: uma conversa só, para sempre (sem "nova conversa" nem lista de conversas). */
export function ChatAssistente({ mensagens, nome, restantes, limite, linkWhats, whatsapp, nomeCliente, emAtendimento }: {
  mensagens: MensagemChat[]; nome: string; restantes: number; limite: number; linkWhats: string | null; whatsapp: string | null; nomeCliente: string; emAtendimento: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [otimistas, adicionar] = useOptimistic(mensagens, (atual, nova: MensagemChat) => [...atual, nova]);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [otimistas.length, pendente]);

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    setErro(null);
    if (!f) return;
    try { const p = await prepararFoto(f); setFoto(p); setPrevia(URL.createObjectURL(p)); } catch { setErro('Não consegui abrir essa foto. Tente outra (JPG ou PNG).'); }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (pendente || (!texto.trim() && !foto)) return;
    const fd = new FormData();
    fd.set('texto', texto);
    if (foto) fd.set('foto', foto);
    const minhaPrevia = previa;
    const comFoto = !!foto;
    setTexto(''); setFoto(null); setPrevia(null); setErro(null);
    iniciar(async () => {
      adicionar({ id: `tmp-${Date.now()}`, autor: 'CLIENTE', texto: texto.trim() || '(enviou uma foto)', criadoEm: new Date(), teveImagem: comFoto, dados: null, previaImagem: minhaPrevia });
      const r = await perguntarAcao(fd);
      if (!r.ok) { setErro(r.erro); setTexto(fd.get('texto') as string); return; }
      router.refresh();
    });
  }

  const vazia = !otimistas.length;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className="flex min-h-[65vh] min-w-0 flex-col rounded-3xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marca-600 text-white"><Icone nome="assistente" /></span>
            <div className="leading-tight"><p className="font-bold text-marca-700">{nome}</p><p className="text-xs text-slate-500">Assistente virtual · {restantes} de {limite} consultas hoje</p></div>
          </div>
          {linkWhats ? <a href={linkWhats} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full border border-emerald-600 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><Icone nome="whatsapp" />Farmacêutico</a> : <span />}
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {emAtendimento && <Aviso tipo="sucesso">Um farmacêutico está acompanhando esta conversa.</Aviso>}
          {vazia ? (
            <div className="mx-auto max-w-md py-10 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-marca-50 text-marca-600"><Icone nome="assistente" className="h-7 w-7" /></span>
              <h2 className="mt-3 text-xl font-extrabold text-marca-700">Olá! Eu sou a {nome}.</h2>
              <p className="mt-1 text-sm text-slate-600">Mande a foto da caixa do remédio ou da receita, ou me diga o que está sentindo. Eu explico para que serve e mostro o que temos na loja.</p>
              <div className="mt-5 grid gap-2 text-left text-sm">
                {['Para que serve a loratadina?', 'Tenho dor de cabeça leve, o que vocês têm?', 'Esse remédio precisa de receita?'].map((s) => (
                  <button key={s} type="button" onClick={() => setTexto(s)} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-700 hover:border-marca-400 hover:bg-marca-50">{s}</button>
                ))}
              </div>
            </div>
          ) : <ListaMensagens mensagens={otimistas} nomeAssistente={nome} linkWhats={linkWhats} whatsapp={whatsapp} nomeParaWhats={nomeCliente} />}
          {pendente && <Digitando nome={nome} comFoto={!!otimistas.at(-1)?.teveImagem} />}
          <div ref={fim} />
        </div>

        <form onSubmit={enviar} className="space-y-2 border-t border-slate-100 p-3 sm:p-4">
          {previa && (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previa} alt="Foto escolhida" className="h-20 rounded-xl border object-cover" />
              <button type="button" onClick={() => { setFoto(null); setPrevia(null); }} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white" aria-label="Remover foto"><Icone nome="fechar" className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-1.5 focus-within:border-marca-600 focus-within:ring-4 focus-within:ring-marca-100">
            <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-marca-600 hover:bg-marca-50" title="Foto do remédio ou da receita">
              <Icone nome="camera" className="h-5 w-5" />
              <input type="file" accept="image/*" capture="environment" onChange={escolher} className="sr-only" disabled={pendente || restantes <= 0} />
            </label>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
              rows={1} maxLength={1500} disabled={pendente || restantes <= 0} placeholder={restantes > 0 ? `Pergunte para a ${nome}…` : 'Limite de consultas de hoje atingido'}
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none" aria-label="Mensagem" />
            <button disabled={pendente || restantes <= 0 || (!texto.trim() && !foto)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marca-600 text-white disabled:opacity-40" aria-label="Enviar">
              <Icone nome={pendente ? 'carregando' : 'enviar'} className={cx('h-5 w-5', pendente && 'animate-spin')} />
            </button>
          </div>
          <p className="text-center text-[11px] text-slate-400">A foto é usada só para responder e não fica guardada. Em emergência, ligue 192.</p>
        </form>
      </section>
    </div>
  );
}
