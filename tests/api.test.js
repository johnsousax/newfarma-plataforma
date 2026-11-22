import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { criarApp } from '../src/app.js';
import { Store } from '../src/lib/store.js';
import { semear } from '../src/seed.js';
import { config } from '../src/config.js';
import { hmacHex, cifrar, decifrar, assinarToken, verificarToken } from '../src/lib/crypto.js';
import { cpfValido } from '../src/services/auth.js';

let servidor, base, app, senha;
const tokens = {};
const produtos = {};

async function api(metodo, caminho, { token, corpo, headers = {}, bruto } = {}) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { ...(corpo || bruto ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: bruto ?? (corpo ? JSON.stringify(corpo) : undefined),
  });
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, corpo: tipo.includes('json') ? await r.json() : await r.text(), headers: r.headers };
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString('base64');
const ENDERECO = { logradouro: 'Rua das Flores', numero: '10', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', cep: '01001-000' };

before(async () => {
  app = criarApp({ store: new Store(), limiteAuth: { n: 1000, ms: 60_000 } });
  ({ senha } = semear(app.store, app.auth));
  servidor = http.createServer(app.handler).listen(0);
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
  for (const [papel, email] of [['admin', 'admin@farmacia.local'], ['farmaceutico', 'farmaceutico@farmacia.local'], ['cliente', 'cliente@farmacia.local']]) {
    const r = await api('POST', '/api/auth/login', { corpo: { email, senha } });
    assert.equal(r.status, 200);
    tokens[papel] = r.corpo.token;
  }
  for (const p of app.store.listar('produtos')) produtos[p.sku] = p;
});

after(() => servidor.close());

test('criptografia: AES-GCM, JWT e CPF', () => {
  const c = cifrar('123.456.789-09');
  assert.notEqual(c, '123.456.789-09');
  assert.equal(decifrar(c), '123.456.789-09');
  const adulterado = c.slice(0, -4) + (c.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.throws(() => decifrar(adulterado));
  const t = assinarToken({ sub: 'x' });
  assert.equal(verificarToken(t).sub, 'x');
  const [h, p] = t.split('.');
  assert.equal(verificarToken(`${h}.${p}.assinaturafalsa`), null);
  const none = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  assert.equal(verificarToken(`${none}.${p}.`), null);
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('111.111.111-11'), false);
});

test('dados pessoais ficam cifrados no armazenamento', () => {
  const u = app.store.listar('usuarios')[0];
  const bruto = JSON.stringify(u);
  assert.ok(!bruto.includes('@farmacia.local'));
  assert.ok(u.senhaHash.startsWith('scrypt$'));
});

test('cabeçalhos de segurança e catálogo público', async () => {
  const r = await api('GET', '/api/produtos');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const clonazepam = r.corpo.find((p) => p.sku === 'CLN-2-30');
  assert.equal(clonazepam.regulatorio.vendaOnline, false);
  assert.ok(!('lotes' in clonazepam), 'catálogo público não expõe lotes');
});

test('cadastro exige senha forte, CPF válido e consentimento LGPD', async () => {
  const base = { nome: 'Fulano', email: 'fulano@ex.com', senha: 'SenhaForte123', cpf: '529.982.247-25', telefone: '11988887777', consentimentoLgpd: true };
  assert.equal((await api('POST', '/api/auth/registrar', { corpo: { ...base, senha: '123' } })).status, 400);
  assert.equal((await api('POST', '/api/auth/registrar', { corpo: { ...base, cpf: '12345678900' } })).status, 400);
  assert.equal((await api('POST', '/api/auth/registrar', { corpo: { ...base, consentimentoLgpd: false } })).status, 400);
  const ok = await api('POST', '/api/auth/registrar', { corpo: base });
  assert.equal(ok.status, 201);
  assert.equal(ok.corpo.cpfMascarado, '529.***.***-25');
  assert.equal((await api('POST', '/api/auth/registrar', { corpo: base })).status, 409);
});

test('controle de acesso: cliente não acessa estoque; sem token = 401', async () => {
  assert.equal((await api('GET', '/api/estoque')).status, 401);
  assert.equal((await api('GET', '/api/estoque', { token: tokens.cliente })).status, 403);
  assert.equal((await api('GET', '/api/estoque', { token: tokens.farmaceutico })).status, 200);
});

test('ANVISA: venda online de controlado (Portaria 344) é bloqueada', async () => {
  const r = await api('POST', '/api/pedidos', { token: tokens.cliente, corpo: { itens: [{ produtoId: produtos['CLN-2-30'].id, quantidade: 1 }], entrega: { tipo: 'delivery', endereco: ENDERECO } } });
  assert.equal(r.status, 422);
  assert.match(r.corpo.detalhes[0].motivo, /Portaria 344/);
});

test('fluxo completo MIP: pedido → reserva → cartão tokenizado → dispensação FEFO', async () => {
  const dip = produtos['DIP-500-10'];
  const antes = app.estoque.disponivel(dip);
  const r = await api('POST', '/api/pedidos', { token: tokens.cliente, corpo: { itens: [{ produtoId: dip.id, quantidade: 3, preco: 1 }], entrega: { tipo: 'delivery', endereco: ENDERECO } } });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.status, 'AGUARDANDO_PAGAMENTO');
  assert.equal(r.corpo.itens[0].precoUnitario, 899, 'preço vem do servidor, não do cliente');
  assert.equal(app.estoque.disponivel(dip), antes - 3);

  const pan = await api('POST', `/api/pedidos/${r.corpo.id}/pagar`, { token: tokens.cliente, corpo: { metodo: 'cartao', numeroCartao: '4111111111111111' } });
  assert.equal(pan.status, 400, 'servidor recusa número de cartão em claro');

  const pg = await api('POST', `/api/pedidos/${r.corpo.id}/pagar`, { token: tokens.cliente, corpo: { metodo: 'cartao', cartaoToken: 'tok_teste_abcdefgh', bandeira: 'visa', ultimos4: '1111' } });
  assert.equal(pg.corpo.status, 'APROVADO');
  assert.ok(!JSON.stringify(app.store.dados.pagamentos).includes('4111111111111111'));

  const sep = await api('POST', `/api/pedidos/${r.corpo.id}/status`, { token: tokens.farmaceutico, corpo: { status: 'EM_SEPARACAO' } });
  assert.equal(sep.status, 200);
  assert.equal(sep.corpo.dispensacao[0].lotes[0].lote, 'DP2312', 'FEFO: sai primeiro o lote que vence antes');
});

