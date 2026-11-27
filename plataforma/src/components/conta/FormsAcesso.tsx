'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { entrarAcao, cadastrarAcao, codigoLoginAcao } from '@/app/acoes/conta';
import { Aviso, Botao, Campo } from '@/components/ui';

export function FormEntrar({ voltar }: { voltar?: string }) {
  const [estado, acao, pendente] = useActionState(entrarAcao, null);
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="voltar" value={voltar ?? ''} />
      <Campo rotulo="E-mail"><input name="email" type="email" autoComplete="email" required className="campo" /></Campo>
      <Campo rotulo="Senha"><input name="senha" type="password" autoComplete="current-password" required className="campo" /></Campo>
      <Link href="/esqueci-senha" className="block text-right text-sm text-marca-600 underline">Esqueci minha senha</Link>
      {estado && !estado.ok && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <Botao bloco tamanho="lg" disabled={pendente}>{pendente ? 'Entrando…' : 'Entrar'}</Botao>
      <p className="text-center text-sm text-slate-600">Ainda não tem conta? <Link href={`/cadastro${voltar ? `?voltar=${encodeURIComponent(voltar)}` : ''}`} className="link">Cadastre-se</Link></p>
    </form>
  );
}

export function FormCadastro({ voltar }: { voltar?: string }) {
  const [estado, acao, pendente] = useActionState(cadastrarAcao, null);
  const c = estado && !estado.ok && 'campos' in estado ? (estado.campos as Record<string, string>) : {};
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="voltar" value={voltar ?? ''} />
      <Campo rotulo="Nome completo" erro={c.nome}><input name="nome" autoComplete="name" required className="campo" /></Campo>
      <Campo rotulo="E-mail" erro={c.email}><input name="email" type="email" autoComplete="email" required className="campo" /></Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="CPF" erro={c.cpf} ajuda="Necessário para a nota fiscal e receitas"><input name="cpf" inputMode="numeric" required placeholder="000.000.000-00" className="campo" /></Campo>
        <Campo rotulo="Data de nascimento" erro={c.nascimento}><input name="nascimento" type="date" required className="campo" /></Campo>
      </div>
      <Campo rotulo="Celular (WhatsApp)" erro={c.telefone}><input name="telefone" type="tel" autoComplete="tel" required placeholder="(11) 99999-9999" className="campo" /></Campo>
      <Campo rotulo="Senha" ajuda="Mínimo de 10 caracteres, com letras e números"><input name="senha" type="password" autoComplete="new-password" required minLength={10} className="campo" /></Campo>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="lgpd" required className="mt-0.5 h-4 w-4 accent-marca-600" />
        <span>Li e aceito a <Link href="/privacidade" className="link" target="_blank">Política de Privacidade</Link>. Autorizo o tratamento dos meus dados para a compra e, no caso de receitas, dos dados de saúde necessários à dispensação (LGPD, art. 11).</span>
      </label>
      {c.lgpd && <p className="text-xs text-rose-600">{c.lgpd}</p>}
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="marketing" className="h-4 w-4 accent-marca-600" /> Quero receber ofertas por e-mail e WhatsApp (opcional)</label>
      {estado && !estado.ok && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <Botao bloco tamanho="lg" disabled={pendente}>{pendente ? 'Criando conta…' : 'Criar minha conta'}</Botao>
      <p className="text-center text-sm text-slate-600">Já tem conta? <Link href="/entrar" className="link">Entrar</Link></p>
    </form>
  );
}

/** Segunda etapa do login (verificação em duas etapas). */
export function FormCodigo({ voltar }: { voltar?: string }) {
  const [estado, acao, pendente] = useActionState(codigoLoginAcao, null);
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="voltar" value={voltar ?? ''} />
      <Campo rotulo="Código de 6 dígitos" ajuda="Abra o app autenticador no celular. Sem o celular? Use um código de recuperação (ex.: ABCD-EFGH).">
        <input name="codigo" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={20} className="campo text-center text-2xl tracking-[0.4em]" />
      </Campo>
      {estado && !estado.ok && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <Botao bloco tamanho="lg" disabled={pendente}>{pendente ? 'Conferindo…' : 'Confirmar'}</Botao>
      <p className="text-center text-sm text-slate-600"><Link href="/entrar" className="link">Voltar e entrar com outra conta</Link></p>
    </form>
  );
}
