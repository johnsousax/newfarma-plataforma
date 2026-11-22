import 'server-only';
import { db, type Tx } from './db';
import { config } from './config';
import { ErroNegocio } from './erros';
import { auditar } from './auditoria';
import { reservar, liberar, baixar, type Alocacao } from './estoque';
import { cobrar, type DadosPagamento } from './pagamentos';
import { resumir, type CarrinhoCompleto } from './carrinho';
import { cotar } from './frete';
import { REGRAS, STATUS_PEDIDO, nivelFidelidade } from '@/lib/dominio';
import type { UsuarioSessao } from './auth';
import type { Modalidade, StatusPedido } from '@/generated/prisma/enums';
import type { Prisma } from '@/generated/prisma/client';

async function evento(tx: Tx, pedidoId: string, status: StatusPedido, descricao: string, usuarioId?: string | null) {
  await tx.pedidoEvento.create({ data: { pedidoId, status, descricao, usuarioId: usuarioId ?? null } });
}

export type DadosCheckout = {
  modalidade: Modalidade;
  enderecoId?: string;
  lojaId?: string;
  pontos?: number;
  pagamento?: DadosPagamento;
  observacao?: string;
};

/**
 * Fecha o pedido a partir do carrinho. Preço, frete, descontos e a loja que atende são
 * recalculados no servidor — nada do que vem do navegador é confiado.
 */
export async function criarPedido(usuario: UsuarioSessao, carrinho: CarrinhoCompleto, d: DadosCheckout, ip: string) {
  if (!carrinho.itens.length) throw new ErroNegocio('Seu carrinho está vazio.');
  for (const i of carrinho.itens) {
    if (!i.produto.ativo) throw new ErroNegocio(`"${i.produto.nome}" não está mais disponível. Remova-o do carrinho.`);
    if (!REGRAS[i.produto.classificacao].vendaRemota) throw new ErroNegocio(`"${i.produto.nome}" é controlado e não pode ser vendido pela internet.`);
  }

  let endereco: Prisma.InputJsonValue | undefined;
  let cep: string | null = null;
  if (d.modalidade !== 'RETIRADA') {
    const e = d.enderecoId ? await db.endereco.findFirst({ where: { id: d.enderecoId, usuarioId: usuario.id } }) : null;
    if (!e) throw new ErroNegocio('Escolha um endereço de entrega.');
    cep = e.cep;
    endereco = { apelido: e.apelido, destinatario: e.destinatario, cep: e.cep, logradouro: e.logradouro, numero: e.numero, complemento: e.complemento, bairro: e.bairro, cidade: e.cidade, uf: e.uf };
  }

  const itensQtd = carrinho.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade }));
  const previo = await resumir(carrinho, { usuarioId: usuario.id });
  const cotacao = await cotar(cep, previo.subtotal - previo.descontoPromocoes - previo.descontoCupom, itensQtd);
  const opcao = d.modalidade === 'RETIRADA'
    ? cotacao.retiradas.find((r) => r.lojaId === d.lojaId)
    : cotacao.entregas.find((e) => e.modalidade === d.modalidade);
  if (!opcao) throw new ErroNegocio('Escolha como deseja receber o pedido.');
  if (!opcao.disponivel) throw new ErroNegocio(opcao.motivo ?? 'Opção de entrega indisponível.');

  const saldo = await db.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { pontos: true } });
  const r = await resumir(carrinho, { usuarioId: usuario.id, frete: opcao.preco, pontos: d.pontos ?? 0, saldoPontos: saldo.pontos });
  if (r.temIndisponivel) throw new ErroNegocio('Alguns itens ficaram sem estoque. Revise o carrinho.');
  if (r.erroCupom && r.cupomCodigo) throw new ErroNegocio(`Cupom ${r.cupomCodigo}: ${r.erroCupom}`);
  if (!r.exigeReceita && !d.pagamento) throw new ErroNegocio('Escolha uma forma de pagamento.');

  const statusInicial: StatusPedido = r.exigeReceita ? 'AGUARDANDO_RECEITA' : 'AGUARDANDO_PAGAMENTO';

  const resultado = await db.$transaction(async (tx) => {
    const pedido = await tx.pedido.create({
      data: {
        usuarioId: usuario.id, lojaId: opcao.lojaId, canal: 'SITE', status: statusInicial, modalidade: d.modalidade, enderecoEntrega: endereco,
        subtotal: r.subtotal, descontoPromocoes: r.descontoPromocoes, descontoCupom: r.descontoCupom, descontoPontos: r.descontoPontos,
        frete: r.frete, total: r.total, cupomId: r.cupomId, pontosUsados: r.pontosUsados, previsaoEntrega: opcao.previsao,
        observacao: d.observacao?.slice(0, 300) || null, clienteNome: usuario.nome,
        metodoPagamento: d.pagamento?.metodo ?? null,
      },
    });
    const aloc = await reservar(tx, opcao.lojaId, r.linhas.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade, nome: l.nome })), { pedidoId: pedido.id, usuarioId: usuario.id });
    const custos = new Map((await tx.produto.findMany({ where: { id: { in: r.linhas.map((l) => l.produtoId) } }, select: { id: true, custo: true } })).map((p) => [p.id, p.custo]));
    await tx.pedidoItem.createMany({
      data: r.linhas.map((l) => ({
        pedidoId: pedido.id, produtoId: l.produtoId, nome: l.nome, sku: l.sku, classificacao: l.classificacao, quantidade: l.quantidade,
        precoUnitario: l.oferta.preco, desconto: l.descontoLevePague, total: l.total, custoUnitario: custos.get(l.produtoId) ?? null,
        alocacoes: (aloc.get(l.produtoId) ?? []) as unknown as Prisma.InputJsonValue,
      })),
    });
    await evento(tx, pedido.id, statusInicial, r.exigeReceita ? 'Pedido criado. Aguardando envio da receita.' : 'Pedido criado.', usuario.id);

    if (r.cupomId) await tx.cupom.update({ where: { id: r.cupomId }, data: { usos: { increment: 1 } } });
    if (r.pontosUsados) {
      const ok = await tx.usuario.updateMany({ where: { id: usuario.id, pontos: { gte: r.pontosUsados } }, data: { pontos: { decrement: r.pontosUsados } } });
      if (!ok.count) throw new ErroNegocio('Saldo de pontos insuficiente.');
      await tx.movimentoPontos.create({ data: { usuarioId: usuario.id, pedidoId: pedido.id, pontos: -r.pontosUsados, descricao: `Resgate no pedido #${pedido.numero}` } });
    }
    await tx.carrinhoItem.deleteMany({ where: { carrinhoId: carrinho.id } });
    await tx.carrinho.update({ where: { id: carrinho.id }, data: { cupomCodigo: null } });

    let pagamento = null;
    if (!r.exigeReceita && d.pagamento) {
      pagamento = await cobrar(tx, pedido, d.pagamento);
      if (pagamento.status === 'APROVADO') await marcarPago(tx, pedido.id, usuario.id);
    }
    await auditar('pedido.criado', { usuarioId: usuario.id, alvo: pedido.id, ip, detalhes: { numero: pedido.numero, total: r.total } }, tx);
    return { pedido, pagamento };
  }, { timeout: 20_000 });

  return resultado;
}

