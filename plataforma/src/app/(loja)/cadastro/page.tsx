import { Suspense } from 'react';
import { FormCadastro } from '@/components/conta/FormsAcesso';

export const metadata = { title: 'Criar conta' };

async function Form({ searchParams }: { searchParams: PageProps<'/cadastro'>['searchParams'] }) {
  const sp = await searchParams;
  return <FormCadastro voltar={typeof sp.voltar === 'string' ? sp.voltar : undefined} />;
}

export default function Cadastro(props: PageProps<'/cadastro'>) {
  return (
    <div className="container-loja max-w-xl py-10">
      <div className="cartao p-8">
        <h1 className="mb-1 text-2xl font-bold">Criar conta</h1>
        <p className="mb-6 text-sm text-slate-500">Leva menos de 1 minuto.</p>
        <Suspense><Form searchParams={props.searchParams} /></Suspense>
      </div>
    </div>
  );
}
