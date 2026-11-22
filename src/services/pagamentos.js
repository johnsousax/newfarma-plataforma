import crypto from 'node:crypto';
import { config } from '../config.js';
import { verificarAssinaturaWebhook, hmacHex } from '../lib/crypto.js';
import { erro } from '../lib/http.js';

/**
 * Pagamentos com princípio PCI-DSS de "escopo mínimo":
 *  - O número do cartão e o CVV NUNCA chegam ao nosso servidor: o front usa o SDK do
 *    gateway (Mercado Pago / Pagar.me / Stripe...) que devolve um TOKEN de uso único.
 *  - Guardamos apenas token/ID do gateway, bandeira e últimos 4 dígitos.
 *  - Confirmações chegam por webhook assinado (HMAC-SHA256), verificado em tempo constante.
 *  - Valor é sempre o total calculado no servidor.
 */
const PAN_REGEX = /\b(?:\d[ -]?){13,19}\b/;
const CAMPOS_PROIBIDOS = ['numeroCartao', 'cardNumber', 'pan', 'cvv', 'cvc', 'codigoSeguranca'];

export function criarPagamentos(store, { pedidos }) {
  function bloquearDadosDeCartao(dados) {
    const bruto = JSON.stringify(dados || {});
    if (CAMPOS_PROIBIDOS.some((c) => Object.hasOwn(dados || {}, c)) || PAN_REGEX.test(bruto)) {
      throw erro(400, 'Dados de cartão não devem ser enviados ao servidor. Use a tokenização do gateway.');
    }
  }

  function publico(pg) {
    const { segredoInterno, ...resto } = pg;
    return resto;
  }

  function criar({ pedido, usuario, dados, ip }) {
    bloquearDadosDeCartao(dados);
    if (pedido.usuarioId !== usuario.id) throw erro(404, 'Pedido não encontrado');
    if (pedido.status !== 'AGUARDANDO_PAGAMENTO') throw erro(409, `Pedido não está aguardando pagamento (status: ${pedido.status})`);

    const ativo = store.encontrar('pagamentos', (p) => p.pedidoId === pedido.id && ['PENDENTE', 'APROVADO'].includes(p.status));
    if (ativo) return publico(ativo); // idempotência: não cobra duas vezes

    const metodo = dados.metodo;
    const base = { pedidoId: pedido.id, usuarioId: usuario.id, valor: pedido.total, moeda: 'BRL', metodo, gatewayId: `pay_${crypto.randomUUID()}`, gateway: config.pagamento.modo };

    if (metodo === 'cartao') {
      const token = String(dados.cartaoToken || '');
      if (!/^tok_[A-Za-z0-9_]{8,64}$/.test(token)) throw erro(400, 'Token de cartão inválido');
      const recusado = token.includes('recusado'); // simulação do gateway
      const pg = store.inserir('pagamentos', {
        ...base,
        status: recusado ? 'RECUSADO' : 'APROVADO',
        cartao: { bandeira: String(dados.bandeira || 'desconhecida').slice(0, 20), ultimos4: String(dados.ultimos4 || '').replace(/\D/g, '').slice(-4) },
        parcelas: Math.min(Math.max(Number(dados.parcelas) || 1, 1), 6),
      });
      store.auditar(recusado ? 'pagamento.recusado' : 'pagamento.aprovado', { usuarioId: usuario.id, alvo: pg.id, ip, detalhes: { pedidoId: pedido.id, valor: pg.valor } });
      if (!recusado) pedidos.marcarPago(pedido, pg.id);
      return publico(pg);
    }

    if (metodo === 'pix') {
      const txid = crypto.randomBytes(13).toString('hex').toUpperCase();
      const pg = store.inserir('pagamentos', {
        ...base,
        status: 'PENDENTE',
        pix: {
          txid,
          copiaECola: `00020126580014BR.GOV.BCB.PIX0136SIMULADO-${txid}5204000053039865406${(pedido.total / 100).toFixed(2)}5802BR6304ABCD`,
          expiraEm: new Date(Date.now() + 30 * 60_000).toISOString(),
        },
      });
      store.auditar('pagamento.pix_gerado', { usuarioId: usuario.id, alvo: pg.id, ip });
      return publico(pg);
    }

    throw erro(400, 'Método de pagamento inválido (cartao | pix)');
  }

  /** Webhook do gateway. corpoBruto = Buffer original (necessário para validar a assinatura). */
  function processarWebhook(corpoBruto, assinatura) {
    if (!verificarAssinaturaWebhook(config.pagamento.segredoWebhook, corpoBruto, assinatura)) throw erro(401, 'Assinatura inválida');
    const evento = JSON.parse(corpoBruto.toString('utf8'));
    const pg = store.encontrar('pagamentos', (p) => p.gatewayId === evento.gatewayId);
    if (!pg) throw erro(404, 'Pagamento não encontrado');
    if (pg.status === 'APROVADO') return { ok: true, idempotente: true };
    if (Number(evento.valor) !== pg.valor) {
      store.auditar('pagamento.divergencia_valor', { alvo: pg.id, detalhes: { esperado: pg.valor, recebido: evento.valor } });
      throw erro(422, 'Valor divergente');
    }
    if (evento.status === 'APROVADO') {
      store.atualizar('pagamentos', pg.id, { status: 'APROVADO', confirmadoEm: new Date().toISOString() });
      const pedido = store.obter('pedidos', pg.pedidoId);
      if (pedido && pedido.status === 'AGUARDANDO_PAGAMENTO') pedidos.marcarPago(pedido, pg.id);
    } else if (['RECUSADO', 'EXPIRADO'].includes(evento.status)) {
      store.atualizar('pagamentos', pg.id, { status: evento.status });
    }
    store.auditar('pagamento.webhook', { alvo: pg.id, detalhes: { status: evento.status } });
    return { ok: true };
  }

  /** Apenas desenvolvimento: simula o gateway enviando o webhook assinado. */
  function simularConfirmacaoPix(pagamentoId) {
    const pg = store.obter('pagamentos', pagamentoId);
    if (!pg) throw erro(404, 'Pagamento não encontrado');
    const corpo = Buffer.from(JSON.stringify({ gatewayId: pg.gatewayId, status: 'APROVADO', valor: pg.valor }));
    return processarWebhook(corpo, hmacHex(config.pagamento.segredoWebhook, corpo));
  }

  return { criar, processarWebhook, simularConfirmacaoPix, publico };
}
