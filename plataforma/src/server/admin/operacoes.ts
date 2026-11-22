import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { ErroNegocio } from '../erros';
import { auditar } from '../auditoria';
import { reservar, baixar, entrada } from '../estoque';
import { registrarPresencial } from '../pagamentos';
import { calcularOferta, descontoLevePague, promocoesAtivas } from '../precos';
import { indiceCpf } from '../cripto';
import { config } from '../config';
import { REGRAS, nivelFidelidade } from '@/lib/dominio';
import type { UsuarioSessao } from '../auth';
import type { MetodoPagamento } from '@/generated/prisma/enums';

// ─────────────── Compras ───────────────

/** Sugestão de compra: itens abaixo do mínimo na loja, com quantidade para cobrir 2x o mínimo. */
export async function sugestaoReposicao(lojaId: string) {
  const linhas = await db.$queryRaw<{ id: string; nome: string; sku: string; estoqueMinimo: number; custo: number | null; disp: bigint; vendidos30: bigint }[]>`
    SELECT p.id, p.nome, p.sku, p."estoqueMinimo", p.custo,
      COALESCE((SELECT SUM(l.quantidade - l.reservado) FROM "Lote" l WHERE l."produtoId" = p.id AND l."lojaId" = ${lojaId} AND l.validade > now()), 0) AS disp,
      COALESCE((SELECT SUM(i.quantidade) FROM "PedidoItem" i JOIN "Pedido" pe ON pe.id = i."pedidoId" WHERE i."produtoId" = p.id AND pe."lojaId" = ${lojaId} AND pe."criadoEm" > now() - interval '30 days' AND pe.status <> 'CANCELADO'), 0) AS vendidos30
    FROM "Produto" p WHERE p.ativo ORDER BY p.nome`;
  return linhas
    .map((l) => ({ ...l, disp: Number(l.disp), vendidos30: Number(l.vendidos30) }))
    .filter((l) => l.disp < l.estoqueMinimo)
    .map((l) => ({ produtoId: l.id, nome: l.nome, sku: l.sku, disponivel: l.disp, minimo: l.estoqueMinimo, vendidos30: l.vendidos30, sugerido: Math.max(l.estoqueMinimo * 2 - l.disp, l.vendidos30 - l.disp, 1), custo: l.custo ?? 0 }));
}

export async function criarCompra(u: UsuarioSessao, d: { fornecedorId: string; lojaId: string; observacao?: string; itens: { produtoId: string; quantidade: number; custoUnitario: number }[] }) {
  const itens = d.itens.filter((i) => i.quantidade > 0);
  if (!itens.length) throw new ErroNegocio('Adicione ao menos um item.');
  if (itens.some((i) => i.custoUnitario <= 0)) throw new ErroNegocio('Informe o custo unitário de todos os itens.');
  const c = await db.pedidoCompra.create({
    data: { fornecedorId: d.fornecedorId, lojaId: d.lojaId, observacao: d.observacao, criadoPorId: u.id, total: itens.reduce((s, i) => s + i.quantidade * i.custoUnitario, 0), itens: { create: itens } },
  });
  await auditar('compra.criada', { usuarioId: u.id, alvo: c.id, detalhes: { numero: c.numero, total: c.total } });
  return c;
}

export async function enviarCompra(u: UsuarioSessao, id: string) {
  const r = await db.pedidoCompra.updateMany({ where: { id, status: 'RASCUNHO' }, data: { status: 'ENVIADO', enviadoEm: new Date() } });
  if (!r.count) throw new ErroNegocio('Só é possível enviar pedidos em rascunho.');
  await auditar('compra.enviada', { usuarioId: u.id, alvo: id });
}

