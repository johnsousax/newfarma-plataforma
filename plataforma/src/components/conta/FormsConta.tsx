'use client';
import { useActionState, useTransition } from 'react';
import { revogarTermoAssistente } from '@/app/acoes/assistente';
import { criarAssinatura, alternarAssinatura, salvarLembrete, removerLembrete, salvarDados, trocarSenha, excluirConta } from '@/app/acoes/conta';
import { Aviso, Botao, Campo } from '@/components/ui';

type Opc = { id: string; nome: string };

function Retorno({ estado }: { estado: { ok: boolean; erro?: string; mensagem?: string } | null | undefined }) {
  if (!estado) return null;
  return estado.ok ? (estado.mensagem ? <Aviso tipo="sucesso">{estado.mensagem}</Aviso> : null) : <Aviso tipo="erro">{estado.erro}</Aviso>;
}

export function FormAssinatura({ produtos, enderecos, produtoInicial }: { produtos: Opc[]; enderecos: Opc[]; produtoInicial?: string }) {
  const [estado, acao, pendente] = useActionState(criarAssinatura, null);
  return (
    <form action={acao} className="cartao space-y-3 p-5">
      <h2 className="font-semibold">Nova assinatura</h2>
      <Campo rotulo="Produto"><select name="produtoId" defaultValue={produtoInicial} required className="campo">{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Quantidade"><input name="quantidade" type="number" min={1} max={10} defaultValue={1} className="campo" /></Campo>
        <Campo rotulo="Receber a cada"><select name="intervaloDias" defaultValue={30} className="campo">{[15, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}</select></Campo>
        <Campo rotulo="Entregar em"><select name="enderecoId" className="campo">{enderecos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></Campo>
      </div>
      <Retorno estado={estado} />
      <Botao disabled={pendente}>Assinar com 10% OFF</Botao>
    </form>
  );
}

export function BotaoAssinatura({ id, ativa }: { id: string; ativa: boolean }) {
  const [p, iniciar] = useTransition();
  return <Botao variante={ativa ? 'secundario' : 'primario'} tamanho="sm" disabled={p} onClick={() => iniciar(async () => { await alternarAssinatura(id); })}>{ativa ? 'Pausar' : 'Reativar'}</Botao>;
}

export function FormLembrete({ produtos }: { produtos: Opc[] }) {
  const [estado, acao, pendente] = useActionState(salvarLembrete, null);
  return (
    <form action={acao} className="cartao space-y-3 p-5">
      <h2 className="font-semibold">Novo lembrete</h2>
      <Campo rotulo="Medicamento"><input name="nomeMedicamento" required list="meds" className="campo" placeholder="Ex.: Losartana 50mg" /></Campo>
      <datalist id="meds">{produtos.map((p) => <option key={p.id} value={p.nome} />)}</datalist>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Dose"><input name="dosagem" placeholder="1 comprimido" className="campo" /></Campo>
        <Campo rotulo="Horários" ajuda="Separe por vírgula"><input name="horarios" required placeholder="08:00, 20:00" className="campo" /></Campo>
        <Campo rotulo="Doses na caixa" ajuda="Avisamos quando acabar"><input name="dosesRestantes" type="number" min={0} className="campo" /></Campo>
      </div>
      <Retorno estado={estado} />
      <Botao disabled={pendente}>Criar lembrete</Botao>
    </form>
  );
}

export function BotaoRemoverLembrete({ id }: { id: string }) {
  const [p, iniciar] = useTransition();
  return <button disabled={p} onClick={() => iniciar(async () => { await removerLembrete(id); })} className="text-sm text-rose-700 underline">Excluir</button>;
}

export function FormDados({ nome, telefone, marketing }: { nome: string; telefone: string; marketing: boolean }) {
  const [estado, acao, pendente] = useActionState(salvarDados, null);
  return (
    <form action={acao} className="cartao space-y-3 p-5">
      <h2 className="font-semibold">Dados pessoais</h2>
      <Campo rotulo="Nome completo"><input name="nome" defaultValue={nome} required className="campo" /></Campo>
      <Campo rotulo="Celular"><input name="telefone" defaultValue={telefone} required className="campo" /></Campo>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="marketing" defaultChecked={marketing} className="h-4 w-4 accent-marca-600" /> Aceito receber ofertas (posso cancelar quando quiser)</label>
      <Retorno estado={estado} />
      <Botao disabled={pendente}>Salvar</Botao>
    </form>
  );
}

export function FormSenha() {
  const [estado, acao, pendente] = useActionState(trocarSenha, null);
  return (
    <form action={acao} className="cartao space-y-3 p-5">
      <h2 className="font-semibold">Trocar senha</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Senha atual"><input name="atual" type="password" required autoComplete="current-password" className="campo" /></Campo>
        <Campo rotulo="Nova senha" ajuda="10+ caracteres com letras e números"><input name="nova" type="password" required minLength={10} autoComplete="new-password" className="campo" /></Campo>
      </div>
      <Retorno estado={estado} />
      <Botao disabled={pendente}>Alterar senha</Botao>
    </form>
  );
}

export function FormExcluirConta() {
  const [estado, acao, pendente] = useActionState(excluirConta, null);
  return (
    <form action={acao} className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
      <h2 className="font-semibold text-rose-800">Excluir minha conta</h2>
      <p className="text-sm text-rose-900/80">Apagamos endereços, favoritos, lembretes e assinaturas e anonimizamos seu cadastro. Notas fiscais e registros sanitários (receitas e escrituração) são mantidos pelo prazo legal.</p>
      <Campo rotulo="Confirme sua senha"><input name="senha" type="password" required className="campo" /></Campo>
      <Retorno estado={estado} />
      <Botao variante="perigo" disabled={pendente}>Excluir definitivamente</Botao>
    </form>
  );
}

export function RevogarAssistente() {
  const [p, iniciar] = useTransition();
  return <button disabled={p} onClick={() => iniciar(async () => { await revogarTermoAssistente(); })} className="ml-1 underline">revogar</button>;
}
