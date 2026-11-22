'use client';
import { useRef, useState, useTransition } from 'react';
import { assistenteComprasAcao, criarCompraAcao } from '@/app/acoes/admin';
import { Aviso, Botao, cx } from '@/components/ui';
import { Icone } from '@/components/icones';
import { brl } from '@/lib/formato';
import type { Rascunho, Turno } from '@/server/compras/assistente';

type Fornecedor = { id: string; nome: string };
type Reconhecimento = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void; onerror: () => void };

const SUGESTOES = ['Analise o estoque baixo e sugira um pedido', 'Monte o pedido com a tabela anexada', 'Quais itens estão zerados e vendem bem?'];

export function AssistenteCompras({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const [historico, setHistorico] = useState<Turno[]>([]);
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [pensando, iniciar] = useTransition();
  const [criando, iniciarCriar] = useTransition();
  const reco = useRef<Reconhecimento | null>(null);
  const inputArq = useRef<HTMLInputElement>(null);

  const enviar = (msg = texto) => {
    if (!msg.trim() && !arquivo) return;
    const turno: Turno = { papel: 'usuario', texto: arquivo ? `${msg}${msg ? '\n' : ''}[arquivo: ${arquivo.name}]` : msg };
    const anterior = historico;
    setHistorico([...anterior, turno]);
    setTexto('');
    setErro(null);
    const f = new FormData();
    f.set('texto', msg);
    f.set('historico', JSON.stringify(anterior));
    if (rascunho) f.set('rascunho', JSON.stringify(rascunho));
    if (arquivo) f.set('arquivo', arquivo);
    setArquivo(null);
    iniciar(async () => {
      const r = await assistenteComprasAcao(f);
      if (!r.ok) { setErro(r.erro); return; }
      setHistorico((h) => [...h, { papel: 'assistente', texto: r.dados!.resposta }]);
      if (r.dados!.rascunho) setRascunho(r.dados!.rascunho);
      setLojaId(r.dados!.lojaId);
    });
  };

  const falar = () => {
    const W = window as unknown as { SpeechRecognition?: new () => Reconhecimento; webkitSpeechRecognition?: new () => Reconhecimento };
    const Classe = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Classe) { setErro('Seu navegador não tem reconhecimento de voz. Use o Chrome ou o Edge.'); return; }
    if (ouvindo) { reco.current?.stop(); return; }
    const r = new Classe();
    r.lang = 'pt-BR'; r.interimResults = true; r.continuous = true;
    const base = texto ? `${texto} ` : '';
    r.onresult = (e) => setTexto(base + Array.from(e.results).map((x) => x[0].transcript).join(' '));
    r.onend = () => setOuvindo(false);
    r.onerror = () => setOuvindo(false);
    reco.current = r;
    r.start();
    setOuvindo(true);
  };

  const alterar = (i: number, campo: 'quantidade' | 'custoUnitario', v: number) =>
    setRascunho((r) => r && { ...r, itens: r.itens.map((x, k) => (k === i ? { ...x, [campo]: v } : x)) });
  const remover = (i: number) => setRascunho((r) => r && { ...r, itens: r.itens.filter((_, k) => k !== i) });
  const total = rascunho?.itens.reduce((s, i) => s + i.quantidade * i.custoUnitario, 0) ?? 0;

  const criar = () => iniciarCriar(async () => {
    if (!rascunho?.fornecedorId) { setErro('Escolha o fornecedor do pedido.'); return; }
    if (!lojaId) return;
    const r = await criarCompraAcao({ fornecedorId: rascunho.fornecedorId, lojaId, observacao: rascunho.observacao || 'Montado com o assistente de compras', itens: rascunho.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, custoUnitario: i.custoUnitario })) });
    if (r && !r.ok) setErro(r.erro);
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_520px]">
      <section className="cartao flex min-h-[560px] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {!historico.length && (
            <div className="space-y-3 py-6 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-marca-50 text-marca-600"><Icone nome="assistente" className="h-6 w-6" /></span>
              <p className="font-semibold">Assistente de compras</p>
              <p className="mx-auto max-w-md text-sm text-slate-500">Escreva, fale ou envie a tabela de preços, cotação, foto da lista ou PDF do fornecedor. Eu encontro os produtos no cadastro, analiso o estoque baixo e monto o rascunho do pedido para você revisar.</p>
              <div className="flex flex-wrap justify-center gap-2">{SUGESTOES.map((s) => <button key={s} onClick={() => enviar(s)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs hover:bg-slate-200">{s}</button>)}</div>
            </div>
          )}
          {historico.map((t, i) => (
            <div key={i} className={cx('max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm', t.papel === 'usuario' ? 'ml-auto bg-marca-600 text-white' : 'bg-slate-100 text-slate-800')}>{t.texto}</div>
          ))}
          {pensando && (
            <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
              <span className="flex gap-1">{[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-marca-500" style={{ animationDelay: `${d}ms` }} />)}</span>
              Analisando estoque e cadastro…
            </div>
          )}
        </div>
        {erro && <div className="px-5"><Aviso tipo="erro">{erro}</Aviso></div>}
        <div className="space-y-2 border-t border-slate-100 p-4">
          {arquivo && <p className="flex items-center gap-2 text-xs text-slate-600"><Icone nome="anexo" className="h-3.5 w-3.5" />{arquivo.name}<button onClick={() => setArquivo(null)} className="text-red-600">remover</button></p>}
          <div className="flex items-end gap-2">
            <input ref={inputArq} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf,.csv,text/csv,text/plain" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            <button onClick={() => inputArq.current?.click()} className="rounded-xl p-2.5 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50" title="Anexar arquivo"><Icone nome="anexo" className="h-5 w-5" /></button>
            <button onClick={falar} className={cx('rounded-xl p-2.5 ring-1', ouvindo ? 'animate-pulse bg-red-50 text-red-600 ring-red-200' : 'text-slate-500 ring-slate-200 hover:bg-slate-50')} title={ouvindo ? 'Parar' : 'Falar'}><Icone nome="microfone" className="h-5 w-5" /></button>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} rows={2} placeholder={ouvindo ? 'Ouvindo…' : 'Ex.: "Repor dipirona e soro, fornecedor Santa Cruz, 20% a mais para o fim de semana"'} className="campo flex-1 resize-none" />
            <Botao disabled={pensando || (!texto.trim() && !arquivo)} onClick={() => enviar()}><Icone nome="enviar" /></Botao>
          </div>
        </div>
      </section>

      <aside className="cartao space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-bold"><Icone nome="compras" className="h-5 w-5 text-marca-600" />Rascunho do pedido</h2>
        {!rascunho?.itens.length ? <p className="text-sm text-slate-500">O rascunho aparece aqui quando o assistente montar o pedido. Você pode ajustar tudo antes de criar.</p> : (
          <>
            <label className="block"><span className="rotulo">Fornecedor</span>
              <select value={rascunho.fornecedorId ?? ''} onChange={(e) => setRascunho({ ...rascunho, fornecedorId: e.target.value || null, fornecedor: fornecedores.find((f) => f.id === e.target.value)?.nome ?? null })} className="campo">
                <option value="">Escolha…</option>{fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </label>
            <div className="max-h-[420px] overflow-auto">
              <table className="tabela text-sm">
                <thead><tr><th>Produto</th><th>Qtd</th><th>Custo un.</th><th></th></tr></thead>
                <tbody>
                  {rascunho.itens.map((i, k) => (
                    <tr key={i.produtoId + k}>
                      <td><span className="font-medium">{i.nome}</span><span className="block text-xs text-slate-500">estoque {i.disponivel}{i.motivo && ` · ${i.motivo}`}</span></td>
                      <td><input type="number" min={1} value={i.quantidade} onChange={(e) => alterar(k, 'quantidade', Math.max(1, Number(e.target.value) || 1))} className="campo w-20 py-1" /></td>
                      <td><input type="number" min={0} step="0.01" value={(i.custoUnitario / 100).toFixed(2)} onChange={(e) => alterar(k, 'custoUnitario', Math.round(Number(e.target.value) * 100) || 0)} className="campo w-24 py-1" /></td>
                      <td><button onClick={() => remover(k)} className="text-slate-400 hover:text-red-600" aria-label="Remover"><Icone nome="excluir" className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rascunho.naoEncontrados.length > 0 && <Aviso tipo="alerta">Não encontrados no cadastro: {rascunho.naoEncontrados.join(', ')}</Aviso>}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-sm text-slate-500">{rascunho.itens.length} itens</span><strong className="text-lg">{brl(total)}</strong></div>
            <Botao bloco disabled={criando || !rascunho.fornecedorId} onClick={criar}>{criando ? 'Criando…' : 'Criar pedido de compra'}</Botao>
            <p className="text-xs text-slate-500">O pedido é criado como rascunho. Você confere e envia ao fornecedor na tela do pedido.</p>
          </>
        )}
      </aside>
    </div>
  );
}
