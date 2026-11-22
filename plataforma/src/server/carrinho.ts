import 'server-only';
import { cookies } from 'next/headers';
import { db } from './db';
import { config } from './config';
import { ErroNegocio } from './erros';
import { usuarioAtual } from './auth';
import { calcularOferta, descontoLevePague, promocoesAtivas, type Oferta } from './precos';
import { disponibilidade } from './estoque';
import { REGRAS } from '@/lib/dominio';
import type { Classificacao } from '@/generated/prisma/enums';

export const COOKIE_CARRINHO = 'fx_carrinho';
const MAX_POR_ITEM = 20;

const incluir = {
  itens: {
    orderBy: { id: 'asc' as const },
    include: { produto: { select: { id: true, nome: true, slug: true, icone: true, preco: true, precoDe: true, classificacao: true, categoriaId: true, marcaId: true, ativo: true, sku: true, categoria: { select: { paiId: true } }, marca: { select: { nome: true } }, imagens: { select: { id: true }, orderBy: { ordem: 'asc' as const }, take: 1 } } } },
  },
};

/** Carrinho do usuário logado ou do visitante (cookie). Não cria — seguro para Server Components. */
export async function carrinhoAtual() {
  const u = await usuarioAtual();
  if (u) return db.carrinho.findUnique({ where: { usuarioId: u.id }, include: incluir });
  const id = (await cookies()).get(COOKIE_CARRINHO)?.value;
  if (!id) return null;
  return db.carrinho.findFirst({ where: { id, usuarioId: null }, include: incluir });
}

/** Obtém ou cria o carrinho (somente em Server Actions, que podem gravar cookies). */
export async function garantirCarrinho() {
  const atual = await carrinhoAtual();
  if (atual) return atual;
  const u = await usuarioAtual();
  const novo = await db.carrinho.create({ data: { usuarioId: u?.id ?? null }, include: incluir });
  if (!u) (await cookies()).set(COOKIE_CARRINHO, novo.id, { httpOnly: true, sameSite: 'lax', secure: config.producao, path: '/', maxAge: 60 * 60 * 24 * 30 });
  return novo;
}

/** Ao entrar, junta o carrinho de visitante ao da conta. */
export async function mesclarCarrinhoVisitante(usuarioId: string) {
  const jar = await cookies();
  const id = jar.get(COOKIE_CARRINHO)?.value;
  if (!id) return;
  const visitante = await db.carrinho.findFirst({ where: { id, usuarioId: null }, include: { itens: true } });
  jar.delete(COOKIE_CARRINHO);
  if (!visitante) return;
  const conta = await db.carrinho.upsert({ where: { usuarioId }, create: { usuarioId }, update: {} });
  for (const i of visitante.itens) {
    await db.carrinhoItem.upsert({
      where: { carrinhoId_produtoId: { carrinhoId: conta.id, produtoId: i.produtoId } },
      create: { carrinhoId: conta.id, produtoId: i.produtoId, quantidade: i.quantidade },
      update: { quantidade: { increment: i.quantidade } },
    });
  }
  if (visitante.cupomCodigo || visitante.cep) await db.carrinho.update({ where: { id: conta.id }, data: { cupomCodigo: visitante.cupomCodigo ?? undefined, cep: visitante.cep ?? undefined } });
  await db.carrinho.delete({ where: { id: visitante.id } });
}

export async function adicionarItem(produtoId: string, quantidade: number, substituir = false) {
  const produto = await db.produto.findUnique({ where: { id: produtoId } });
  if (!produto || !produto.ativo) throw new ErroNegocio('Produto indisponível.');
  if (!REGRAS[produto.classificacao].vendaRemota) {
    throw new ErroNegocio('Medicamento de controle especial (Portaria 344/98): a venda pela internet é proibida (RDC 44/2009). Disponível apenas na loja, com a receita original.');
  }
  const carrinho = await garantirCarrinho();
  const atual = carrinho.itens.find((i) => i.produtoId === produtoId)?.quantidade ?? 0;
  const nova = Math.min(MAX_POR_ITEM, Math.max(0, substituir ? quantidade : atual + quantidade));
  const disp = (await disponibilidade([produtoId])).get(produtoId) ?? 0;
  if (nova > disp) throw new ErroNegocio(disp ? `Temos apenas ${disp} unidade(s) disponível(is).` : 'Produto esgotado no momento.');
  if (nova === 0) {
    await db.carrinhoItem.deleteMany({ where: { carrinhoId: carrinho.id, produtoId } });
  } else {
    await db.carrinhoItem.upsert({
      where: { carrinhoId_produtoId: { carrinhoId: carrinho.id, produtoId } },
      create: { carrinhoId: carrinho.id, produtoId, quantidade: nova },
      update: { quantidade: nova },
    });
  }
  return nova;
}

export type CarrinhoCompleto = NonNullable<Awaited<ReturnType<typeof carrinhoAtual>>>;

export type LinhaCarrinho = {
  produtoId: string; nome: string; slug: string; icone: string; imagemId: string | null; marca: string; sku: string;
  classificacao: Classificacao; quantidade: number; oferta: Oferta; precoBase: number;
  totalBruto: number; descontoLevePague: number; total: number; disponivel: number; exigeReceita: boolean; aviso?: string;
};

