import { Suspense } from 'react';
import { connection } from 'next/server';
import { vitrine } from '@/server/catalogo';
import { GradeProdutos } from '@/components/loja/CardProduto';
import { EsqueletoListagem } from '@/components/loja/Esqueletos';
import { Vazio } from '@/components/ui';

export const metadata = { title: 'Ofertas' };

async function Conteudo() {
  await connection();
  const produtos = await vitrine('ofertas', { limite: 60 });
  return produtos.length ? <GradeProdutos produtos={produtos} /> : <Vazio icone="🏷️" titulo="Nenhuma oferta no momento" texto="Volte em breve: temos novidades toda semana." />;
}

export default function Ofertas() {
  return (
    <div className="container-loja py-6">
      <div className="mb-6 rounded-3xl bg-gradient-to-r from-oferta-600 to-orange-500 px-6 py-8 text-white">
        <h1 className="text-3xl font-extrabold">🔥 Ofertas da semana</h1>
        <p className="mt-1 text-white/90">Descontos, leve-mais-pague-menos e preços especiais. Enquanto durarem os estoques.</p>
      </div>
      <Suspense fallback={<EsqueletoListagem semTitulo />}><Conteudo /></Suspense>
    </div>
  );
}
