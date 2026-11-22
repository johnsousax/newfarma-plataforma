import 'server-only';
import crypto from 'node:crypto';
import { ErroNegocio } from './erros';
import { parcelasPara } from '@/lib/farmacia';
import type { Tx } from './db';
import type { MetodoPagamento } from '@/generated/prisma/enums';

/**
 * Gateway SIMULADO com o mesmo contrato de um gateway real (Mercado Pago, Pagar.me, Stripe…):
 *  - O número do cartão e o CVV NUNCA chegam ao servidor. O navegador tokeniza (no real, o SDK
 *    do gateway faz isso) e envia só: token, bandeira e últimos 4 dígitos (escopo PCI mínimo).
 *  - O valor é sempre o total calculado no servidor.
 *  - Um pedido nunca tem dois pagamentos ativos (idempotência).
 */
export type DadosPagamento =
  | { metodo: 'CARTAO_CREDITO'; token: string; bandeira: string; final: string; parcelas: number }
  | { metodo: 'PIX' };

const PAN = /\b(?:\d[ -]?){13,19}\b/;

export function validarDadosPagamento(d: unknown): DadosPagamento {
  if (PAN.test(JSON.stringify(d ?? {}))) throw new ErroNegocio('Dados de cartão não devem ser enviados ao servidor.');
  const x = d as Record<string, unknown>;
  if (x?.metodo === 'PIX') return { metodo: 'PIX' };
  if (x?.metodo === 'CARTAO_CREDITO') {
    const token = String(x.token ?? '');
    if (!/^tok_[A-Za-z0-9_]{8,80}$/.test(token)) throw new ErroNegocio('Cartão inválido. Confira os dados e tente novamente.');
    return {
      metodo: 'CARTAO_CREDITO', token,
      bandeira: String(x.bandeira ?? 'Cartão').slice(0, 20),
      final: String(x.final ?? '').replace(/\D/g, '').slice(-4),
      parcelas: Math.min(Math.max(Number(x.parcelas) || 1, 1), 12),
    };
  }
  throw new ErroNegocio('Escolha uma forma de pagamento.');
}

/** Parcelas sem juros conforme a política da loja (FARMACIA.maxParcelas, mínimo R$ 30 por parcela). */
export const maxParcelas = parcelasPara;

export async function cobrar(tx: Tx, pedido: { id: string; total: number }, d: DadosPagamento) {
  const ativo = await tx.pagamento.findFirst({ where: { pedidoId: pedido.id, status: { in: ['PENDENTE', 'APROVADO'] } } });
  if (ativo?.status === 'APROVADO') throw new ErroNegocio('Este pedido já está pago.');
  if (ativo?.status === 'PENDENTE') {
    if (d.metodo === 'PIX' && ativo.metodo === 'PIX') return ativo;
    await tx.pagamento.update({ where: { id: ativo.id }, data: { status: 'EXPIRADO' } });
  }
  const gatewayId = `pay_${crypto.randomUUID()}`;
  if (d.metodo === 'PIX') {
    const txid = crypto.randomBytes(13).toString('hex').toUpperCase();
    return tx.pagamento.create({
      data: {
        pedidoId: pedido.id, metodo: 'PIX', status: 'PENDENTE', valor: pedido.total, gatewayId,
        pixCopiaECola: `00020126580014BR.GOV.BCB.PIX0136SIMULADO-${txid}5204000053039865406${(pedido.total / 100).toFixed(2)}5802BR5913FARMACIA6009SAO PAULO62070503***6304ABCD`,
        pixExpiraEm: new Date(Date.now() + 30 * 60_000),
      },
    });
  }
  if (d.parcelas > maxParcelas(pedido.total)) throw new ErroNegocio(`Parcelamento máximo para este valor: ${maxParcelas(pedido.total)}x.`);
  const recusado = d.token.includes('recusado');
  return tx.pagamento.create({
    data: {
      pedidoId: pedido.id, metodo: 'CARTAO_CREDITO', status: recusado ? 'RECUSADO' : 'APROVADO', valor: pedido.total, gatewayId,
      parcelas: d.parcelas, cartaoBandeira: d.bandeira, cartaoFinal: d.final, motivoRecusa: recusado ? 'Transação não autorizada pelo emissor' : null,
    },
  });
}

/** Pagamento presencial no PDV (dinheiro, débito, crédito na maquininha, PIX no balcão). */
export async function registrarPresencial(tx: Tx, pedido: { id: string; total: number }, metodo: MetodoPagamento, valorRecebido?: number) {
  if (metodo === 'DINHEIRO' && (valorRecebido ?? 0) < pedido.total) throw new ErroNegocio('Valor recebido menor que o total.');
  return tx.pagamento.create({
    data: {
      pedidoId: pedido.id, metodo, status: 'APROVADO', valor: pedido.total, gatewayId: `pdv_${crypto.randomUUID()}`,
      valorRecebido: metodo === 'DINHEIRO' ? valorRecebido : null, troco: metodo === 'DINHEIRO' ? (valorRecebido ?? 0) - pedido.total : null,
    },
  });
}
