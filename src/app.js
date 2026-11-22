import path from 'node:path';
import { config } from './config.js';
import { Store } from './lib/store.js';
import { Router, RateLimiter, HttpError, erro, enviarJson, lerCorpo, cabecalhosSeguranca, servirEstatico, exigirCampos, texto } from './lib/http.js';
import { abrirSSE } from './lib/eventos.js';
import { criarAuth, EQUIPE } from './services/auth.js';
import { criarAnvisa, infoRegulatoria, validarCadastroProduto, CLASSIFICACOES } from './services/anvisa.js';
import { criarEstoque } from './services/estoque.js';
import { criarPedidos } from './services/pedidos.js';
import { criarPagamentos } from './services/pagamentos.js';
import { criarIfood } from './integrations/ifood.js';
import { criarWhatsapp } from './integrations/whatsapp.js';
import { decifrar } from './lib/crypto.js';

export function criarApp({ store = new Store({ arquivo: config.arquivoDados, persistir: config.persistir }), limiteAuth = { n: 10, ms: 60_000 } } = {}) {
  const auth = criarAuth(store);
  const anvisa = criarAnvisa(store);
  const estoque = criarEstoque(store);
  const pedidos = criarPedidos(store, { estoque, anvisa });
  const pagamentos = criarPagamentos(store, { pedidos });
  const ifood = criarIfood(store, { pedidos, estoque });
  const whatsapp = criarWhatsapp(store, { auth, pedidos, estoque });

  const router = new Router();
  const limiter = new RateLimiter();
  const pastaPublica = path.join(config.raiz, 'public');
  const dev = !config.isProd;

  const produtoPublico = (p) => ({
    id: p.id, sku: p.sku, ean: p.ean, nome: p.nome, descricao: p.descricao, categoria: p.categoria, icone: p.icone,
    preco: p.preco, principioAtivo: p.principioAtivo,
    disponivel: estoque.disponivel(p), situacao: estoque.situacao(p),
    regulatorio: infoRegulatoria(p),
  });

  // ---------------------------------------------------------------- Institucional
  router.get('/api/saude', () => ({ ok: true, persistencia: store.persistir, integracoes: { ifood: config.ifood.modo, whatsapp: config.whatsapp.modo, pagamento: config.pagamento.modo } }));
  router.get('/api/farmacia', () => ({ ...config.farmacia, aviso: 'Farmácia com farmacêutico responsável presente durante todo o horário de funcionamento (RDC 44/2009).' }));

  // ---------------------------------------------------------------- Autenticação
  router.post('/api/auth/registrar', { limite: limiteAuth }, ({ body, ip }) => ({ status: 201, corpo: auth.registrar(body, { papel: 'cliente', ip }) }));
  router.post('/api/auth/login', { limite: limiteAuth }, ({ body, ip }) => auth.login(body.email, body.senha, ip));
  router.post('/api/auth/logout', { auth: true }, ({ usuario }) => { auth.logout(usuario); return { ok: true }; });
  router.get('/api/auth/eu', { auth: true }, ({ usuario }) => { const { jti, exp, ...u } = usuario; return u; });
  router.post('/api/usuarios/equipe', { auth: ['admin'] }, ({ body, ip }) => {
    if (!EQUIPE.includes(body.papel)) throw erro(400, 'papel deve ser farmaceutico ou admin');
    if (body.papel === 'farmaceutico' && !body.crf) throw erro(400, 'CRF obrigatório para farmacêutico');
    return { status: 201, corpo: auth.registrar(body, { papel: body.papel, ip }) };
  });

  // ---------------------------------------------------------------- Catálogo
  router.get('/api/produtos', ({ query }) => {
    const q = (query.get('q') || '').toLowerCase();
    const cat = query.get('categoria');
    return store.listar('produtos', (p) => p.ativo && (!cat || p.categoria === cat) &&
      (!q || p.nome.toLowerCase().includes(q) || (p.principioAtivo || '').toLowerCase().includes(q))).map(produtoPublico);
  });
  router.get('/api/produtos/:id', ({ params }) => {
    const p = store.obter('produtos', params.id);
    if (!p || !p.ativo) throw erro(404, 'Produto não encontrado');
    return produtoPublico(p);
  });
  router.get('/api/categorias', () => [...new Set(store.listar('produtos', (p) => p.ativo).map((p) => p.categoria))].sort());
  router.get('/api/anvisa/classificacoes', () => CLASSIFICACOES);

  router.post('/api/produtos', { auth: ['admin'] }, ({ body, usuario, ip }) => {
    exigirCampos(body, ['sku', 'nome', 'categoria', 'classificacao', 'preco']);
    validarCadastroProduto(body);
    if (store.encontrar('produtos', (p) => p.sku === body.sku)) throw erro(409, 'SKU já cadastrado');
    const preco = Number(body.preco);
    if (!Number.isInteger(preco) || preco <= 0) throw erro(400, 'preco deve ser inteiro em centavos');
    const p = store.inserir('produtos', {
      sku: texto(body.sku, 40), ean: texto(body.ean, 14), nome: texto(body.nome, 150), descricao: texto(body.descricao, 1000),
      categoria: texto(body.categoria, 60), classificacao: body.classificacao, principioAtivo: texto(body.principioAtivo, 120) || null,
      registroAnvisa: body.registroAnvisa ? String(body.registroAnvisa).replace(/\D/g, '') : null, preco,
      estoqueMinimo: Math.max(0, Number(body.estoqueMinimo) || 0), icone: texto(body.icone, 4) || '💊', lotes: [], reservado: 0, ativo: true,
    });
    store.auditar('produto.criado', { usuarioId: usuario.id, alvo: p.id, ip });
    estoque.verificarAlertas(p);
    return { status: 201, corpo: produtoPublico(p) };
  });
  router.patch('/api/produtos/:id', { auth: ['admin'] }, ({ params, body, usuario, ip }) => {
    const p = store.obter('produtos', params.id);
    if (!p) throw erro(404, 'Produto não encontrado');
    const patch = {};
    if (body.preco !== undefined) { const v = Number(body.preco); if (!Number.isInteger(v) || v <= 0) throw erro(400, 'preco inválido'); patch.preco = v; }
    if (body.estoqueMinimo !== undefined) patch.estoqueMinimo = Math.max(0, Number(body.estoqueMinimo) || 0);
    if (body.descricao !== undefined) patch.descricao = texto(body.descricao, 1000);
    if (body.ativo !== undefined) patch.ativo = body.ativo === true;
    store.atualizar('produtos', p.id, patch);
    store.auditar('produto.alterado', { usuarioId: usuario.id, alvo: p.id, ip, detalhes: patch });
    estoque.verificarAlertas(p);
    return produtoPublico(p);
  });

  // ---------------------------------------------------------------- Estoque
  router.get('/api/estoque', { auth: EQUIPE }, () => store.listar('produtos').map(estoque.resumo));
  router.get('/api/estoque/alertas', { auth: EQUIPE }, ({ query }) =>
    store.listar('alertas', (a) => query.get('todos') === '1' || !a.resolvido).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)));
  router.post('/api/estoque/alertas/:id/resolver', { auth: EQUIPE }, ({ params, usuario }) => {
    const a = store.atualizar('alertas', params.id, { resolvido: true, resolvidoEm: new Date().toISOString(), resolucao: usuario.id });
    if (!a) throw erro(404, 'Alerta não encontrado');
    return a;
  });
  router.get('/api/estoque/movimentos', { auth: EQUIPE }, () => store.listar('movimentos').slice(-200).reverse());
  router.post('/api/estoque/:id/entrada', { auth: EQUIPE }, ({ params, body, usuario, ip }) => {
    const r = estoque.entrada(params.id, body, usuario);
    store.auditar('estoque.entrada', { usuarioId: usuario.id, alvo: params.id, ip, detalhes: { lote: body.lote, quantidade: body.quantidade } });
    return r;
  });
  router.post('/api/estoque/:id/ajuste', { auth: ['admin', 'farmaceutico'] }, ({ params, body, usuario, ip }) => {
    const r = estoque.ajustar(params.id, body, usuario);
    store.auditar('estoque.ajuste', { usuarioId: usuario.id, alvo: params.id, ip, detalhes: body });
    return r;
  });
  router.get('/api/estoque/stream', { auth: EQUIPE, sse: true }, ({ req, res }) => { abrirSSE(req, res, ['estoque', 'alerta', 'pedido', 'atendimento']); });

  // ---------------------------------------------------------------- Pedidos
  router.post('/api/pedidos', { auth: ['cliente'], limite: { n: 20, ms: 60_000 } }, ({ body, usuario, ip }) => {
    const p = pedidos.criar({ usuario, itens: body.itens, entrega: body.entrega, canal: 'app', ip });
    return { status: 201, corpo: pedidos.publico(p, { incluirEndereco: true }) };
  });
  router.get('/api/pedidos', { auth: true }, ({ usuario, query }) => {
    const equipe = EQUIPE.includes(usuario.papel);
    const status = query.get('status');
    return store.listar('pedidos', (p) => (equipe || p.usuarioId === usuario.id) && (!status || p.status === status))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 100).map((p) => pedidos.publico(p));
  });
  router.get('/api/pedidos/:id', { auth: true }, ({ params, usuario }) => pedidos.publico(pedidos.obterPara(params.id, usuario), { incluirEndereco: true }));
  router.post('/api/pedidos/:id/cancelar', { auth: true }, ({ params, usuario, body, ip }) => {
    const p = pedidos.obterPara(params.id, usuario);
    if (usuario.papel === 'cliente' && !['AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO'].includes(p.status)) throw erro(409, 'Pedido já pago: solicite o cancelamento ao atendimento');
    const pago = p.status === 'PAGO';
    pedidos.mudarStatus(p, 'CANCELADO', { usuario, obs: body.motivo, ip });
    if (pago && p.pagamentoId) store.atualizar('pagamentos', p.pagamentoId, { status: 'ESTORNO_SOLICITADO' });
    return pedidos.publico(p);
  });
  router.post('/api/pedidos/:id/status', { auth: EQUIPE }, ({ params, usuario, body, ip }) => {
    const p = pedidos.obterPara(params.id, usuario);
    if (body.status === 'CANCELADO' && p.status === 'PAGO' && p.pagamentoId) store.atualizar('pagamentos', p.pagamentoId, { status: 'ESTORNO_SOLICITADO' });
    return pedidos.publico(pedidos.mudarStatus(p, String(body.status), { usuario, obs: body.obs, ip }));
  });

  // ---------------------------------------------------------------- Receitas (ANVISA)
  router.post('/api/pedidos/:id/receitas', { auth: ['cliente'], corpoMax: config.seguranca.limiteReceitaBytes, limite: { n: 10, ms: 60_000 } }, ({ params, usuario, body, ip }) => {
    const p = pedidos.obterPara(params.id, usuario);
    if (p.status !== 'AGUARDANDO_RECEITA') throw erro(409, 'Este pedido não está aguardando receita');
    exigirCampos(body, ['arquivoBase64', 'tipoArquivo', 'nomePrescritor', 'registroPrescritor', 'dataEmissao']);
    return { status: 201, corpo: anvisa.registrarReceita({ pedido: p, usuario, dados: body, ip }) };
  });
  router.get('/api/receitas', { auth: ['farmaceutico'] }, ({ query }) =>
    store.listar('receitas', (r) => !query.get('status') || r.status === query.get('status')).map((r) => {
      const produtos = r.produtosIds.map((id) => store.obter('produtos', id)).filter(Boolean);
      return { ...anvisa.resumoReceita(r, true), produtos: produtos.map((p) => ({ id: p.id, nome: p.nome, classificacao: p.classificacao })), validade: anvisa.receitaDentroDaValidade(r, produtos) };
    }));
  router.get('/api/receitas/:id/arquivo', { auth: ['farmaceutico'] }, ({ params, usuario, ip, res }) => {
    const r = store.obter('receitas', params.id);
    if (!r) throw erro(404, 'Receita não encontrada');
    store.auditar('receita.visualizada', { usuarioId: usuario.id, alvo: r.id, ip }); // acesso a dado sensível é auditado
    res.writeHead(200, { 'Content-Type': r.tipoArquivo, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline' });
    res.end(Buffer.from(decifrar(r.arquivoCifrado), 'base64'));
  });
  router.post('/api/receitas/:id/avaliar', { auth: ['farmaceutico'] }, ({ params, usuario, body, ip }) => {
    const r = store.obter('receitas', params.id);
    if (!r) throw erro(404, 'Receita não encontrada');
    const resultado = anvisa.avaliarReceita({ receita: r, farmaceutico: usuario, aprovada: body.aprovada === true, observacao: body.observacao, ip });
    const pedido = store.obter('pedidos', r.pedidoId);
    if (pedido) pedidos.reavaliarReceitas(pedido, usuario);
    return resultado;
  });
  router.get('/api/anvisa/escrituracao', { auth: ['farmaceutico', 'admin'] }, () => store.listar('escrituracao').slice().reverse());

  // ---------------------------------------------------------------- Pagamentos
  router.post('/api/pedidos/:id/pagar', { auth: ['cliente'], limite: { n: 10, ms: 60_000 } }, ({ params, usuario, body, ip }) => {
    const p = pedidos.obterPara(params.id, usuario);
    return pagamentos.criar({ pedido: p, usuario, dados: body, ip });
  });
  router.post('/api/webhooks/pagamento', { bruto: true }, ({ req, bruto }) => pagamentos.processarWebhook(bruto, req.headers['x-gateway-signature']));

  // ---------------------------------------------------------------- iFood
  router.get('/api/ifood/status', { auth: ['admin'] }, () => ifood.status());
  router.post('/api/ifood/sincronizar-catalogo', { auth: ['admin'] }, async ({ usuario, ip }) => {
    const r = await ifood.sincronizarCatalogo();
    store.auditar('ifood.catalogo', { usuarioId: usuario.id, ip, detalhes: { enviados: r.enviados } });
    return r;
  });
  router.post('/api/webhooks/ifood', { bruto: true }, ({ req, bruto }) => ifood.processarWebhook(bruto, req.headers['x-ifood-signature']));

  // ---------------------------------------------------------------- WhatsApp
  router.get('/api/webhooks/whatsapp', ({ query, res }) => {
    const desafio = whatsapp.verificarWebhook(query);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(String(desafio));
  });
  router.post('/api/webhooks/whatsapp', { bruto: true }, ({ req, bruto }) => whatsapp.processarWebhook(bruto, req.headers['x-hub-signature-256']));
  router.post('/api/atendimento/chat', { auth: true, limite: { n: 30, ms: 60_000 } }, async ({ usuario, body }) => {
    exigirCampos(body, ['mensagem']);
    return { resposta: await whatsapp.receberMensagem(usuario.telefone, body.mensagem) };
  });
  router.get('/api/atendimento/conversas', { auth: EQUIPE }, () => whatsapp.listarConversas());
  router.get('/api/atendimento/conversas/:id', { auth: EQUIPE }, ({ params }) => whatsapp.historico(params.id));
  router.post('/api/atendimento/conversas/:id/responder', { auth: EQUIPE }, ({ params, usuario, body }) => {
    exigirCampos(body, ['mensagem']);
    return whatsapp.responderComoAtendente(params.id, usuario, body.mensagem);
  });
  router.post('/api/atendimento/conversas/:id/encerrar', { auth: EQUIPE }, ({ params }) => whatsapp.encerrarAtendimento(params.id));

  // ---------------------------------------------------------------- Auditoria
  router.get('/api/auditoria', { auth: ['admin'] }, () => store.listar('auditoria').slice(-300).reverse());
  router.get('/api/auditoria/verificar', { auth: ['admin'] }, () => store.verificarAuditoria());

  // ---------------------------------------------------------------- Simuladores (somente dev)
  if (dev) {
    router.post('/api/dev/pagamentos/:id/confirmar-pix', { auth: true }, ({ params }) => pagamentos.simularConfirmacaoPix(params.id));
    router.post('/api/dev/ifood/simular-pedido', { auth: ['admin'] }, async ({ body }) => {
      const itens = Array.isArray(body.itens) && body.itens.length ? body.itens : [{ sku: 'DIP-500-10', quantidade: 2 }, { sku: 'ALC-GEL-500', quantidade: 1 }];
      return ifood.processarEvento(ifood.eventoSimulado(itens));
    });
  }

  // ---------------------------------------------------------------- Handler HTTP
  async function handler(req, res) {
    cabecalhosSeguranca(res, config.isProd);
    const url = new URL(req.url, 'http://localhost');
    const ip = req.socket.remoteAddress || 'desconhecido';
    try {
      if (!limiter.permitir(`geral:${ip}`, 600, 60_000)) throw erro(429, 'Muitas requisições. Aguarde um instante.');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method === 'GET' && servirEstatico(res, pastaPublica, url.pathname)) return;
        throw erro(404, 'Não encontrado');
      }
      const achado = router.encontrar(req.method, url.pathname);
      if (!achado) throw erro(404, 'Rota não encontrada');
      if (achado.metodoInvalido) throw erro(405, 'Método não permitido');
      const { rota, params } = achado;
      const op = rota.opcoes;

      if (op.limite && !limiter.permitir(`${rota.metodo}:${rota.regex}:${ip}`, op.limite.n, op.limite.ms)) throw erro(429, 'Muitas tentativas. Aguarde um instante.');

      const usuario = auth.autenticar(req);
      if (op.auth && !usuario) throw erro(401, 'Autenticação necessária');
      if (Array.isArray(op.auth) && !op.auth.includes(usuario.papel)) throw erro(403, 'Acesso negado');

      let body = {};
      let bruto = Buffer.alloc(0);
      if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
        bruto = await lerCorpo(req, op.corpoMax || config.seguranca.limiteBodyBytes);
        if (!op.bruto && bruto.length) {
          if (!String(req.headers['content-type'] || '').includes('application/json')) throw erro(415, 'Use Content-Type: application/json');
          try { body = JSON.parse(bruto.toString('utf8')); } catch { throw erro(400, 'JSON inválido'); }
          if (body === null || typeof body !== 'object' || Array.isArray(body)) throw erro(400, 'O corpo deve ser um objeto JSON');
        }
      }

      const resultado = await rota.handler({ req, res, params, query: url.searchParams, body, bruto, usuario, ip });
      if (res.headersSent || op.sse) return;
      if (resultado && typeof resultado === 'object' && 'status' in resultado && 'corpo' in resultado) return enviarJson(res, resultado.status, resultado.corpo);
      return enviarJson(res, 200, resultado ?? { ok: true });
    } catch (e) {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof HttpError) return enviarJson(res, e.status, { erro: e.message, detalhes: e.detalhes });
      console.error('[erro interno]', e);
      return enviarJson(res, 500, { erro: 'Erro interno. Tente novamente.' }); // nunca vaza stack trace
    }
  }

  return { handler, store, auth, anvisa, estoque, pedidos, pagamentos, ifood, whatsapp };
}