export async function marcarPago(tx: Tx, pedidoId: string, usuarioId?: string | null) {
  const p = await tx.pedido.update({ where: { id: pedidoId }, data: { status: 'PAGO' }, include: { itens: true } });
  await evento(tx, pedidoId, 'PAGO', 'Pagamento aprovado.', usuarioId);
  for (const i of p.itens) await tx.produto.update({ where: { id: i.produtoId }, data: { vendas: { increment: i.quantidade } } });
}

/** Pagamento iniciado pelo cliente (após receita aprovada, ou nova tentativa após recusa). */
export async function pagarPedido(usuario: UsuarioSessao, pedidoId: string, dados: DadosPagamento, ip: string) {
  return db.$transaction(async (tx) => {
    const pedido = await tx.pedido.findFirst({ where: { id: pedidoId, usuarioId: usuario.id } });
    if (!pedido) throw new ErroNegocio('Pedido não encontrado.', 404);
    if (pedido.status !== 'AGUARDANDO_PAGAMENTO') throw new ErroNegocio(`Este pedido não está aguardando pagamento (${STATUS_PEDIDO[pedido.status].rotulo}).`, 409);
    const pg = await cobrar(tx, pedido, dados);
    await tx.pedido.update({ where: { id: pedido.id }, data: { metodoPagamento: dados.metodo } });
    if (pg.status === 'APROVADO') await marcarPago(tx, pedido.id, usuario.id);
    await auditar(`pagamento.${pg.status.toLowerCase()}`, { usuarioId: usuario.id, alvo: pg.id, ip, detalhes: { pedido: pedido.numero, valor: pg.valor } }, tx);
    return pg;
  });
}

