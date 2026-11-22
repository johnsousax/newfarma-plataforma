import 'server-only';
import { cache } from 'react';
import { db } from './db';

export type PromoAtiva = Awaited<ReturnType<typeof promocoesAtivas>>[number];

/** Promoções vigentes (memorizado por requisição). */
export const promocoesAtivas = cache(async () => {
  const agora = new Date();
  return db.promocao.findMany({
    where: { ativa: true, inicio: { lte: agora }, fim: { gte: agora } },
    include: { produtos: { select: { id: true } } },
  });
});

type ProdutoPreco = { id: string; preco: number; precoDe: number | null; categoriaId: string; marcaId: string; categoriaPaiId?: string | null };

export type Oferta = {
  preco: number;
  precoDe: number | null;
  selo: string | null;
  leve: number | null;
  pague: number | null;
  promocaoId: string | null;
};

const aplica = (promo: PromoAtiva, p: ProdutoPreco) =>
  promo.produtos.some((x) => x.id === p.id) ||
  (promo.categoriaId && (promo.categoriaId === p.categoriaId || promo.categoriaId === p.categoriaPaiId)) ||
  (promo.marcaId && promo.marcaId === p.marcaId);

/** Calcula o preço de vitrine aplicando a melhor promoção percentual e informa "leve X pague Y". */
export function calcularOferta(p: ProdutoPreco, promos: PromoAtiva[]): Oferta {
  let melhorPct = 0;
  let promoPctId: string | null = null;
  let levePague: PromoAtiva | null = null;
  for (const promo of promos) {
    if (!aplica(promo, p)) continue;
    if (promo.tipo === 'PERCENTUAL' && (promo.percentual ?? 0) > melhorPct) { melhorPct = promo.percentual ?? 0; promoPctId = promo.id; }
    if (promo.tipo === 'LEVE_PAGUE' && promo.leve && promo.pague && promo.pague < promo.leve) levePague = promo;
  }
  const preco = melhorPct ? Math.round((p.preco * (100 - melhorPct)) / 100) : p.preco;
  const de = Math.max(p.precoDe ?? 0, p.preco);
  return {
    preco,
    precoDe: de > preco ? de : null,
    selo: levePague ? `Leve ${levePague.leve} Pague ${levePague.pague}` : de > preco ? `-${Math.round((1 - preco / de) * 100)}%` : null,
    leve: levePague?.leve ?? null,
    pague: levePague?.pague ?? null,
    promocaoId: promoPctId ?? levePague?.id ?? null,
  };
}

/** Desconto do "leve X pague Y" para uma quantidade. */
export function descontoLevePague(oferta: Oferta, quantidade: number) {
  if (!oferta.leve || !oferta.pague) return 0;
  const gratis = Math.floor(quantidade / oferta.leve) * (oferta.leve - oferta.pague);
  return gratis * oferta.preco;
}