test('antimicrobiano: exige receita validada por farmacêutico antes do pagamento e gera escrituração', async () => {
  const amx = produtos['AMX-500-21'];
  const r = await api('POST', '/api/pedidos', { token: tokens.cliente, corpo: { itens: [{ produtoId: amx.id, quantidade: 1 }], entrega: { tipo: 'retirada' } } });
  assert.equal(r.corpo.status, 'AGUARDANDO_RECEITA');
  assert.equal(r.corpo.coletarReceitaNaEntrega, true);

  const semReceita = await api('POST', `/api/pedidos/${r.corpo.id}/pagar`, { token: tokens.cliente, corpo: { metodo: 'pix' } });
  assert.equal(semReceita.status, 409);

  const falsa = await api('POST', `/api/pedidos/${r.corpo.id}/receitas`, { token: tokens.cliente, corpo: { arquivoBase64: Buffer.alloc(200, 7).toString('base64'), tipoArquivo: 'image/png', nomePrescritor: 'Dr. X', registroPrescritor: 'CRM-SP 123456', dataEmissao: new Date().toISOString() } });
  assert.equal(falsa.status, 400, 'valida assinatura (magic bytes) do arquivo');

  const rec = await api('POST', `/api/pedidos/${r.corpo.id}/receitas`, { token: tokens.cliente, corpo: { arquivoBase64: PNG, tipoArquivo: 'image/png', nomePrescritor: 'Dr. João', registroPrescritor: 'CRM-SP 123456', dataEmissao: new Date().toISOString() } });
  assert.equal(rec.status, 201);

  assert.equal((await api('POST', `/api/receitas/${rec.corpo.id}/avaliar`, { token: tokens.admin, corpo: { aprovada: true } })).status, 403, 'admin sem CRF não aprova');
  const av = await api('POST', `/api/receitas/${rec.corpo.id}/avaliar`, { token: tokens.farmaceutico, corpo: { aprovada: true } });
  assert.equal(av.corpo.status, 'APROVADA');

  const ped = await api('GET', `/api/pedidos/${r.corpo.id}`, { token: tokens.cliente });
  assert.equal(ped.corpo.status, 'AGUARDANDO_PAGAMENTO');

  const pix = await api('POST', `/api/pedidos/${r.corpo.id}/pagar`, { token: tokens.cliente, corpo: { metodo: 'pix' } });
  assert.equal(pix.corpo.status, 'PENDENTE');

  // webhook com assinatura inválida é rejeitado
  const corpo = JSON.stringify({ gatewayId: pix.corpo.gatewayId, status: 'APROVADO', valor: pix.corpo.valor });
  assert.equal((await api('POST', '/api/webhooks/pagamento', { bruto: corpo, headers: { 'x-gateway-signature': 'abc' } })).status, 401);
  const ok = await api('POST', '/api/webhooks/pagamento', { bruto: corpo, headers: { 'x-gateway-signature': hmacHex(config.pagamento.segredoWebhook, corpo) } });
  assert.equal(ok.status, 200);

  await api('POST', `/api/pedidos/${r.corpo.id}/status`, { token: tokens.farmaceutico, corpo: { status: 'EM_SEPARACAO' } });
  const esc = await api('GET', '/api/anvisa/escrituracao', { token: tokens.farmaceutico });
  assert.equal(esc.corpo[0].principioAtivo, 'amoxicilina');
  assert.equal(esc.corpo[0].crfFarmaceutico, 'CRF-SP 12345');
});