/** Recebimento: confere NF, lança cada item como lote (com validade) e atualiza custo médio. */
export async function receberCompra(u: UsuarioSessao, id: string, notaFiscal: string, lotes: { itemId: string; codigo: string; validade: Date; quantidade: number }[]) {
  await db.$transaction(async (tx) => {
    const c = await tx.pedidoCompra.findUnique({ where: { id }, include: { itens: true } });
    if (!c) throw new ErroNegocio('Pedido de compra não encontrado.', 404);
    if (c.status !== 'ENVIADO') throw new ErroNegocio('Só é possível receber pedidos enviados ao fornecedor.');
    if (!notaFiscal.trim()) throw new ErroNegocio('Informe o número da nota fiscal.');
    for (const item of c.itens) {
      const l = lotes.find((x) => x.itemId === item.id);
      if (!l || !l.codigo.trim()) throw new ErroNegocio('Informe o lote e a validade de todos os itens.');
      if (l.quantidade <= 0) continue;
      await entrada(tx, { lojaId: c.lojaId, produtoId: item.produtoId, codigo: l.codigo.trim().toUpperCase(), validade: l.validade, quantidade: l.quantidade, custoUnit: item.custoUnitario, usuarioId: u.id, compraId: c.id, motivo: `Compra #${c.numero} · NF ${notaFiscal}` });
    }
    await tx.pedidoCompra.update({ where: { id }, data: { status: 'RECEBIDO', recebidoEm: new Date(), notaFiscal: notaFiscal.trim() } });
    await auditar('compra.recebida', { usuarioId: u.id, alvo: id, detalhes: { nf: notaFiscal } }, tx);
  }, { timeout: 20_000 });
}

// ─────────────── Caixa ───────────────

export async function caixaAberto(operadorId: string) {
  return db.caixaSessao.findFirst({ where: { operadorId, status: 'ABERTO' }, include: { movimentos: { orderBy: { criadoEm: 'desc' } }, loja: true } });
}

export async function abrirCaixa(u: UsuarioSessao, valorAbertura: number) {
  if (!u.lojaId) throw new ErroNegocio('Seu usuário não está vinculado a uma loja.');
  if (await caixaAberto(u.id)) throw new ErroNegocio('Você já tem um caixa aberto.');
  const c = await db.caixaSessao.create({ data: { lojaId: u.lojaId, operadorId: u.id, valorAbertura } });
  await auditar('caixa.aberto', { usuarioId: u.id, alvo: c.id, detalhes: { valorAbertura } });
  return c;
}

export async function movimentarCaixa(u: UsuarioSessao, tipo: 'SANGRIA' | 'SUPRIMENTO', valor: number, descricao: string) {
  const c = await caixaAberto(u.id);
  if (!c) throw new ErroNegocio('Abra o caixa primeiro.');
  if (valor <= 0) throw new ErroNegocio('Valor inválido.');
  await db.caixaMovimento.create({ data: { caixaId: c.id, tipo, metodo: 'DINHEIRO', valor, descricao: descricao || (tipo === 'SANGRIA' ? 'Sangria' : 'Suprimento') } });
  await auditar(`caixa.${tipo.toLowerCase()}`, { usuarioId: u.id, alvo: c.id, detalhes: { valor } });
}

export function resumoCaixa(c: { valorAbertura: number; movimentos: { tipo: string; metodo: MetodoPagamento | null; valor: number }[] }) {
  const porMetodo: Record<string, number> = {};
  let dinheiro = c.valorAbertura;
  for (const m of c.movimentos) {
    if (m.tipo === 'VENDA') porMetodo[m.metodo ?? 'DINHEIRO'] = (porMetodo[m.metodo ?? 'DINHEIRO'] ?? 0) + m.valor;
    if (m.metodo === 'DINHEIRO' || m.tipo !== 'VENDA') dinheiro += m.tipo === 'SANGRIA' ? -m.valor : m.valor;
  }
  return { porMetodo, dinheiroEsperado: dinheiro, totalVendas: Object.values(porMetodo).reduce((s, v) => s + v, 0) };
}

