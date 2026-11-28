import 'server-only';
import { db } from '../db';
import { ErroNegocio } from '../erros';
import { auditar } from '../auditoria';
import { precificarItens, criarCompra, lojaDoCaixa, type ItemPdv } from './operacoes';
import { EQUIPE } from '@/lib/dominio';
import type { UsuarioSessao } from '../auth';

// ─────────────── Orçamento e pré-venda ───────────────

export type ItemOrcamento = { produtoId: string; nome: string; quantidade: number; preco: number; desconto: number; total: number };

/** Salva o carrinho do balcão como orçamento (para o cliente) ou pré-venda (o caixa finaliza pelo número). */
export async function salvarOrcamento(u: UsuarioSessao, d: { tipo: 'ORCAMENTO' | 'PRE_VENDA'; itens: ItemPdv[]; clienteNome?: string; telefone?: string; observacao?: string; validadeDias?: number }) {
  const lojaId = await lojaDoCaixa(u);
  if (!lojaId) throw new ErroNegocio('Seu usuário não está vinculado a uma loja.');
  if (!d.itens.length) throw new ErroNegocio('Adicione produtos.');
  const { linhas, total } = await precificarItens(d.itens);
  const itens: ItemOrcamento[] = linhas.map((l) => ({ produtoId: l.p.id, nome: l.p.nome, quantidade: l.quantidade, preco: l.preco, desconto: l.desconto, total: l.total }));
  const dias = d.tipo === 'PRE_VENDA' ? 1 : Math.min(Math.max(d.validadeDias ?? 7, 1), 30);
  const o = await db.orcamento.create({
    data: { tipo: d.tipo, lojaId, vendedorId: u.id, clienteNome: d.clienteNome || null, telefone: d.telefone || null, observacao: d.observacao || null, itens, total, validoAte: new Date(Date.now() + dias * 86_400_000) },
  });
  await auditar(d.tipo === 'PRE_VENDA' ? 'prevenda.criada' : 'orcamento.criado', { usuarioId: u.id, alvo: o.id, detalhes: { numero: o.numero, total } });
  return { id: o.id, numero: o.numero, total };
}

/** Carrega pré-venda/orçamento aberto pelo número para o caixa finalizar. */
export async function carregarOrcamento(u: UsuarioSessao, numero: number) {
  const o = await db.orcamento.findUnique({ where: { numero } });
  if (!o || (u.lojaId && o.lojaId !== u.lojaId && u.papel !== 'ADMIN')) throw new ErroNegocio(`Pré-venda nº ${numero} não encontrada.`, 404);
  if (o.status !== 'ABERTO') throw new ErroNegocio(`A pré-venda nº ${numero} já foi ${o.status === 'CONVERTIDO' ? 'finalizada' : 'cancelada'}.`);
  if (o.validoAte < new Date()) throw new ErroNegocio(`O ${o.tipo === 'ORCAMENTO' ? 'orçamento' : 'pré-venda'} nº ${numero} venceu. Monte de novo para conferir os preços.`);
  const itens = o.itens as ItemOrcamento[];
  const prods = await db.produto.findMany({
    where: { id: { in: itens.map((i) => i.produtoId) }, ativo: true },
    select: { id: true, nome: true, preco: true, icone: true, classificacao: true, ean: true, lotes: { where: { lojaId: o.lojaId, validade: { gt: new Date() } }, select: { quantidade: true, reservado: true } } },
  });
  return {
    id: o.id, numero: o.numero, vendedorId: o.vendedorId, clienteNome: o.clienteNome,
    itens: itens.flatMap((i) => {
      const p = prods.find((x) => x.id === i.produtoId);
      if (!p) return [];
      const { lotes, ...resto } = p;
      return [{ ...resto, quantidade: i.quantidade, disponivel: lotes.reduce((s, l) => s + l.quantidade - l.reservado, 0) }];
    }),
  };
}

export async function cancelarOrcamento(u: UsuarioSessao, id: string) {
  const r = await db.orcamento.updateMany({ where: { id, status: 'ABERTO' }, data: { status: 'CANCELADO' } });
  if (!r.count) throw new ErroNegocio('Só é possível cancelar orçamentos em aberto.');
  await auditar('orcamento.cancelado', { usuarioId: u.id, alvo: id });
}

