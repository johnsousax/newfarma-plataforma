import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { enriquecer } from '@/server/catalogo';
import { GradeProdutos } from '@/components/loja/CardProduto';
import { Esqueleto, TituloPagina, Vazio, BotaoLink } from '@/components/ui';

export const metadata = { title: 'Favoritos' };

async function Conteudo() {
  await connection();
  const u = await exigirLogin('/conta/favoritos');
  const favs = await db.favorito.findMany({
    where: { usuarioId: u.id, produto: { ativo: true } }, orderBy: { criadoEm: 'desc' },
    include: { produto: { select: { id: true, slug: true, nome: true, icone: true, preco: true, precoDe: true, classificacao: true, tipo: true, categoriaId: true, marcaId: true, descricaoCurta: true, principioAtivo: true, concentracao: true, marca: { select: { nome: true, slug: true } }, categoria: { select: { paiId: true, nome: true, cor: true, slug: true } }, imagens: { select: { id: true }, orderBy: { ordem: 'asc' }, take: 1 } } } },
  });
  if (!favs.length) return <Vazio icone="coracao" titulo="Nenhum favorito" texto="Toque em Favoritar na página do produto para guardar aqui." acao={<BotaoLink href="/">Explorar produtos</BotaoLink>} />;
  return <GradeProdutos produtos={await enriquecer(favs.map((f) => f.produto))} />;
}

export default function Favoritos() {
  return <><TituloPagina titulo="Favoritos" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
