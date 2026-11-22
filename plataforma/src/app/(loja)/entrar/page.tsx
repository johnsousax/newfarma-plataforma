import { Suspense } from 'react';
import { FormEntrar } from '@/components/conta/FormsAcesso';

export const metadata = { title: 'Entrar' };

async function Form({ searchParams }: { searchParams: PageProps<'/entrar'>['searchParams'] }) {
  const sp = await searchParams;
  if (sp.senha === 'redefinida') return <><p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Senha alterada. Entre com a nova senha.</p><FormEntrar voltar={undefined} /></>;
  return <FormEntrar voltar={typeof sp.voltar === 'string' ? sp.voltar : undefined} />;
}

export default function Entrar(props: PageProps<'/entrar'>) {
  return (
    <div className="container-loja grid max-w-5xl gap-8 py-10 md:grid-cols-2">
      <div className="cartao p-8">
        <h1 className="mb-1 text-2xl font-bold">Entrar</h1>
        <p className="mb-6 text-sm text-slate-500">Acompanhe pedidos, use seus pontos e compre mais rápido.</p>
        <Suspense><Form searchParams={props.searchParams} /></Suspense>
      </div>
      <div className="flex flex-col justify-center rounded-3xl bg-marca-600 p-8 text-white">
        <h2 className="text-2xl font-bold">Vantagens de ter conta</h2>
        <ul className="mt-4 space-y-3 text-white/90">
          <li>⭐ 1 ponto por real gasto — troque por desconto</li>
          <li>🔁 Assinatura de uso contínuo com 10% OFF</li>
          <li>⏰ Lembretes para tomar e recomprar seus remédios</li>
          <li>📦 Recompra em um clique</li>
          <li>🎁 10% OFF na primeira compra com BEMVINDO10</li>
        </ul>
        <p className="mt-6 rounded-xl bg-white/10 p-3 text-xs">Demonstração: cliente@farmacia.local · admin@farmacia.local · farmaceutico@farmacia.local · gerente@farmacia.local · atendente@farmacia.local (senha definida no .env).</p>
      </div>
    </div>
  );
}