// ─────────────── Inventário (balanço) ───────────────

/** Abre um inventário: fotografa todos os lotes com saldo da loja (opcionalmente de uma categoria). */
export async function abrirInventario(u: UsuarioSessao, d: { lojaId: string; descricao: string; categoriaId?: string | null }) {
  if (await db.inventario.count({ where: { lojaId: d.lojaId, status: 'ABERTO' } })) throw new ErroNegocio('Já existe um inventário aberto nesta loja. Feche ou cancele antes de abrir outro.');
  const lotes = await db.lote.findMany({
    where: { lojaId: d.lojaId, quantidade: { gt: 0 }, ...(d.categoriaId ? { produto: { OR: [{ categoriaId: d.categoriaId }, { categoria: { paiId: d.categoriaId } }] } } : {}) },
    include: { produto: { select: { nome: true } } },
    orderBy: [{ produto: { nome: 'asc' } }, { validade: 'asc' }],
  });
  if (!lotes.length) throw new ErroNegocio('Nenhum lote com saldo para inventariar.');
  const inv = await db.inventario.create({
    data: {
      lojaId: d.lojaId, descricao: d.descricao, criadoPorId: u.id,
      itens: { create: lotes.map((l) => ({ produtoId: l.produtoId, loteId: l.id, produtoNome: l.produto.nome, loteCodigo: l.codigo, validade: l.validade, esperado: l.quantidade })) },
    },
  });
  await auditar('inventario.aberto', { usuarioId: u.id, alvo: inv.id, detalhes: { numero: inv.numero, lotes: lotes.length } });
  return inv;
}

export async function salvarContagem(u: UsuarioSessao, inventarioId: string, contagens: { itemId: string; contado: number | null }[]) {
  const inv = await db.inventario.findUnique({ where: { id: inventarioId } });
  if (!inv || inv.status !== 'ABERTO') throw new ErroNegocio('Inventário não está aberto.');
  await db.$transaction(contagens.map((c) => db.inventarioItem.updateMany({ where: { id: c.itemId, inventarioId }, data: { contado: c.contado } })));
}

/**
 * Fecha o inventário: a diferença (contado − esperado) vira ajuste no lote. Movimentos que
 * aconteceram durante a contagem continuam valendo (o ajuste é pela diferença, não pelo total).
 */
