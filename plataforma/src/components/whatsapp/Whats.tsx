'use client';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { responderWhatsAcao, conectarWhatsAcao } from '@/app/acoes/admin';
import { Icone } from '@/components/icones';
import { cx } from '@/components/ui';

type Conversa = { id: string; telefone: string; nome: string | null; ultimaPrevia: string | null; ultimaEm: string; naoLidas: number };
type Msg = { id: string; deMim: boolean; tipo: string; texto: string | null; temMidia: boolean; midiaMime: string | null; arquivoNome: string | null; status: string; criadoEm: string };

const fone = (t: string) => { const d = t.replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : `+${t}`; };
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const quando = (iso: string) => { const d = new Date(iso); const hoje = new Date(); return d.toDateString() === hoje.toDateString() ? hora(iso) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }); };
const iniciais = (c: Conversa) => (c.nome ?? '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '#';

function Tique({ s }: { s: string }) {
  if (s === 'ENVIANDO') return <Icone nome="relogio" className="h-3.5 w-3.5 text-slate-400" />;
  if (s === 'ERRO') return <Icone nome="alerta" className="h-3.5 w-3.5 text-red-500" rotulo="Não enviada" />;
  if (s === 'ENVIADA') return <Icone nome="ok" className="h-3.5 w-3.5 text-slate-400" />;
  return <Icone nome="lido" className={cx('h-4 w-4', s === 'LIDA' ? 'text-sky-500' : 'text-slate-400')} />;
}

function Conteudo({ m }: { m: Msg }) {
  const src = `/api/admin/whatsapp/midia/${m.id}`;
  return (
    <>
      {m.temMidia && m.tipo === 'imagem' && (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="Imagem recebida" className="mb-1 max-h-72 rounded-lg" /></a>
      )}
      {m.temMidia && m.tipo === 'figurinha' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Figurinha" className="h-32 w-32" />
      )}
      {m.temMidia && m.tipo === 'audio' && <audio controls src={src} className="max-w-[260px]" />}
      {m.temMidia && m.tipo === 'video' && <video controls src={src} className="max-h-72 rounded-lg" />}
      {m.temMidia && m.tipo === 'documento' && <a href={src} className="flex items-center gap-2 rounded-lg bg-black/5 p-2 text-sm"><Icone nome="notas" className="h-5 w-5" />{m.arquivoNome ?? 'Documento'}</a>}
      {!m.temMidia && m.tipo !== 'texto' && !m.texto && <span className="italic text-slate-500">[{m.tipo}: abra no celular]</span>}
      {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
    </>
  );
}

export function WhatsApp({ inicial, estado }: { inicial: Conversa[]; estado: string }) {
  const [conversas, setConversas] = useState(inicial);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [novoNumero, setNovoNumero] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);
  const ultimo = useRef<string | null>(null);

  const atualizar = useCallback(async (completo = false) => {
    const q = new URLSearchParams();
    if (busca) q.set('busca', busca);
    if (ativa) { q.set('conversa', ativa); if (!completo && ultimo.current) q.set('desde', ultimo.current); }
    const r = await fetch(`/api/admin/whatsapp?${q}`, { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;
    const j = (await r.json()) as { conversas: Conversa[]; mensagens: Msg[] | null };
    setConversas(j.conversas.map((c) => (c.id === ativa ? { ...c, naoLidas: 0 } : c)));
    if (j.mensagens) {
      const novas = j.mensagens;
      setMsgs((atual) => {
        const base = completo ? [] : atual.filter((m) => !m.id.startsWith('tmp-'));
        const ids = new Set(base.map((m) => m.id));
        const juntas = [...base.map((m) => novas.find((n) => n.id === m.id) ?? m), ...novas.filter((n) => !ids.has(n.id))];
        if (juntas.length) ultimo.current = juntas[juntas.length - 1].criadoEm;
        return juntas;
      });
    }
  }, [ativa, busca]);

  // abre conversa: carrega tudo
  useEffect(() => { ultimo.current = null; const t = setTimeout(() => void atualizar(true), 0); return () => clearTimeout(t); }, [ativa]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => void atualizar(false), 4000); return () => clearInterval(t); }, [atualizar]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, ativa]);

  const conversa = conversas.find((c) => c.id === ativa);
  const enviar = () => {
    const t = texto.trim();
    if (!t || (!ativa && !novoNumero)) return;
    setTexto(''); setErro(null);
    const tmp: Msg = { id: `tmp-${Date.now()}`, deMim: true, tipo: 'texto', texto: t, temMidia: false, midiaMime: null, arquivoNome: null, status: 'ENVIANDO', criadoEm: new Date().toISOString() };
    setMsgs((m) => [...m, tmp]);
    iniciar(async () => {
      const r = await responderWhatsAcao(ativa ? { conversaId: ativa } : { numero: novoNumero! }, t);
      if (!r.ok) { setErro(r.erro); setMsgs((m) => m.map((x) => (x.id === tmp.id ? { ...x, status: 'ERRO' } : x))); return; }
      if (!ativa && r.dados) { setNovoNumero(null); setAtiva(r.dados); } else await atualizar(false);
    });
  };

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Lista */}
      <aside className={cx('flex w-full flex-col border-r border-slate-200 md:w-[340px]', (ativa || novoNumero) && 'hidden md:flex')}>
        <div className="flex items-center justify-between bg-[#f0f2f5] px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold"><Icone nome="whatsapp" className="h-5 w-5 text-[#25d366]" />Conversas</span>
          <button onClick={() => { setAtiva(null); setNovoNumero(''); setMsgs([]); }} className="rounded-full p-2 hover:bg-black/5" title="Nova conversa"><Icone nome="mais" className="h-5 w-5" /></button>
        </div>
        <div className="p-2"><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar nome ou número" className="w-full rounded-lg bg-[#f0f2f5] px-3 py-2 text-sm outline-none" /></div>
        {estado !== 'aberta' && <p className="mx-2 mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">WhatsApp {estado === 'nao_configurado' ? 'não configurado' : 'desconectado'}. As mensagens novas não chegam até reconectar (botão Conexão, acima).</p>}
        <ul className="flex-1 overflow-y-auto">
          {conversas.map((c) => (
            <li key={c.id}>
              <button onClick={() => { setNovoNumero(null); setAtiva(c.id); }} className={cx('flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#f5f6f6]', c.id === ativa && 'bg-[#f0f2f5]')}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600">{iniciais(c)}</span>
                <span className="min-w-0 flex-1 border-b border-slate-100 pb-3">
                  <span className="flex items-center justify-between gap-2"><span className="truncate font-medium text-slate-900">{c.nome ?? fone(c.telefone)}</span><span className={cx('shrink-0 text-xs', c.naoLidas ? 'font-semibold text-[#25d366]' : 'text-slate-400')}>{quando(c.ultimaEm)}</span></span>
                  <span className="flex items-center justify-between gap-2"><span className="truncate text-sm text-slate-500">{c.ultimaPrevia}</span>{c.naoLidas > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-bold text-white">{c.naoLidas}</span>}</span>
                </span>
              </button>
            </li>
          ))}
          {!conversas.length && <li className="p-6 text-center text-sm text-slate-500">Nenhuma conversa ainda.</li>}
        </ul>
      </aside>

      {/* Chat */}
      <section className={cx('flex min-w-0 flex-1 flex-col bg-[#efeae2]', !(ativa || novoNumero !== null) && 'hidden md:flex')}>
        {!ativa && novoNumero === null ? (
          <div className="m-auto max-w-sm text-center text-sm text-slate-500"><Icone nome="whatsapp" className="mx-auto mb-3 h-12 w-12 text-slate-300" />Escolha uma conversa para responder, ou toque em + para iniciar uma nova.</div>
        ) : (
          <>
            <header className="flex items-center gap-3 bg-[#f0f2f5] px-3 py-2.5">
              <button onClick={() => { setAtiva(null); setNovoNumero(null); }} className="rounded-full p-1.5 hover:bg-black/5 md:hidden" aria-label="Voltar"><Icone nome="voltar" className="h-5 w-5" /></button>
              {conversa ? (
                <>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600">{iniciais(conversa)}</span>
                  <span className="min-w-0"><span className="block truncate font-medium">{conversa.nome ?? fone(conversa.telefone)}</span><span className="block text-xs text-slate-500">{fone(conversa.telefone)}</span></span>
                </>
              ) : (
                <input autoFocus value={novoNumero ?? ''} onChange={(e) => setNovoNumero(e.target.value)} placeholder="Número com DDD, ex.: 11 99999-0000" className="flex-1 rounded-lg bg-white px-3 py-2 text-sm outline-none" />
              )}
            </header>
            <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3 sm:px-10">
              {msgs.map((m, i) => {
                const dia = new Date(m.criadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                const diaAnt = i ? new Date(msgs[i - 1].criadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;
                return (
                  <div key={m.id}>
                    {dia !== diaAnt && <p className="my-2 text-center"><span className="rounded-lg bg-white/90 px-3 py-1 text-xs text-slate-500 shadow-sm">{dia}</span></p>}
                    <div className={cx('flex', m.deMim ? 'justify-end' : 'justify-start')}>
                      <div className={cx('max-w-[78%] rounded-lg px-2.5 py-1.5 text-[14.5px] shadow-sm', m.deMim ? 'bg-[#d9fdd3]' : 'bg-white')}>
                        <Conteudo m={m} />
                        <span className="float-right ml-3 mt-1 flex items-center gap-1 text-[11px] text-slate-500">{hora(m.criadoEm)}{m.deMim && <Tique s={m.status} />}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={fim} />
            </div>
            {erro && <p className="bg-red-50 px-4 py-2 text-xs text-red-700">{erro}</p>}
            <div className="flex items-end gap-2 bg-[#f0f2f5] px-3 py-2.5">
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} rows={1} placeholder="Digite uma mensagem" className="max-h-32 flex-1 resize-none rounded-lg bg-white px-3 py-2.5 text-sm outline-none" />
              <button onClick={enviar} disabled={enviando || !texto.trim()} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-white disabled:opacity-40" aria-label="Enviar"><Icone nome="enviar" className="h-5 w-5" /></button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Mostra o QR Code para conectar o número da loja (escanear em WhatsApp › Aparelhos conectados). */
export function ConectarWhats() {
  const [qr, setQr] = useState<{ qr: string | null; codigo: string | null } | null>(null);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [p, iniciar] = useTransition();
  const gerar = () => iniciar(async () => {
    setErro(null);
    const r = await conectarWhatsAcao();
    if (!r.ok) { setErro(r.erro); return; }
    if (r.dados?.conectado) { setOk(true); setQr(null); return; }
    setQr({ qr: r.dados?.qr ?? null, codigo: r.dados?.codigo ?? null });
  });
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(gerar, 25_000); // o QR expira; renova e detecta quando conectar
    return () => clearInterval(t);
  }, [qr]);
  if (ok) return <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><Icone nome="sucesso" className="h-5 w-5" />WhatsApp conectado. Recarregue a página.</p>;
  return (
    <div className="space-y-3">
      <button onClick={gerar} disabled={p} className="inline-flex items-center gap-2 rounded-xl bg-[#00a884] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Icone nome="qrcode" className="h-4 w-4" />{p && !qr ? 'Gerando…' : qr ? 'Gerar novo QR Code' : 'Conectar WhatsApp'}</button>
      {erro && <p className="text-sm text-red-700">{erro}</p>}
      {qr?.qr && (
        <div className="flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.qr.startsWith('data:') ? qr.qr : `data:image/png;base64,${qr.qr}`} alt="QR Code do WhatsApp" className="h-60 w-60 rounded-xl border bg-white p-2" />
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Abra o WhatsApp da loja no celular</li><li>Toque em Mais opções › <strong>Aparelhos conectados</strong></li><li>Toque em <strong>Conectar um aparelho</strong> e aponte para o QR Code</li>
            {qr.codigo && <li>Ou use o código: <strong className="font-mono">{qr.codigo}</strong></li>}
          </ol>
        </div>
      )}
    </div>
  );
}
