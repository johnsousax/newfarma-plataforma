import { Suspense } from 'react';
import { FormRedefinir } from '@/components/conta/FormsSenha';
import { Aviso } from '@/components/ui';

export const metadata = { title: 'Nova senha', robots: { index: false } };

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token : '';
  return token ? <FormRedefinir token={token} /> : <Aviso tipo="erro">Link inválido. Peça um novo em “Esqueci minha senha”.</Aviso>;
}

export default function Redefinir(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="container-loja max-w-md py-10">
      <div className="cartao p-8">
        <h1 className="mb-6 text-2xl font-bold">Criar nova senha</h1>
        <Suspense><Form searchParams={props.searchParams} /></Suspense>
      </div>
    </div>
  );
}