/** Confirmação de PIX (no real chega por webhook assinado do PSP). */
export async function confirmarPix(pagamentoId: string, origem: string) {
  return db.$transaction(async (tx) => {
    const pg = await tx.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!pg || pg.metodo !== 'PIX') throw new ErroNegocio('Pagamento não encontrado.', 404);
    if (pg.status === 'APROVADO') return pg;
    if (pg.status !== 'PENDENTE' || (pg.pixExpiraEm && pg.pixExpiraEm < new Date())) throw new ErroNegocio('Este PIX expirou. Gere um novo código.');
    const atualizado = await tx.pagamento.update({ where: { id: pg.id }, data: { status: 'APROVADO' } });
    const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: pg.pedidoId } });
    if (pedido.status === 'AGUARDANDO_PAGAMENTO') await marcarPago(tx, pedido.id);
    await auditar('pagamento.pix_confirmado', { alvo: pg.id, detalhes: { origem, pedido: pedido.numero } }, tx);
    return atualizado;
  });
}

const FLUXO: Partial<Record<StatusPedido, StatusPedido[]>> = {
  PAGO: ['EM_SEPARACAO'],
  EM_SEPARACAO: ['PRONTO_PARA_RETIRADA', 'SAIU_PARA_ENTREGA'],
  PRONTO_PARA_RETIRADA: ['ENTREGUE'],
  SAIU_PARA_ENTREGA: ['ENTREGUE'],
};

export function proximosStatus(status: StatusPedido, modalidade: Modalidade): StatusPedido[] {
  return (FLUXO[status] ?? []).filter((s) => (s === 'PRONTO_PARA_RETIRADA' ? modalidade === 'RETIRADA' : s === 'SAIU_PARA_ENTREGA' ? modalidade !== 'RETIRADA' : true));
}

/** Equipe avança o pedido. Separação baixa o estoque (FEFO) e escritura antimicrobianos. */
export async function avancarStatus(operador: UsuarioSessao, pedidoId: string, novo: StatusPedido, ip: string) {
  return db.$transaction(async (tx) => {
    const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, include: { itens: true, receitas: true } });
    if (!pedido) throw new ErroNegocio('Pedido não encontrado.', 404);
    if (operador.lojaId && operador.papel !== 'ADMIN' && pedido.lojaId !== operador.lojaId) throw new ErroNegocio('Pedido de outra loja.', 403);
    if (!proximosStatus(pedido.status, pedido.modalidade).includes(novo)) {
      throw new ErroNegocio(`Não é possível ir de "${STATUS_PEDIDO[pedido.status].rotulo}" para "${STATUS_PEDIDO[novo].rotulo}".`, 409);
    }
    const temPrescricao = pedido.itens.some((i) => REGRAS[i.classificacao].exigeReceita);
    if (novo === 'EM_SEPARACAO') {
      if (temPrescricao && operador.papel !== 'FARMACEUTICO') throw new ErroNegocio('Pedidos com medicamento sob prescrição só podem ser dispensados por farmacêutico.', 403);
      await baixar(tx, pedido.lojaId, pedido.itens, { pedidoId: pedido.id, usuarioId: operador.id });
      const receita = pedido.receitas.find((r) => r.status === 'APROVADA');
      for (const i of pedido.itens.filter((x) => REGRAS[x.classificacao].escrituracao)) {
        const prod = await tx.produto.findUniqueOrThrow({ where: { id: i.produtoId } });
        await tx.escrituracao.create({
          data: {
            pedidoId: pedido.id, produtoId: i.produtoId, lojaId: pedido.lojaId, registroAnvisa: prod.registroAnvisa, principioAtivo: prod.principioAtivo,
            quantidade: i.quantidade, lotes: i.alocacoes as Prisma.InputJsonValue, receitaId: receita?.id ?? null, registroPrescritor: receita?.registroPrescritor ?? null,
            farmaceuticoId: operador.id, crfFarmaceutico: operador.crf ?? '—',
          },
        });
      }
    }
    if (novo === 'ENTREGUE' && pedido.usuarioId) await creditarPontos(tx, pedido.usuarioId, pedido.id, pedido.numero, pedido.total - pedido.frete);
    await tx.pedido.update({ where: { id: pedido.id }, data: { status: novo } });
    await evento(tx, pedido.id, novo, STATUS_PEDIDO[novo].cliente, operador.id);
    await auditar('pedido.status', { usuarioId: operador.id, alvo: pedido.id, ip, detalhes: { de: pedido.status, para: novo } }, tx);
  });
}

