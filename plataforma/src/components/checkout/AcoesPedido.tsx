'use client';
import { useActionState, useState, useTransition } from 'react';
import { pagarAcao, enviarReceitaAcao, cancelarPedidoAcao, simularPixAcao, comprarNovamente } from '@/app/acoes/pedidos';
import { FormCartao } from './FormCartao';
import { Aviso, Botao, Campo, cx } from '@/components/ui';
import { tokenizar, type CartaoDigitado } from '@/lib/tokenizacao';
import { Icone } from '@/components/icones';

export function PagarPedido({ pedidoId, total }: { pedidoId: string; total: number }) {
  const [metodo, setMetodo] = useState<'PIX' | 'CARTAO_CREDITO'>('PIX');
  const [cartao, setCartao] = useState<CartaoDigitado>({ numero: '', nome: '', validade: '', cvv: '', parcelas: 1 });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const pagar = () => {
    let dados: unknown = { metodo: 'PIX' };
    if (metodo === 'CARTAO_CREDITO') { try { dados = tokenizar(cartao); } catch (e) { setErro((e as Error).message); return; } }
    iniciar(async () => { const r = await pagarAcao(pedidoId, dados); setErro(r.ok ? null : r.erro); });
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(['PIX', 'CARTAO_CREDITO'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMetodo(m)} className={cx('rounded-xl border-2 px-3 py-2.5 text-sm font-semibold', metodo === m ? 'border-marca-600 bg-marca-50' : 'border-slate-200')}>{m === 'PIX' ? 'PIX' : 'Cartão'}</button>
        ))}
      </div>
      {metodo === 'CARTAO_CREDITO' && <FormCartao total={total} valor={cartao} onChange={setCartao} />}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Botao bloco onClick={pagar} disabled={pendente}>{pendente ? 'Processando…' : metodo === 'PIX' ? 'Gerar código PIX' : 'Pagar com cartão'}</Botao>
    </div>
  );
}

export function CodigoPix({ pagamentoId, codigo, expiraEm, dev }: { pagamentoId: string; codigo: string; expiraEm: string; dev: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="mx-auto grid h-40 w-40 grid-cols-8 gap-0.5 rounded-xl border-4 border-slate-900 bg-white p-2" aria-label="QR Code PIX (ilustrativo)">
        {Array.from({ length: 64 }, (_, i) => <span key={i} className={(codigo.charCodeAt(i % codigo.length) + i) % 3 ? 'bg-slate-900' : 'bg-white'} />)}
      </div>
      <p className="text-center text-xs text-slate-500">Válido até {new Date(expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
      <div className="flex gap-2">
        <input readOnly value={codigo} className="campo font-mono text-xs" aria-label="PIX copia e cola" />
        <Botao variante="escuro" onClick={() => { navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>{copiado ? 'Copiado!' : 'Copiar'}</Botao>
      </div>
      {dev && (
        <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
          Ambiente de demonstração: nenhum banco real está conectado.
          <button disabled={pendente} onClick={() => iniciar(async () => { const r = await simularPixAcao(pagamentoId); setMsg(r.ok ? null : r.erro); })} className="ml-2 font-bold underline">{pendente ? 'Confirmando…' : 'Simular pagamento do PIX'}</button>
          {msg && <p className="mt-1 text-rose-700">{msg}</p>}
        </div>
      )}
    </div>
  );
}

export function EnviarReceita({ pedidoId }: { pedidoId: string }) {
  const [estado, acao, pendente] = useActionState(enviarReceitaAcao, null);
  if (estado?.ok) return <Aviso tipo="sucesso">{estado.mensagem}</Aviso>;
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <Campo rotulo="Foto ou PDF da receita" ajuda="JPG, PNG ou PDF até 5 MB. A imagem é cifrada e só o farmacêutico tem acesso.">
        <input type="file" name="arquivo" accept="image/jpeg,image/png,application/pdf" required className="campo file:mr-3 file:rounded-lg file:border-0 file:bg-marca-50 file:px-3 file:py-1 file:font-semibold file:text-marca-800" />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome do médico(a)"><input name="prescritor" required className="campo" /></Campo>
        <Campo rotulo="CRM / CRO" ajuda="Ex.: CRM-SP 123456"><input name="registro" required placeholder="CRM-SP 123456" className="campo uppercase" /></Campo>
      </div>
      <Campo rotulo="Data de emissão da receita"><input type="date" name="dataEmissao" required className="campo" /></Campo>
      {estado && !estado.ok && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <Botao disabled={pendente}>{pendente ? 'Enviando…' : 'Enviar receita'}</Botao>
    </form>
  );
}

export function CancelarPedido({ pedidoId }: { pedidoId: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  if (!confirmar) return <button onClick={() => setConfirmar(true)} className="text-sm text-rose-700 underline">Cancelar pedido</button>;
  return (
    <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm">
      <p>Tem certeza? O valor pago é estornado e os pontos usados voltam para você.</p>
      <div className="flex gap-2">
        <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => iniciar(async () => { const r = await cancelarPedidoAcao(pedidoId); setErro(r.ok ? null : r.erro); })}>{pendente ? 'Cancelando…' : 'Sim, cancelar'}</Botao>
        <Botao variante="fantasma" tamanho="sm" onClick={() => setConfirmar(false)}>Voltar</Botao>
      </div>
      {erro && <p className="text-rose-700">{erro}</p>}
    </div>
  );
}

export function ComprarNovamente({ pedidoId }: { pedidoId: string }) {
  const [pendente, iniciar] = useTransition();
  return <Botao variante="secundario" tamanho="sm" disabled={pendente} onClick={() => iniciar(async () => { await comprarNovamente(pedidoId); })}>{pendente ? '…' : <><Icone nome="repetir" />Comprar novamente</>}</Botao>;
}
