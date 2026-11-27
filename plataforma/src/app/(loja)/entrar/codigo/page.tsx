import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { FormCodigo } from '@/components/conta/FormsAcesso';
import { sessaoAguardandoCodigo } from '@/server/auth';

export const metadata = { title: 'Verificação em duas etapas', robots: { index: false } };

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  if (!(await sessaoAguardandoCodigo())) redirect('/entrar');
  const sp = await searchParams;
  return <FormCodigo voltar={typeof sp.voltar === 'string' ? sp.voltar : undefined} />;
}

export default function CodigoLogin(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="container-loja max-w-md py-10">
      <div className="cartao p-8">
        <h1 className="mb-1 text-2xl font-bold">Verificação em duas etapas</h1>
        <p className="mb-6 text-sm text-slate-500">Sua conta está protegida. Digite o código que aparece no app autenticador do seu celular.</p>
        <Suspense><Form searchParams={props.searchParams} /></Suspense>
      </div>
    </div>
  );
}