export async function fecharInventario(u: UsuarioSessao, inventarioId: string, zerarNaoContados: boolean) {
  const r = await db.$transaction(async (tx) => {
    const inv = await tx.inventario.findUnique({ where: { id: inventarioId }, include: { itens: true } });
    if (!inv || inv.status !== 'ABERTO') throw new ErroNegocio('Inventário não está aberto.');
    let ajustes = 0, sobra = 0, falta = 0;
    for (const it of inv.itens) {
      const contado = it.contado ?? (zerarNaoContados ? 0 : null);
      if (contado == null) continue;
      const delta = contado - it.esperado;
      if (!delta) continue;
      const [l] = await tx.$queryRaw<{ id: string; quantidade: number; reservado: number }[]>`SELECT id, quantidade, reservado FROM "Lote" WHERE id = ${it.loteId} FOR UPDATE`;
      if (!l) continue;
      const novo = l.quantidade + delta;
      if (novo < l.reservado) throw new ErroNegocio(`${it.produtoNome} (lote ${it.loteCodigo}): a contagem deixaria o lote abaixo do reservado para pedidos (${l.reservado} un.). Separe esses pedidos e feche de novo.`);
      if (novo < 0) throw new ErroNegocio(`${it.produtoNome} (lote ${it.loteCodigo}) ficaria negativo. Confira a contagem.`);
      await tx.lote.update({ where: { id: l.id }, data: { quantidade: { increment: delta } } });
      await tx.movimentoEstoque.create({ data: { produtoId: it.produtoId, lojaId: inv.lojaId, loteId: l.id, tipo: delta > 0 ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO', quantidade: Math.abs(delta), motivo: `Inventário #${inv.numero}`, usuarioId: u.id } });
      ajustes++; if (delta > 0) sobra += delta; else falta -= delta;
    }
    await tx.inventario.update({ where: { id: inv.id }, data: { status: 'FECHADO', fechadoEm: new Date(), fechadoPorId: u.id } });
    await auditar('inventario.fechado', { usuarioId: u.id, alvo: inv.id, detalhes: { numero: inv.numero, ajustes, sobra, falta } }, tx);
    return { ajustes, sobra, falta };
  }, { timeout: 60_000 });
  return r;
}

export async function cancelarInventario(u: UsuarioSessao, inventarioId: string) {
  const r = await db.inventario.updateMany({ where: { id: inventarioId, status: 'ABERTO' }, data: { status: 'CANCELADO', fechadoEm: new Date(), fechadoPorId: u.id } });
  if (!r.count) throw new ErroNegocio('Inventário não está aberto.');
  await auditar('inventario.cancelado', { usuarioId: u.id, alvo: inventarioId });
}

// ─────────────── Cotação de compras ───────────────

export async function criarCotacao(u: UsuarioSessao, d: { lojaId: string; descricao: string; itens: { produtoId: string; quantidade: number }[] }) {
  const itens = d.itens.filter((i) => i.quantidade > 0);
  const prods = await db.produto.findMany({ where: { id: { in: itens.map((i) => i.produtoId) } }, select: { id: true, nome: true } });
  const c = await db.cotacao.create({
    data: { lojaId: d.lojaId, descricao: d.descricao, criadoPorId: u.id, itens: { create: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, produtoNome: prods.find((p) => p.id === i.produtoId)?.nome ?? '—' })) } },
  });
  await auditar('cotacao.criada', { usuarioId: u.id, alvo: c.id, detalhes: { numero: c.numero, itens: itens.length } });
  return c;
}

/** Grava os preços de um fornecedor (linha da planilha de cotação). Preço vazio remove. */
export async function salvarPrecosFornecedor(cotacaoId: string, fornecedorId: string, precos: { itemId: string; custoUnitario: number | null; prazoDias?: number | null }[]) {
  const c = await db.cotacao.findUnique({ where: { id: cotacaoId }, select: { status: true, itens: { select: { id: true } } } });
  if (!c || c.status !== 'ABERTA') throw new ErroNegocio('Cotação não está aberta.');
  const validos = new Set(c.itens.map((i) => i.id));
  await db.$transaction(precos.filter((p) => validos.has(p.itemId)).map((p) => p.custoUnitario && p.custoUnitario > 0
    ? db.cotacaoPreco.upsert({ where: { itemId_fornecedorId: { itemId: p.itemId, fornecedorId } }, create: { itemId: p.itemId, fornecedorId, custoUnitario: p.custoUnitario, prazoDias: p.prazoDias ?? null }, update: { custoUnitario: p.custoUnitario, prazoDias: p.prazoDias ?? null } })
    : db.cotacaoPreco.deleteMany({ where: { itemId: p.itemId, fornecedorId } })));
}

/** Melhor preço por item (menor custo; empate → menor prazo). */
export function vencedores(itens: { id: string; precos: { fornecedorId: string; custoUnitario: number; prazoDias: number | null }[] }[]) {
  return new Map(itens.map((i) => {
    const melhor = [...i.precos].sort((a, b) => a.custoUnitario - b.custoUnitario || (a.prazoDias ?? 99) - (b.prazoDias ?? 99))[0];
    return [i.id, melhor ?? null] as const;
  }));
}