test('IDOR: cliente não vê pedido de outro cliente', async () => {
  const outro = await api('POST', '/api/auth/registrar', { corpo: { nome: 'Outro', email: 'outro@ex.com', senha: 'OutraSenha123', cpf: '111.444.777-35', telefone: '11977776666', consentimentoLgpd: true } });
  assert.equal(outro.status, 201);
  const login = await api('POST', '/api/auth/login', { corpo: { email: 'outro@ex.com', senha: 'OutraSenha123' } });
  const meu = app.store.listar('pedidos')[0];
  assert.equal((await api('GET', `/api/pedidos/${meu.id}`, { token: login.corpo.token })).status, 404);
});

test('estoque: alerta de reposição em tempo real e bloqueio por falta', async () => {
  const vit = produtos['VTC-1G-10'];
  app.estoque.verificarAlertas(vit);
  const alertas = await api('GET', '/api/estoque/alertas', { token: tokens.farmaceutico });
  assert.ok(alertas.corpo.some((a) => a.produtoId === vit.id && a.tipo === 'REPOSICAO'), 'gera alerta de reposição');
  const falta = await api('POST', '/api/pedidos', { token: tokens.cliente, corpo: { itens: [{ produtoId: vit.id, quantidade: 10 }], entrega: { tipo: 'retirada' } } });
  assert.equal(falta.status, 409);
  const ent = await api('POST', `/api/estoque/${vit.id}/entrada`, { token: tokens.farmaceutico, corpo: { lote: 'VC9999', validade: '2099-01-01', quantidade: 100, notaFiscal: 'NF 123' } });
  assert.equal(ent.corpo.situacao, 'DISPONIVEL');
  assert.ok(!app.store.encontrar('alertas', (a) => a.produtoId === vit.id && a.tipo === 'REPOSICAO' && !a.resolvido), 'alerta resolvido após reposição');
  const vencido = await api('POST', `/api/estoque/${vit.id}/entrada`, { token: tokens.farmaceutico, corpo: { lote: 'VELHO', validade: '2000-01-01', quantidade: 1 } });
  assert.equal(vencido.status, 422);
});

