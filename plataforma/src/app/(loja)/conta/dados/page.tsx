import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { decifrar } from '@/server/cripto';
import { Esqueleto, TituloPagina } from '@/components/ui';
import { FormDados, FormSenha, FormExcluirConta, RevogarAssistente } from '@/components/conta/FormsConta';
import { mascararCpf, data } from '@/lib/formato';

export const metadata = { title: 'Dados e privacidade' };

async function Conteudo() {
  await connection();
  const u = await exigirLogin('/conta/dados');
  const c = await db.usuario.findUniqueOrThrow({ where: { id: u.id } });
  return (
    <div className="space-y-4">
      <div className="cartao grid gap-3 p-5 text-sm sm:grid-cols-3">
        <div><p className="text-slate-500">E-mail</p><p className="font-medium">{c.email}</p></div>
        <div><p className="text-slate-500">CPF</p><p className="font-medium">{mascararCpf(decifrar(c.cpfCifrado))}</p></div>
        <div><p className="text-slate-500">Consentimento LGPD</p><p className="font-medium">{data(c.consentimentoLgpdEm)}</p><p className="mt-1 text-xs text-slate-500">Assistente virtual: {c.consentimentoAssistenteEm ? <>autorizado em {data(c.consentimentoAssistenteEm)} <RevogarAssistente /></> : 'não autorizado'}</p></div>
      </div>
      <FormDados nome={c.nome} telefone={c.telefone ?? ''} marketing={c.aceitaMarketing} />
      <FormSenha />
      <div className="cartao p-5">
        <h2 className="font-semibold">Portabilidade (LGPD art. 18)</h2>
        <p className="mt-1 text-sm text-slate-600">Baixe uma cópia dos seus dados pessoais, pedidos, endereços e pontos em formato JSON.</p>
        <a href="/api/conta/exportar" className="mt-3 inline-block rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">⬇ Baixar meus dados</a>
      </div>
      {c.papel === 'CLIENTE' && <FormExcluirConta />}
    </div>
  );
}

export default function Dados() {
  return <><TituloPagina titulo="Dados e privacidade" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
