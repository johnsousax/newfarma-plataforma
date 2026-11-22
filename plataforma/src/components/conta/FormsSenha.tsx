'use client';
import { useActionState } from 'react';
import { pedirRedefinicaoSenha, redefinirSenha } from '@/app/acoes/conta';
import { Aviso, Botao, Campo } from '@/components/ui';

export function FormEsqueci() {
  const [e, acao, p] = useActionState(pedirRedefinicaoSenha, null);
  if (e?.ok) return <Aviso tipo="sucesso">{e.mensagem}</Aviso>;
  return (
    <form action={acao} className="space-y-4">
      <Campo rotulo="E-mail da conta"><input name="email" type="email" required autoComplete="email" className="campo" /></Campo>
      {e && !e.ok && <Aviso tipo="erro">{e.erro}</Aviso>}
      <Botao bloco disabled={p}>{p ? 'Enviando…' : 'Enviar link'}</Botao>
    </form>
  );
}

export function FormRedefinir({ token }: { token: string }) {
  const [e, acao, p] = useActionState(redefinirSenha, null);
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Campo rotulo="Nova senha" ajuda="Mínimo de 10 caracteres, com letras e números"><input name="senha" type="password" required minLength={10} autoComplete="new-password" className="campo" /></Campo>
      <Campo rotulo="Repita a nova senha"><input name="confirmacao" type="password" required minLength={10} autoComplete="new-password" className="campo" /></Campo>
      {e && !e.ok && <Aviso tipo="erro">{e.erro}</Aviso>}
      <Botao bloco disabled={p}>{p ? 'Salvando…' : 'Salvar nova senha'}</Botao>
    </form>
  );
}