/** Fecha a cotação gerando um pedido de compra (rascunho) por fornecedor vencedor. */
export async function fecharCotacao(u: UsuarioSessao, cotacaoId: string) {
  const c = await db.cotacao.findUnique({ where: { id: cotacaoId }, include: { itens: { include: { precos: true } } } });
  if (!c || c.status !== 'ABERTA') throw new ErroNegocio('Cotação não está aberta.');
  const melhores = vencedores(c.itens);
  const porFornecedor = new Map<string, { produtoId: string; quantidade: number; custoUnitario: number }[]>();
  const semPreco: string[] = [];
  for (const i of c.itens) {
    const m = melhores.get(i.id);
    if (!m) { semPreco.push(i.produtoNome); continue; }
    porFornecedor.set(m.fornecedorId, [...(porFornecedor.get(m.fornecedorId) ?? []), { produtoId: i.produtoId, quantidade: i.quantidade, custoUnitario: m.custoUnitario }]);
  }
  if (!porFornecedor.size) throw new ErroNegocio('Lance o preço de pelo menos um fornecedor antes de fechar.');
  const compras = [];
  for (const [fornecedorId, itens] of porFornecedor) compras.push(await criarCompra(u, { fornecedorId, lojaId: c.lojaId, observacao: `Gerado da cotação #${c.numero}`, itens }));
  await db.cotacao.update({ where: { id: c.id }, data: { status: 'FECHADA', fechadaEm: new Date() } });
  await auditar('cotacao.fechada', { usuarioId: u.id, alvo: c.id, detalhes: { compras: compras.map((x) => x.numero), semPreco } });
  return { compras: compras.map((x) => x.numero), semPreco };
}

// ─────────────── Comissões ───────────────

/** Vendas por vendedor no período (balcão: vendedor informado ou operador do caixa). */
export async function comissoes(inicio: Date, fim: Date) {
  const linhas = await db.$queryRaw<{ vendedor: string; vendas: bigint; total: bigint }[]>`
    SELECT COALESCE("vendedorId", "operadorId") AS vendedor, COUNT(*) AS vendas, SUM(total) AS total
    FROM "Pedido" WHERE canal = 'PDV' AND status = 'ENTREGUE' AND "criadoEm" >= ${inicio} AND "criadoEm" < ${fim}
      AND COALESCE("vendedorId", "operadorId") IS NOT NULL
    GROUP BY 1`;
  const usuarios = await db.usuario.findMany({ where: { papel: { in: EQUIPE } }, select: { id: true, nome: true, papel: true, ativo: true, comissaoBp: true }, orderBy: { nome: 'asc' } });
  return usuarios.map((u) => {
    const l = linhas.find((x) => x.vendedor === u.id);
    const total = Number(l?.total ?? 0);
    return { ...u, vendas: Number(l?.vendas ?? 0), total, comissao: Math.round((total * u.comissaoBp) / 10_000) };
  }).filter((u) => u.ativo || u.vendas > 0);
}

/** Lança as comissões do período como contas a pagar (uma por vendedor). */
export async function lancarComissoes(u: UsuarioSessao, inicio: Date, fim: Date, rotulo: string) {
  const lista = (await comissoes(inicio, fim)).filter((c) => c.comissao > 0);
  if (!lista.length) throw new ErroNegocio('Nenhuma comissão a lançar neste período.');
  const ja = await db.lancamento.count({ where: { origem: 'comissao', documento: rotulo, status: { not: 'CANCELADO' } } });
  if (ja) throw new ErroNegocio(`As comissões de ${rotulo} já foram lançadas no financeiro.`);
  const { garantirPlanoPadrao } = await import('../financeiro');
  await garantirPlanoPadrao();
  const cat = await db.categoriaFinanceira.upsert({ where: { nome_tipo: { nome: 'Comissões de vendas', tipo: 'DESPESA' } }, create: { nome: 'Comissões de vendas', tipo: 'DESPESA', grupo: 'PESSOAL' }, update: {} });
  const funcs = await db.funcionario.findMany({ where: { usuarioId: { in: lista.map((c) => c.id) } }, select: { id: true, usuarioId: true } });
  const venc = new Date(fim.getTime() + 5 * 86_400_000);
  await db.lancamento.createMany({
    data: lista.map((c) => ({ tipo: 'DESPESA' as const, descricao: `Comissão ${rotulo} — ${c.nome}`, valor: c.comissao, vencimento: venc, competencia: inicio, categoriaId: cat.id, funcionarioId: funcs.find((f) => f.usuarioId === c.id)?.id ?? null, pessoa: c.nome, documento: rotulo, origem: 'comissao', criadoPor: u.id })),
  });
  await auditar('comissoes.lancadas', { usuarioId: u.id, detalhes: { periodo: rotulo, total: lista.reduce((s, c) => s + c.comissao, 0) } });
  return lista.length;
}
