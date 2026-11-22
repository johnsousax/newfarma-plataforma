'use client';
import { useActionState, useState, useTransition, type ReactNode } from 'react';
import { Aviso, Botao } from '@/components/ui';

type Res = { ok: boolean; erro?: string; mensagem?: string; campos?: Record<string, string> } | null | undefined | void;

/** Formulário ligado a uma Server Action com mensagens de sucesso/erro. */
export function FormAcao({ acao, children, rotulo = 'Salvar', className, variante }: { acao: (prev: unknown, f: FormData) => Promise<Res>; children: ReactNode; rotulo?: string; className?: string; variante?: 'primario' | 'secundario' | 'perigo' | 'escuro' }) {
  const [estado, executar, pendente] = useActionState(acao, null);
  const campos = estado && !estado.ok ? estado.campos : undefined;
  return (
    <form action={executar} className={className ?? 'space-y-3'}>
      {children}
      {campos ? <ul className="text-xs text-rose-600">{Object.entries(campos).map(([k, v]) => <li key={k}><strong>{k}</strong>: {v}</li>)}</ul> : null}
      {estado && !estado.ok ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      {estado && estado.ok && estado.mensagem ? <Aviso tipo="sucesso">{estado.mensagem}</Aviso> : null}
      <Botao disabled={pendente} variante={variante}>{pendente ? 'Aguarde…' : rotulo}</Botao>
    </form>
  );
}

/** Botão que chama uma Server Action (com confirmação opcional). */
export function BotaoAcao({ acao, children, confirmar, variante = 'secundario', tamanho = 'sm', pedirTexto }: { acao: (texto?: string) => Promise<Res>; children: ReactNode; confirmar?: string; variante?: 'primario' | 'secundario' | 'perigo' | 'escuro' | 'fantasma'; tamanho?: 'sm' | 'md'; pedirTexto?: string }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const rodar = () => iniciar(async () => {
    const r = await acao(texto);
    setAberto(false);
    setMsg(r ? (r.ok ? (r.mensagem ? { ok: true, t: r.mensagem } : null) : { ok: false, t: r.erro ?? 'Erro' }) : null);
  });
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {aberto ? (
        <span className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-sm">
          {confirmar && <span>{confirmar}</span>}
          {pedirTexto && <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={pedirTexto} className="campo w-56 py-1.5" />}
          <Botao tamanho="sm" variante={variante === 'perigo' ? 'perigo' : 'primario'} disabled={pendente} onClick={rodar}>{pendente ? '…' : 'Confirmar'}</Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={() => setAberto(false)}>Cancelar</Botao>
        </span>
      ) : (
        <Botao variante={variante} tamanho={tamanho} disabled={pendente} onClick={() => (confirmar || pedirTexto ? setAberto(true) : rodar())}>{pendente ? '…' : children}</Botao>
      )}
      {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.t}</span>}
    </span>
  );
}
