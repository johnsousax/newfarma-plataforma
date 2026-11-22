import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { carrinhoAtual, resumir } from '@/server/carrinho';
import { FluxoCheckout } from '@/components/checkout/FluxoCheckout';
import { EsqueletoPagina } from '@/components/loja/Esqueletos';
import { ImagemProduto } from '@/components/ui';
import { brl } from '@/lib/formato';

export const metadata = { title: 'Finalizar compra' };

async function Conteudo() {
  await connection();
  const u = await exigirLogin('/checkout');
  const c = await carrinhoAtual();
  const r = await resumir(c, { usuarioId: u.id });
  if (!r.linhas.length) redirect('/carrinho');
  const enderecos = await db.endereco.findMany({ where: { usuarioId: u.id }, orderBy: [{ principal: 'desc' }, { criadoEm: 'asc' }] });
  return (
    <>
      <FluxoCheckout enderecos={enderecos} nome={u.nome} exigeReceita={r.exigeReceita} />
      <details className="cartao mt-4 p-5 lg:max-w-[calc(100%-404px)]">
        <summary className="cursor-pointer font-semibold">Itens do pedido ({r.quantidadeItens})</summary>
        <ul className="mt-3 divide-y divide-slate-100">
          {r.linhas.map((l) => (
            <li key={l.produtoId} className="flex items-center gap-3 py-2 text-sm">
              <ImagemProduto icone={l.icone} imagemId={l.imagemId} tamanho="sm" />
              <span className="flex-1">{l.quantidade}× {l.nome}</span>
              <strong>{brl(l.total)}</strong>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

export default function Checkout() {
  return (
    <div className="container-loja py-6">
      <h1 className="mb-6 text-2xl font-bold">Finalizar compra</h1>
      <Suspense fallback={<EsqueletoPagina />}><Conteudo /></Suspense>
    </div>
  );
}
