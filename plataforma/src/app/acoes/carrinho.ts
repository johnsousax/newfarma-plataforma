'use server';
import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/server/db';
import { executar } from '@/server/erros';
import { adicionarItem, garantirCarrinho, avaliarCupom, carrinhoAtual, resumir } from '@/server/carrinho';
import { usuarioAtual, limitarTaxa, ipAtual } from '@/server/auth';
import { cotar, cepValido } from '@/server/frete';
import { ErroNegocio } from '@/server/erros';

const id = z.string().uuid();
const qtd = z.coerce.number().int().min(0).max(20);

export async function adicionarAoCarrinho(produtoId: string, quantidade = 1) {
  return executar(async () => {
    const n = await adicionarItem(id.parse(produtoId), qtd.parse(quantidade));
    refresh();
    return n;
  }, 'Adicionado ao carrinho');
}

export async function alterarQuantidade(produtoId: string, quantidade: number) {
  return executar(async () => {
    await adicionarItem(id.parse(produtoId), qtd.parse(quantidade), true);
    refresh();
  });
}

export async function aplicarCupom(_: unknown, form: FormData) {
  return executar(async () => {
    limitarTaxa(`cupom:${await ipAtual()}`, 15, 10 * 60_000);
    const codigo = z.string().trim().min(3).max(30).parse(String(form.get('codigo') ?? '')).toUpperCase();
    const c = await garantirCarrinho();
    const u = await usuarioAtual();
    const r = await resumir(c, { usuarioId: u?.id });
    const av = await avaliarCupom(codigo, r.subtotal - r.descontoPromocoes, u?.id ?? null);
    if ('erro' in av) throw new ErroNegocio(av.erro ?? 'Cupom inválido.');
    await db.carrinho.update({ where: { id: c.id }, data: { cupomCodigo: codigo } });
    refresh();
  }, 'Cupom aplicado!');
}

export async function removerCupom() {
  return executar(async () => {
    const c = await carrinhoAtual();
    if (c) await db.carrinho.update({ where: { id: c.id }, data: { cupomCodigo: null } });
    refresh();
  });
}

/** Cotação de frete usada na página do produto e no carrinho. */
export async function cotarFrete(cep: string, produtoId?: string) {
  return executar(async () => {
    limitarTaxa(`frete:${await ipAtual()}`, 60, 60_000);
    const limpo = cep.replace(/\D/g, '');
    if (!cepValido(limpo)) throw new ErroNegocio('Digite um CEP válido com 8 dígitos.');
    let itens: { produtoId: string; quantidade: number }[];
    let subtotal = 0;
    if (produtoId) {
      const p = await db.produto.findUnique({ where: { id: id.parse(produtoId) }, select: { id: true, preco: true } });
      if (!p) throw new ErroNegocio('Produto não encontrado.');
      itens = [{ produtoId: p.id, quantidade: 1 }];
      subtotal = p.preco;
    } else {
      const c = await garantirCarrinho();
      itens = c.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade }));
      const r = await resumir(c);
      subtotal = r.subtotal - r.descontoPromocoes;
      await db.carrinho.update({ where: { id: c.id }, data: { cep: limpo } });
    }
    const r = await cotar({ cep: limpo }, subtotal, itens);
    return {
      entregas: r.entregas.map((e) => ({ modalidade: e.modalidade, rotulo: e.rotulo, prazo: e.prazo, preco: e.preco, disponivel: e.disponivel, motivo: e.motivo ?? null, loja: e.lojaNome })),
      retiradas: r.retiradas.filter((x) => x.disponivel).slice(0, 3).map((e) => ({ loja: e.lojaNome, prazo: e.prazo })),
    };
  });
}