export async function fecharCaixa(u: UsuarioSessao, valorInformado: number) {
  const c = await caixaAberto(u.id);
  if (!c) throw new ErroNegocio('Nenhum caixa aberto.');
  const r = resumoCaixa(c);
  await db.caixaSessao.update({ where: { id: c.id }, data: { status: 'FECHADO', fechadoEm: new Date(), valorInformado, valorEsperado: r.dinheiroEsperado, diferenca: valorInformado - r.dinheiroEsperado } });
  await auditar('caixa.fechado', { usuarioId: u.id, alvo: c.id, detalhes: { esperado: r.dinheiroEsperado, informado: valorInformado } });
  return { ...r, diferenca: valorInformado - r.dinheiroEsperado };
}

// ─────────────── PDV ───────────────

export type ItemPdv = { produtoId: string; quantidade: number };

/**
 * Venda no balcão: preço com promoções vigentes, baixa imediata FEFO, pagamento presencial,
 * pontos para cliente identificado por CPF e escrituração de antimicrobianos/controlados.
 * Itens com prescrição exigem farmacêutico operando ou confirmação da receita conferida.
 */
export async function venderBalcao(u: UsuarioSessao, d: { itens: ItemPdv[]; metodo: MetodoPagamento; valorRecebido?: number; cpf?: string; receitaConferida?: boolean; registroPrescritor?: string }) {
  const caixa = await caixaAberto(u.id);
  if (!caixa) throw new ErroNegocio('Abra o caixa antes de vender.');
  if (!d.itens.length) throw new ErroNegocio('Adicione produtos à venda.');
  const produtos = await db.produto.findMany({ where: { id: { in: d.itens.map((i) => i.produtoId) }, ativo: true }, include: { categoria: { select: { paiId: true } } } });
  if (produtos.length !== new Set(d.itens.map((i) => i.produtoId)).size) throw new ErroNegocio('Produto inválido ou inativo na venda.');

  const precisaReceita = produtos.some((p) => REGRAS[p.classificacao].exigeReceita);
  const precisaEscrit = produtos.some((p) => REGRAS[p.classificacao].escrituracao);
  if (precisaReceita && !d.receitaConferida) throw new ErroNegocio('Há medicamento sob prescrição: confirme que a receita foi conferida.');
  if (precisaEscrit && u.papel !== 'FARMACEUTICO') throw new ErroNegocio('Antimicrobianos e controlados só podem ser dispensados por farmacêutico (escrituração SNGPC).');
  if (precisaEscrit && !/^(CRM|CRO|CRMV)[-\s]?[A-Z]{2}\s?\d{3,7}$/i.test(d.registroPrescritor ?? '')) throw new ErroNegocio('Informe o CRM do prescritor (ex.: CRM-SP 123456) para a escrituração.');

  let cliente: { id: string; nome: string } | null = null;
  if (d.cpf) {
    cliente = await db.usuario.findUnique({ where: { cpfHash: indiceCpf(d.cpf) }, select: { id: true, nome: true } });
  }

  const promos = await promocoesAtivas();
  const linhas = d.itens.map((i) => {
    const p = produtos.find((x) => x.id === i.produtoId)!;
    const oferta = calcularOferta({ id: p.id, preco: p.preco, precoDe: p.precoDe, categoriaId: p.categoriaId, marcaId: p.marcaId, categoriaPaiId: p.categoria.paiId }, promos);
    const desc = descontoLevePague(oferta, i.quantidade);
    return { p, quantidade: i.quantidade, preco: oferta.preco, desconto: desc, total: oferta.preco * i.quantidade - desc };
  });
  const subtotal = linhas.reduce((s, l) => s + l.preco * l.quantidade, 0);
  const descontoPromocoes = linhas.reduce((s, l) => s + l.desconto, 0);
  const total = subtotal - descontoPromocoes;

  const pedido = await db.$transaction(async (tx) => {
    const ped = await tx.pedido.create({
      data: {
        usuarioId: cliente?.id ?? null, lojaId: caixa.lojaId, canal: 'PDV', status: 'ENTREGUE', modalidade: 'BALCAO', subtotal, descontoPromocoes, total,
        metodoPagamento: d.metodo, operadorId: u.id, caixaId: caixa.id, clienteNome: cliente?.nome ?? 'Consumidor', cpfNaNota: d.cpf ? `***${d.cpf.slice(-4)}` : null,
      },
    });
    const aloc = await reservar(tx, caixa.lojaId, linhas.map((l) => ({ produtoId: l.p.id, quantidade: l.quantidade, nome: l.p.nome })), { pedidoId: ped.id, usuarioId: u.id });
    const itens = linhas.map((l) => ({ produtoId: l.p.id, alocacoes: (aloc.get(l.p.id) ?? []) as unknown as Prisma.InputJsonValue }));
    await tx.pedidoItem.createMany({
      data: linhas.map((l, k) => ({ pedidoId: ped.id, produtoId: l.p.id, nome: l.p.nome, sku: l.p.sku, classificacao: l.p.classificacao, quantidade: l.quantidade, precoUnitario: l.preco, desconto: l.desconto, total: l.total, custoUnitario: l.p.custo, alocacoes: itens[k].alocacoes })),
    });
    await baixar(tx, caixa.lojaId, itens, { pedidoId: ped.id, usuarioId: u.id });
    for (const l of linhas.filter((x) => REGRAS[x.p.classificacao].escrituracao)) {
      await tx.escrituracao.create({
        data: { pedidoId: ped.id, produtoId: l.p.id, lojaId: caixa.lojaId, registroAnvisa: l.p.registroAnvisa, principioAtivo: l.p.principioAtivo, quantidade: l.quantidade, lotes: aloc.get(l.p.id) as unknown as Prisma.InputJsonValue, registroPrescritor: d.registroPrescritor?.toUpperCase(), farmaceuticoId: u.id, crfFarmaceutico: u.crf ?? '—' },
      });
    }
    for (const l of linhas) await tx.produto.update({ where: { id: l.p.id }, data: { vendas: { increment: l.quantidade } } });
    const pg = await registrarPresencial(tx, ped, d.metodo, d.valorRecebido);
    await tx.caixaMovimento.create({ data: { caixaId: caixa.id, tipo: 'VENDA', metodo: d.metodo, valor: total, descricao: `Venda #${ped.numero}`, pedidoId: ped.id } });
    await tx.pedidoEvento.create({ data: { pedidoId: ped.id, status: 'ENTREGUE', descricao: `Venda no balcão (${caixa.loja.nome})`, usuarioId: u.id } });
    if (cliente) {
      const gasto = await tx.pedido.aggregate({ where: { usuarioId: cliente.id, status: 'ENTREGUE', criadoEm: { gte: new Date(Date.now() - 365 * 86_400_000) } }, _sum: { total: true } });
      const pontos = Math.floor((total / 100) * nivelFidelidade(gasto._sum.total ?? 0).multiplicador);
      if (pontos > 0) {
        const expiraEm = new Date(); expiraEm.setMonth(expiraEm.getMonth() + config.fidelidade.validadeMeses);
        await tx.usuario.update({ where: { id: cliente.id }, data: { pontos: { increment: pontos } } });
        await tx.movimentoPontos.create({ data: { usuarioId: cliente.id, pedidoId: ped.id, pontos, descricao: `Compra na loja #${ped.numero}`, expiraEm } });
        await tx.pedido.update({ where: { id: ped.id }, data: { pontosGanhos: pontos } });
      }
    }
    await auditar('pdv.venda', { usuarioId: u.id, alvo: ped.id, detalhes: { numero: ped.numero, total, metodo: d.metodo } }, tx);
    return { ...ped, troco: pg.troco };
  }, { timeout: 20_000 });
  return { id: pedido.id, numero: pedido.numero, total, troco: pedido.troco ?? 0, cliente: cliente?.nome ?? null };
}
