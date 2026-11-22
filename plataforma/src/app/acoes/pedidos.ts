'use server';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/server/db';
import { executar, ErroNegocio } from '@/server/erros';
import { exigirUsuario, ipAtual, limitarTaxa } from '@/server/auth';
import { carrinhoAtual } from '@/server/carrinho';
import { criarPedido, pagarPedido, cancelarPedido, confirmarPix } from '@/server/pedidos';
import { validarDadosPagamento } from '@/server/pagamentos';
import { enviarReceita } from '@/server/receitas';

const checkoutSchema = z.object({
  modalidade: z.enum(['ENTREGA_PADRAO', 'ENTREGA_EXPRESSA', 'RETIRADA']),
  enderecoId: z.string().uuid().optional(),
  lojaId: z.string().uuid().optional(),
  pontos: z.coerce.number().int().min(0).max(1_000_000).optional(),
  observacao: z.string().max(300).optional(),
  pagamento: z.unknown().optional(),
});

export async function finalizarPedido(entrada: unknown) {
  const r = await executar(async () => {
    const u = await exigirUsuario();
    limitarTaxa(`checkout:${u.id}`, 10, 10 * 60_000);
    const d = checkoutSchema.parse(entrada);
    const carrinho = await carrinhoAtual();
    if (!carrinho) throw new ErroNegocio('Seu carrinho está vazio.');
    const pagamento = d.pagamento ? validarDadosPagamento(d.pagamento) : undefined;
    const { pedido, pagamento: pg } = await criarPedido(u, carrinho, { ...d, pagamento }, await ipAtual());
    return { numero: pedido.numero, recusado: pg?.status === 'RECUSADO' };
  });
  if (!r.ok) return r;
  redirect(`/pedido/${r.dados!.numero}?novo=1${r.dados!.recusado ? '&recusado=1' : ''}`);
}

export async function pagarAcao(pedidoId: string, dados: unknown) {
  return executar(async () => {
    const u = await exigirUsuario();
    limitarTaxa(`pagar:${u.id}`, 10, 10 * 60_000);
    const pg = await pagarPedido(u, z.string().uuid().parse(pedidoId), validarDadosPagamento(dados), await ipAtual());
    refresh();
    if (pg.status === 'RECUSADO') throw new ErroNegocio(pg.motivoRecusa ?? 'Pagamento recusado.');
    return pg.status;
  });
}

export async function enviarReceitaAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    limitarTaxa(`receita:${u.id}`, 10, 60 * 60_000);
    const arquivo = form.get('arquivo');
    if (!(arquivo instanceof File)) throw new ErroNegocio('Anexe o arquivo da receita.');
    await enviarReceita(u, z.string().uuid().parse(form.get('pedidoId')), arquivo, {
      prescritor: String(form.get('prescritor') ?? ''), registro: String(form.get('registro') ?? ''), dataEmissao: String(form.get('dataEmissao') ?? ''),
    }, await ipAtual());
    refresh();
  }, 'Receita enviada! Você será avisado quando o farmacêutico aprovar.');
}

export async function cancelarPedidoAcao(pedidoId: string) {
  return executar(async () => {
    const u = await exigirUsuario();
    await cancelarPedido(z.string().uuid().parse(pedidoId), 'solicitado pelo cliente', { usuario: u }, await ipAtual());
    refresh();
  }, 'Pedido cancelado.');
}

/** Somente fora de produção: simula o banco confirmando o PIX (no real, webhook do PSP). */
export async function simularPixAcao(pagamentoId: string) {
  return executar(async () => {
    const { pagamentosSimulados } = await import('@/server/integracoes');
    if (!pagamentosSimulados()) throw new ErroNegocio('Indisponível em produção.', 404);
    const u = await exigirUsuario();
    const pg = await db.pagamento.findFirst({ where: { id: z.string().uuid().parse(pagamentoId), pedido: { usuarioId: u.id } } });
    if (!pg) throw new ErroNegocio('Pagamento não encontrado.', 404);
    await confirmarPix(pg.id, 'simulador');
    refresh();
  }, 'PIX confirmado!');
}

/** Recompra: coloca de volta no carrinho os itens de um pedido anterior. */
export async function comprarNovamente(pedidoId: string) {
  const r = await executar(async () => {
    const u = await exigirUsuario();
    const p = await db.pedido.findFirst({ where: { id: z.string().uuid().parse(pedidoId), usuarioId: u.id }, include: { itens: true } });
    if (!p) throw new ErroNegocio('Pedido não encontrado.', 404);
    const { adicionarItem } = await import('@/server/carrinho');
    const falhas: string[] = [];
    for (const i of p.itens) {
      try { await adicionarItem(i.produtoId, i.quantidade); } catch { falhas.push(i.nome); }
    }
    return falhas;
  });
  if (!r.ok) return r;
  redirect(`/carrinho${r.dados?.length ? `?indisponiveis=${r.dados.length}` : ''}`);
}

const simulacaoSchema = z.object({
  modalidade: z.enum(['ENTREGA_PADRAO', 'ENTREGA_EXPRESSA', 'RETIRADA']).optional(),
  enderecoId: z.string().uuid().optional(),
  lojaId: z.string().uuid().optional(),
  pontos: z.coerce.number().int().min(0).optional(),
});

/** Opções de entrega e totais calculados no servidor para o estado atual do checkout. */
export async function simularCheckout(entrada: unknown) {
  return executar(async () => {
    const u = await exigirUsuario();
    const d = simulacaoSchema.parse(entrada);
    const { resumir } = await import('@/server/carrinho');
    const { cotar } = await import('@/server/frete');
    const carrinho = await carrinhoAtual();
    if (!carrinho?.itens.length) throw new ErroNegocio('Seu carrinho está vazio.');
    const end = d.enderecoId ? await db.endereco.findFirst({ where: { id: d.enderecoId, usuarioId: u.id } }) : null;
    const saldo = (await db.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { pontos: true } })).pontos;
    const base = await resumir(carrinho, { usuarioId: u.id });
    const cot = await cotar(end?.cep ?? null, base.subtotal - base.descontoPromocoes - base.descontoCupom, carrinho.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })));
    const opcao = d.modalidade === 'RETIRADA' ? cot.retiradas.find((r) => r.lojaId === d.lojaId) : cot.entregas.find((e) => e.modalidade === d.modalidade && e.disponivel);
    const r = await resumir(carrinho, { usuarioId: u.id, frete: opcao?.preco ?? 0, pontos: d.pontos ?? 0, saldoPontos: saldo });
    const fmt = (o: (typeof cot.entregas)[number]) => ({ modalidade: o.modalidade, rotulo: o.rotulo, prazo: o.prazo, preco: r.freteGratis ? 0 : o.preco, disponivel: o.disponivel, motivo: o.motivo ?? null, lojaId: o.lojaId, lojaNome: o.lojaNome });
    return {
      entregas: cot.entregas.map(fmt), retiradas: cot.retiradas.map(fmt), saldoPontos: saldo,
      totais: { subtotal: r.subtotal, descontoPromocoes: r.descontoPromocoes, descontoCupom: r.descontoCupom, descontoPontos: r.descontoPontos, pontosUsados: r.pontosUsados, maxPontos: r.maxPontos, frete: r.frete, total: r.total, pontosAGanhar: r.pontosAGanhar, exigeReceita: r.exigeReceita, freteGratis: r.freteGratis },
      opcaoValida: !!opcao?.disponivel,
    };
  });
}