test('iFood: pedido simulado com MIP é aceito; com tarja vermelha é recusado', async () => {
  const ok = await api('POST', '/api/dev/ifood/simular-pedido', { token: tokens.admin, corpo: { itens: [{ sku: 'LOR-10-12', quantidade: 1 }] } });
  assert.equal(ok.corpo.aceito, true);
  const bloq = await api('POST', '/api/dev/ifood/simular-pedido', { token: tokens.admin, corpo: { itens: [{ sku: 'LOS-50-30', quantidade: 1 }] } });
  assert.equal(bloq.corpo.aceito, false);
  const sync = await api('POST', '/api/ifood/sincronizar-catalogo', { token: tokens.admin });
  assert.ok(sync.corpo.bloqueados.some((b) => b.sku === 'CLN-2-30'));
  assert.ok(!sync.corpo.itens.some((i) => i.externalCode === 'AMX-500-21'));
  const corpo = JSON.stringify({ id: 'x', code: 'PLC' });
  assert.equal((await api('POST', '/api/webhooks/ifood', { bruto: corpo, headers: { 'x-ifood-signature': 'errada' } })).status, 401);
});

test('WhatsApp: menu, busca, status, triagem clínica e webhook assinado', async () => {
  const chat = (mensagem) => api('POST', '/api/atendimento/chat', { token: tokens.cliente, corpo: { mensagem } });
  assert.match((await chat('oi')).corpo.resposta, /Como posso ajudar/);
  assert.match((await chat('buscar dipirona')).corpo.resposta, /Dipirona/);
  assert.match((await chat('buscar clonazepam')).corpo.resposta, /Somente na loja/);
  assert.match((await chat('meus pedidos')).corpo.resposta, /Pedido/);
  assert.match((await chat('posso tomar dipirona grávida?')).corpo.resposta, /farmacêutico/);
  assert.match((await chat('menu')).corpo.resposta, /Como posso ajudar/);
  assert.match((await chat('estou com dor no peito')).corpo.resposta, /192/);

  const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '5511999990000', type: 'text', text: { body: 'horario' } }] } }] }] });
  assert.equal((await api('POST', '/api/webhooks/whatsapp', { bruto: corpo, headers: { 'x-hub-signature-256': 'sha256=000' } })).status, 401);
  const ok = await api('POST', '/api/webhooks/whatsapp', { bruto: corpo, headers: { 'x-hub-signature-256': 'sha256=' + hmacHex(config.whatsapp.appSecret, corpo) } });
  assert.equal(ok.corpo.processadas, 1);
});

test('login: bloqueio após tentativas falhas e logout revoga token', async () => {
  for (let i = 0; i < 5; i++) await api('POST', '/api/auth/login', { corpo: { email: 'outro@ex.com', senha: 'errada' } });
  const bloq = await api('POST', '/api/auth/login', { corpo: { email: 'outro@ex.com', senha: 'OutraSenha123' } });
  assert.equal(bloq.status, 423, 'conta bloqueada mesmo com a senha correta');
  const r = await api('POST', '/api/auth/registrar', { corpo: { nome: 'Tmp', email: 'tmp@ex.com', senha: 'SenhaTemp1234', cpf: '935.411.347-80', telefone: '11966665555', consentimentoLgpd: true } });
  assert.equal(r.status, 201);
  const l = await api('POST', '/api/auth/login', { corpo: { email: 'tmp@ex.com', senha: 'SenhaTemp1234' } });
  assert.equal((await api('GET', '/api/auth/eu', { token: l.corpo.token })).status, 200);
  await api('POST', '/api/auth/logout', { token: l.corpo.token });
  assert.equal((await api('GET', '/api/auth/eu', { token: l.corpo.token })).status, 401);
});

test('auditoria encadeada por hash detecta adulteração', async () => {
  const v = await api('GET', '/api/auditoria/verificar', { token: tokens.admin });
  assert.equal(v.corpo.integra, true);
  app.store.dados.auditoria[1].acao = 'adulterado';
  assert.equal(app.store.verificarAuditoria().integra, false);
});

test('rate limit: excesso de tentativas de login retorna 429', async () => {
  const app2 = criarApp({ store: new Store() });
  const srv = http.createServer(app2.handler).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}/api/auth/login`;
  const codigos = [];
  for (let i = 0; i < 12; i++) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@x.com', senha: 'y' }) });
    codigos.push(r.status);
  }
  srv.close();
  assert.equal(codigos.at(-1), 429);
});
