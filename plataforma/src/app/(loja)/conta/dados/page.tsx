import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { decifrar } from '@/server/cripto';
import { Esqueleto, TituloPagina } from '@/components/ui';
import { FormDados, FormSenha, FormExcluirConta } from '@/components/conta/FormsConta';
import { mascararCpf } from '@/lib/formato';

export const metadata = { title: 'Dados e privacidade' };

async function Conteudo() {
  await connection();
  const u = await exigirLogin('/conta/dados');
  const c = await db.usuario.findUniqueOrThrow({ where: { id: u.id } });
  return (
    <div className="space-y-4">
      <div className="cartao grid gap-3 p-5 text-sm sm:grid-cols-2">
        <div><p className="text-slate-500">E-mail</p><p className="font-medium">{c.email}</p></div>
        <div><p className="text-slate-500">CPF</p><p className="font-medium">{mascararCpf(decifrar(c.cpfCifrado))}</p></div>
      </div>
      <FormDados nome={c.nome} telefone={c.telefone ?? ''} marketing={c.aceitaMarketing} />
      <FormSenha />
      {c.papel === 'CLIENTE' && <FormExcluirConta />}
    </div>
  );
}

export default function Dados() {
  return <><TituloPagina titulo="Dados e privacidade" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
