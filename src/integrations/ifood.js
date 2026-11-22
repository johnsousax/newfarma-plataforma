import crypto from 'node:crypto';
import { config } from '../config.js';
import { verificarAssinaturaWebhook } from '../lib/crypto.js';
import { barramento } from '../lib/eventos.js';
import { erro, texto } from '../lib/http.js';
import { avaliarProduto } from '../services/anvisa.js';

/**
 * Integração iFood (Merchant API).
 *
 *  1. Pedidos do app com entrega iFood: o cliente compra no NOSSO app e a entrega é
 *     solicitada à logística do iFood (iFood Envios / entrega sob demanda).
 *  2. Pedidos vindos do marketplace iFood: recebidos por webhook (ou polling de eventos),
 *     validados pelas MESMAS regras ANVISA e de estoque, e confirmados/cancelados na API.
 *  3. Sincronização de catálogo: só sobem ao iFood itens permitidos (MIP e não medicamentos).
 *
 * modo "mock": simula as chamadas (desenvolvimento). modo "live": chama a API real.
 * Os caminhos seguem a documentação pública (developer.ifood.com.br) — confira a versão
 * vigente dos endpoints antes de ir para produção, pois o iFood os versiona.
 */
export function criarIfood(store, { pedidos, estoque }) {
  const cfg = config.ifood;
  let tokenCache = { valor: null, expira: 0 };
  const log = (acao, dados) => store.inserir('eventosIfood', { acao, dados, modo: cfg.modo });

  async function token() {
    if (tokenCache.valor && tokenCache.expira > Date.now() + 60_000) return tokenCache.valor;
    const r = await fetch(`${cfg.baseUrl}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grantType: 'client_credentials', clientId: cfg.clientId, clientSecret: cfg.clientSecret }),
    });
    if (!r.ok) throw erro(502, `Falha ao autenticar no iFood (${r.status})`);
    const j = await r.json();
    tokenCache = { valor: j.accessToken, expira: Date.now() + (j.expiresIn || 3600) * 1000 };
    return tokenCache.valor;
  }

  async function chamar(metodo, caminho, corpo) {
    if (cfg.modo !== 'live') {
      log(`mock:${metodo} ${caminho}`, corpo || null);
      return { simulado: true };
    }
    const r = await fetch(`${cfg.baseUrl}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw erro(502, `iFood respondeu ${r.status} em ${caminho}`);
    return r.status === 202 || r.status === 204 ? {} : r.json();
  }

  // ---- Catálogo -------------------------------------------------------------
  async function sincronizarCatalogo() {
    const itens = [];
    const bloqueados = [];
    for (const p of store.listar('produtos', (x) => x.ativo)) {
      const a = avaliarProduto(p, 'ifood');
      if (!a.permitido) { bloqueados.push({ sku: p.sku, nome: p.nome, motivo: a.motivo }); continue; }
      const disp = estoque.disponivel(p);
      itens.push({ externalCode: p.sku, name: p.nome, description: p.descricao, price: { value: p.preco / 100 }, ean: p.ean, status: disp > 0 ? 'AVAILABLE' : 'UNAVAILABLE', stock: disp });
    }
    await chamar('POST', `/catalog/v2.0/merchants/${cfg.merchantId || 'MERCHANT'}/items:batch`, { items: itens });
    log('catalogo.sincronizado', { enviados: itens.length, bloqueados: bloqueados.length });
    return { enviados: itens.length, bloqueados, itens };
  }

  // Disponibilidade em tempo real: produto esgotou/voltou → atualiza no iFood
  barramento.on('estoque', (r) => {
    const p = store.obter('produtos', r.produtoId);
    if (!p || !avaliarProduto(p, 'ifood').permitido) return;
    chamar('PATCH', `/catalog/v2.0/merchants/${cfg.merchantId || 'MERCHANT'}/items/${p.sku}`, { status: r.disponivel > 0 ? 'AVAILABLE' : 'UNAVAILABLE', stock: r.disponivel }).catch(() => {});
  });

  // ---- Pedidos vindos do marketplace iFood ------------------------------------
  async function detalhesPedido(evento) {
    if (cfg.modo !== 'live') return evento.order; // no mock, o pedido vem junto do evento
    return chamar('GET', `/order/v1.0/orders/${encodeURIComponent(evento.orderId)}`);
  }

  async function processarEvento(evento) {
    if (store.encontrar('eventosIfood', (e) => e.acao === 'evento.processado' && e.dados?.id === evento.id)) return { idempotente: true };
    let resultado = { ignorado: true };
    if (evento.code === 'PLC' || evento.fullCode === 'PLACED') {
      const order = await detalhesPedido(evento);
      resultado = await importarPedido(order);
    } else if (['CAN', 'CANCELLED'].includes(evento.code) || evento.fullCode === 'CANCELLED') {
      const pedido = store.encontrar('pedidos', (p) => p.ifood?.orderId === evento.orderId);
      if (pedido && ['AGUARDANDO_PAGAMENTO', 'PAGO'].includes(pedido.status)) pedidos.mudarStatus(pedido, 'CANCELADO', { obs: 'Cancelado no iFood' });
      resultado = { cancelado: !!pedido };
    }
    log('evento.processado', { id: evento.id, code: evento.code || evento.fullCode, orderId: evento.orderId });
    return resultado;
  }

  async function importarPedido(order) {
    const itens = [];
    for (const it of order.items || []) {
      const p = store.encontrar('produtos', (x) => x.sku === it.externalCode);
      if (!p) {
        await chamar('POST', `/order/v1.0/orders/${order.id}/requestCancellation`, { reason: 'Item indisponível', cancellationCode: '503' });
        return { aceito: false, motivo: `SKU desconhecido: ${texto(it.externalCode, 40)}` };
      }
      itens.push({ produtoId: p.id, quantidade: it.quantity });
    }
    try {
      const pedido = pedidos.criar({
        usuario: null,
        canal: 'ifood',
        itens,
        entrega: { tipo: 'delivery', endereco: mapearEndereco(order.delivery?.deliveryAddress) },
        externo: { pago: true, ifood: { orderId: order.id, displayId: order.displayId }, cliente: { nome: texto(order.customer?.name, 120) } },
      });
      await chamar('POST', `/order/v1.0/orders/${order.id}/confirm`);
      return { aceito: true, pedidoId: pedido.id, numero: pedido.numero };
    } catch (e) {
      // ANVISA (422) ou estoque (409): cancela no iFood com motivo
      await chamar('POST', `/order/v1.0/orders/${order.id}/requestCancellation`, { reason: e.message.slice(0, 250), cancellationCode: '503' });
      log('pedido.recusado', { orderId: order.id, motivo: e.message, detalhes: e.detalhes });
      return { aceito: false, motivo: e.message, detalhes: e.detalhes };
    }
  }

  function mapearEndereco(a = {}) {
    return { logradouro: a.streetName || 'Endereço iFood', numero: a.streetNumber || 'S/N', complemento: a.complement, bairro: a.neighborhood, cidade: a.city, uf: a.state, cep: a.postalCode || '00000000' };
  }

  function processarWebhook(corpoBruto, assinatura) {
    if (!verificarAssinaturaWebhook(cfg.segredoWebhook, corpoBruto, assinatura)) throw erro(401, 'Assinatura iFood inválida');
    const corpo = JSON.parse(corpoBruto.toString('utf8'));
    const eventos = Array.isArray(corpo) ? corpo : [corpo];
    return Promise.all(eventos.map(processarEvento));
  }

  /** Alternativa ao webhook: polling a cada 30s (recomendado pelo iFood como fallback). */
  async function pollingEventos() {
    if (cfg.modo !== 'live') return [];
    const eventos = await fetch(`${cfg.baseUrl}/events/v1.0/events:polling`, { headers: { Authorization: `Bearer ${await token()}`, 'x-polling-merchants': cfg.merchantId } })
      .then((r) => (r.status === 204 ? [] : r.json()));
    const resultados = [];
    for (const ev of eventos) resultados.push(await processarEvento(ev));
    if (eventos.length) await chamar('POST', '/events/v1.0/events/acknowledgment', eventos.map((e) => ({ id: e.id })));
    return resultados;
  }

  function iniciarPolling() {
    if (cfg.modo !== 'live') return null;
    const t = setInterval(() => pollingEventos().catch((e) => console.error('[ifood] polling:', e.message)), 30_000);
    t.unref();
    return t;
  }

  // ---- Status → iFood e entrega dos pedidos do app ------------------------------
  barramento.on('pedido', async (ev) => {
    const pedido = store.obter('pedidos', ev.id);
    if (!pedido) return;
    try {
      if (pedido.canal === 'ifood' && pedido.ifood?.orderId) {
        const mapa = { EM_SEPARACAO: 'startPreparation', SAIU_PARA_ENTREGA: 'dispatch', CANCELADO: 'requestCancellation' };
        if (mapa[ev.status]) await chamar('POST', `/order/v1.0/orders/${pedido.ifood.orderId}/${mapa[ev.status]}`);
      } else if (pedido.canal === 'app' && ev.status === 'SAIU_PARA_ENTREGA' && pedido.entrega.tipo === 'delivery') {
        await solicitarEntrega(pedido);
      }
    } catch (e) {
      console.error('[ifood] sincronização de status falhou:', e.message);
    }
  });

  async function solicitarEntrega(pedido) {
    const endereco = pedidos.enderecoDe(pedido);
    const r = await chamar('POST', `/shipping/v1.0/merchants/${cfg.merchantId || 'MERCHANT'}/orders`, {
      externalId: pedido.id, displayId: String(pedido.numero), deliveryAddress: endereco,
      // Itens com retenção de receita: instrução ao entregador para coletar a 2ª via
      observations: pedido.coletarReceitaNaEntrega ? 'ATENÇÃO: coletar 2ª via da receita original na entrega (RDC 471/2021).' : undefined,
    });
    const entrega = { solicitadaEm: new Date().toISOString(), entregaId: r.id || `ifood_ship_${crypto.randomUUID().slice(0, 8)}`, rastreio: r.trackingUrl || null, simulado: !!r.simulado };
    store.atualizar('pedidos', pedido.id, { entrega: { ...pedido.entrega, ifood: entrega } });
    return entrega;
  }

  /** Desenvolvimento: gera um evento PLACED como se viesse do iFood. */
  function eventoSimulado(itens) {
    const orderId = `ifood-${crypto.randomUUID().slice(0, 8)}`;
    return {
      id: crypto.randomUUID(), code: 'PLC', fullCode: 'PLACED', orderId,
      order: {
        id: orderId, displayId: String(Math.floor(1000 + Math.random() * 9000)),
        customer: { name: 'Cliente iFood (simulado)' },
        delivery: { deliveryAddress: { streetName: 'Rua Simulada', streetNumber: '100', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', postalCode: '01000000' } },
        items: itens.map((i) => ({ externalCode: i.sku, quantity: i.quantidade })),
      },
    };
  }

  function status() {
    return { modo: cfg.modo, merchantConfigurado: !!cfg.merchantId, ultimosEventos: store.listar('eventosIfood').slice(-20).reverse() };
  }

  return { sincronizarCatalogo, processarWebhook, processarEvento, pollingEventos, iniciarPolling, solicitarEntrega, eventoSimulado, status };
}
