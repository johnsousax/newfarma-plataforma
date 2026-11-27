'use client';
import { useActionState, useState, useTransition } from 'react';
import { iniciarDoisFatoresAcao, confirmarDoisFatoresAcao, desativarDoisFatoresAcao, reautenticarAcao, novosCodigosRecuperacaoAcao } from '@/app/acoes/gestao';
import { Aviso, Botao } from '@/components/ui';

type Res = { ok: boolean; erro?: string; mensagem?: string; dados?: unknown } | null;

function Codigos({ codigos }: { codigos: string[] }) {
  return (
    <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Guarde estes códigos de recuperação em lugar seguro (papel ou cofre de senhas). Cada um entra uma vez se você perder o celular. Eles não serão mostrados de novo.</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-lg">{codigos.map((c) => <li key={c} className="rounded bg-white px-3 py-1 text-center">{c}</li>)}</ul>
    </div>
  );
}

function CampoCodigo({ acao, rotulo, variante }: { acao: (p: unknown, f: FormData) => Promise<Res>; rotulo: string; variante?: 'primario' | 'perigo' | 'secundario' }) {
  const [estado, executar, pendente] = useActionState(acao, null);
  const codigos = estado?.ok && Array.isArray(estado.dados) ? (estado.dados as string[]) : null;
  return (
    <form action={executar} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block"><span className="rotulo">Código do app</span><input name="codigo" inputMode="numeric" autoComplete="one-time-code" required maxLength={20} className="campo w-40 text-center text-lg tracking-widest" /></label>
        <Botao disabled={pendente} variante={variante}>{pendente ? 'Conferindo…' : rotulo}</Botao>
      </div>
      {estado && !estado.ok && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado?.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
      {codigos && <Codigos codigos={codigos} />}
    </form>
  );
}

export function DoisFatores({ ativo, recuperacaoRestantes, reautenticadoAte }: { ativo: boolean; recuperacaoRestantes: number; reautenticadoAte: string | null }) {
  const [chave, setChave] = useState<{ segredo: string; link: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (ativo) {
    return (
      <div className="space-y-6">
        <Aviso tipo="sucesso">Verificação em duas etapas <strong>ativa</strong>. Ao entrar, o sistema pede a senha e o código do app. Códigos de recuperação restantes: {recuperacaoRestantes}.</Aviso>
        <section className="cartao space-y-3 p-5">
          <h2 className="font-bold">Liberar ações protegidas</h2>
          <p className="text-sm text-slate-600">Backup, mudanças de cargos/permissões, equipe e cancelamento de nota pedem um código recente. {reautenticadoAte ? <>Liberado até <strong>{reautenticadoAte}</strong>.</> : 'No momento estão bloqueadas.'}</p>
          <CampoCodigo acao={reautenticarAcao} rotulo="Confirmar" />
        </section>
        <section className="cartao space-y-3 p-5">
          <h2 className="font-bold">Novos códigos de recuperação</h2>
          <CampoCodigo acao={novosCodigosRecuperacaoAcao} rotulo="Gerar novos" variante="secundario" />
        </section>
        <section className="cartao space-y-3 p-5">
          <h2 className="font-bold text-rose-700">Desativar</h2>
          <p className="text-sm text-slate-600">Sua conta volta a entrar só com a senha. Não recomendado para administradores.</p>
          <CampoCodigo acao={desativarDoisFatoresAcao} rotulo="Desativar" variante="perigo" />
        </section>
      </div>
    );
  }

  return (
    <div className="cartao space-y-5 p-6">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Instale no celular um app autenticador: <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> ou <strong>Authy</strong> (grátis).</li>
        <li>Clique em <em>Gerar chave</em> e, no app, escolha <em>Inserir chave de configuração</em> (ou toque no link pelo celular).</li>
        <li>Digite abaixo o código de 6 dígitos que o app mostrar.</li>
      </ol>
      {!chave ? (
        <>
          <Botao disabled={pendente} onClick={() => iniciar(async () => { const r = await iniciarDoisFatoresAcao(); if (r.ok && r.dados) { setChave(r.dados); setErro(null); } else if (!r.ok) setErro(r.erro); })}>{pendente ? 'Gerando…' : 'Gerar chave'}</Botao>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chave de configuração</p>
            <p className="mt-1 break-all font-mono text-xl font-bold tracking-wider">{chave.segredo.match(/.{1,4}/g)?.join(' ')}</p>
            <p className="mt-2 text-xs text-slate-500">Nome da conta: New Farma Popular · Tipo: baseado no horário</p>
            <a href={chave.link} className="mt-3 inline-block text-sm font-semibold text-marca-700 underline">Abrir no app autenticador (pelo celular)</a>
          </div>
          <CampoCodigo acao={confirmarDoisFatoresAcao} rotulo="Ativar" />
        </div>
      )}
    </div>
  );
}