async function creditarPontos(tx: Tx, usuarioId: string, pedidoId: string, numero: number, valorCentavos: number) {
  const umAno = new Date(Date.now() - 365 * 86_400_000);
  const gasto = await tx.pedido.aggregate({ where: { usuarioId, status: 'ENTREGUE', criadoEm: { gte: umAno } }, _sum: { total: true } });
  const nivel = nivelFidelidade(gasto._sum.total ?? 0);
  const pontos = Math.floor((valorCentavos / 100) * config.fidelidade.pontosPorReal * nivel.multiplicador);
  if (pontos <= 0) return;
  const expiraEm = new Date();
  expiraEm.setMonth(expiraEm.getMonth() + config.fidelidade.validadeMeses);
  await tx.usuario.update({ where: { id: usuarioId }, data: { pontos: { increment: pontos } } });
  await tx.movimentoPontos.create({ data: { usuarioId, pedidoId, pontos, descricao: `Compra #${numero} (nível ${nivel.nome}${nivel.multiplicador > 1 ? `, ${nivel.multiplicador}x` : ''})`, expiraEm } });
  await tx.pedido.update({ where: { id: pedidoId }, data: { pontosGanhos: pontos } });
}

const CANCELAVEL_CLIENTE: StatusPedido[] = ['AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO', 'PAGO'];
const CANCELAVEL_EQUIPE: StatusPedido[] = ['AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO', 'PAGO'];

/** Cancela: libera a reserva, estorna pagamento, devolve pontos e o uso do cupom. */
export async function cancelarPedido(pedidoId: string, motivo: string, quem: { usuario?: UsuarioSessao; sistema?: boolean }, ip?: string) {
  return db.$transaction(async (tx) => {
    const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, include: { itens: true, pagamentos: true } });
    if (!pedido) throw new ErroNegocio('Pedido não encontrado.', 404);
    const u = quem.usuario;
    if (u && u.papel === 'CLIENTE') {
      if (pedido.usuarioId !== u.id) throw new ErroNegocio('Pedido não encontrado.', 404);
      if (!CANCELAVEL_CLIENTE.includes(pedido.status)) throw new ErroNegocio('Este pedido já está em separação e não pode mais ser cancelado pelo site. Fale com o SAC.');
    } else if (!quem.sistema && !CANCELAVEL_EQUIPE.includes(pedido.status)) {
      throw new ErroNegocio('Pedido já separado: o estoque foi baixado. Registre uma devolução em vez de cancelar.');
    }
    await liberar(tx, pedido.lojaId, pedido.itens, { pedidoId: pedido.id, usuarioId: u?.id });
    for (const pg of pedido.pagamentos) {
      if (pg.status === 'APROVADO') await tx.pagamento.update({ where: { id: pg.id }, data: { status: 'ESTORNADO' } });
      if (pg.status === 'PENDENTE') await tx.pagamento.update({ where: { id: pg.id }, data: { status: 'EXPIRADO' } });
    }
    if (pedido.status === 'PAGO') for (const i of pedido.itens) await tx.produto.update({ where: { id: i.produtoId }, data: { vendas: { decrement: i.quantidade } } });
    if (pedido.pontosUsados && pedido.usuarioId) {
      await tx.usuario.update({ where: { id: pedido.usuarioId }, data: { pontos: { increment: pedido.pontosUsados } } });
      await tx.movimentoPontos.create({ data: { usuarioId: pedido.usuarioId, pedidoId: pedido.id, pontos: pedido.pontosUsados, descricao: `Estorno de pontos — pedido #${pedido.numero} cancelado` } });
    }
    if (pedido.cupomId) await tx.cupom.update({ where: { id: pedido.cupomId }, data: { usos: { decrement: 1 } } });
    await tx.pedido.update({ where: { id: pedido.id }, data: { status: 'CANCELADO' } });
    await evento(tx, pedido.id, 'CANCELADO', `Pedido cancelado: ${motivo}`, u?.id);
    await auditar('pedido.cancelado', { usuarioId: u?.id, alvo: pedido.id, ip, detalhes: { motivo, sistema: !!quem.sistema } }, tx);
  });
}

/** Rotina: expira PIX não pagos e cancela pedidos abandonados, liberando o estoque. */
export async function expirarPagamentosPendentes() {
  const vencidos = await db.pagamento.findMany({ where: { metodo: 'PIX', status: 'PENDENTE', pixExpiraEm: { lt: new Date() } }, select: { id: true, pedidoId: true } });
  for (const pg of vencidos) {
    await db.pagamento.update({ where: { id: pg.id }, data: { status: 'EXPIRADO' } });
    const pedido = await db.pedido.findUnique({ where: { id: pg.pedidoId }, select: { status: true } });
    if (pedido?.status === 'AGUARDANDO_PAGAMENTO') await cancelarPedido(pg.pedidoId, 'PIX não pago no prazo', { sistema: true }).catch((e) => console.error('[expirar pix]', e));
  }
  return vencidos.length;
}

export const alocacoesDe = (j: Prisma.JsonValue) => (Array.isArray(j) ? (j as unknown as Alocacao[]) : []);