/** Valida o cupom para este cliente/subtotal. Retorna o desconto em centavos (ou frete grátis). */
export async function avaliarCupom(codigo: string, subtotal: number, usuarioId: string | null) {
  const cupom = await db.cupom.findUnique({ where: { codigo: codigo.toUpperCase().trim() } });
  const agora = new Date();
  if (!cupom || !cupom.ativo || (cupom.inicio && cupom.inicio > agora) || (cupom.fim && cupom.fim < agora)) return { erro: 'Cupom inválido ou expirado.' } as const;
  if (cupom.usoMaximo != null && cupom.usos >= cupom.usoMaximo) return { erro: 'Este cupom esgotou.' } as const;
  if (subtotal < cupom.minimoPedido) return { erro: `Cupom válido para compras acima de ${(cupom.minimoPedido / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` } as const;
  if (usuarioId) {
    const usados = await db.pedido.count({ where: { usuarioId, cupomId: cupom.id, status: { not: 'CANCELADO' } } });
    if (usados >= cupom.usoPorCliente) return { erro: 'Você já utilizou este cupom.' } as const;
    if (cupom.primeiraCompra && (await db.pedido.count({ where: { usuarioId, status: { not: 'CANCELADO' } } })) > 0) return { erro: 'Cupom exclusivo para a primeira compra.' } as const;
  } else if (cupom.primeiraCompra) {
    return { cupom, desconto: 0, freteGratis: false, pendente: 'Entre na sua conta para validar este cupom.' } as const;
  }
  const desconto = cupom.tipo === 'PERCENTUAL' ? Math.round((subtotal * Math.min(cupom.valor, 100)) / 100) : cupom.tipo === 'VALOR_FIXO' ? Math.min(cupom.valor, subtotal) : 0;
  return { cupom, desconto, freteGratis: cupom.tipo === 'FRETE_GRATIS' } as const;
}

/** Calcula linhas e totais do carrinho com promoções, cupom e pontos. Preço sempre do servidor. */
export async function resumir(carrinho: CarrinhoCompleto | null, opcoes: { frete?: number; pontos?: number; usuarioId?: string | null; saldoPontos?: number } = {}) {
  const itens = carrinho?.itens.filter((i) => i.produto.ativo) ?? [];
  const [promos, disp] = await Promise.all([promocoesAtivas(), disponibilidade(itens.map((i) => i.produtoId))]);

  const linhas: LinhaCarrinho[] = itens.map((i) => {
    const p = i.produto;
    const oferta = calcularOferta({ id: p.id, preco: p.preco, precoDe: p.precoDe, categoriaId: p.categoriaId, marcaId: p.marcaId, categoriaPaiId: p.categoria.paiId }, promos);
    const totalBruto = oferta.preco * i.quantidade;
    const dLp = descontoLevePague(oferta, i.quantidade);
    const d = disp.get(p.id) ?? 0;
    return {
      produtoId: p.id, nome: p.nome, slug: p.slug, icone: p.icone, imagemId: p.imagens[0]?.id ?? null, marca: p.marca.nome, sku: p.sku, classificacao: p.classificacao,
      quantidade: i.quantidade, oferta, precoBase: p.preco, totalBruto, descontoLevePague: dLp, total: totalBruto - dLp,
      disponivel: d, exigeReceita: REGRAS[p.classificacao].exigeReceita,
      aviso: d < i.quantidade ? (d ? `Só restam ${d} unidade(s)` : 'Esgotado') : undefined,
    };
  });

  const subtotal = linhas.reduce((s, l) => s + l.totalBruto, 0);
  const descontoPromocoes = linhas.reduce((s, l) => s + l.descontoLevePague, 0);
  const economiaVitrine = linhas.reduce((s, l) => s + (l.oferta.precoDe ? (l.oferta.precoDe - l.oferta.preco) * l.quantidade : 0), 0);
  const aposPromo = subtotal - descontoPromocoes;

  let descontoCupom = 0;
  let freteGratis = false;
  let erroCupom: string | null = null;
  let cupomId: string | null = null;
  if (carrinho?.cupomCodigo && linhas.length) {
    const r = await avaliarCupom(carrinho.cupomCodigo, aposPromo, opcoes.usuarioId ?? null);
    if ('erro' in r) erroCupom = r.erro ?? null;
    else { descontoCupom = r.desconto; freteGratis = r.freteGratis; cupomId = r.cupom.id; if ('pendente' in r) erroCupom = r.pendente ?? null; }
  }

  // Pontos: múltiplos de 100, até 30% do valor após descontos
  const f = config.fidelidade;
  const base = aposPromo - descontoCupom;
  const maxPontos = Math.floor(Math.min(opcoes.saldoPontos ?? 0, (base * 0.3) / f.centavosPorPonto) / 100) * 100;
  const pontosUsados = Math.min(Math.floor((opcoes.pontos ?? 0) / 100) * 100, maxPontos);
  const descontoPontos = pontosUsados * f.centavosPorPonto;

  const frete = freteGratis ? 0 : opcoes.frete ?? 0;
  const total = Math.max(0, base - descontoPontos + frete);

  return {
    linhas, subtotal, descontoPromocoes, descontoCupom, descontoPontos, pontosUsados, maxPontos, frete, freteGratis, total,
    economia: economiaVitrine + descontoPromocoes + descontoCupom + descontoPontos,
    cupomCodigo: carrinho?.cupomCodigo ?? null, cupomId, erroCupom,
    exigeReceita: linhas.some((l) => l.exigeReceita),
    quantidadeItens: linhas.reduce((s, l) => s + l.quantidade, 0),
    temIndisponivel: linhas.some((l) => l.disponivel < l.quantidade),
    pontosAGanhar: Math.floor(Math.max(0, base - descontoPontos) / 100) * f.pontosPorReal,
  };
}

export type ResumoCarrinho = Awaited<ReturnType<typeof resumir>>;
