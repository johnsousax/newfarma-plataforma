// Farmácia Online — SPA em JavaScript puro.
// Segurança: nenhum HTML é montado a partir de dados (sem innerHTML) → imune a XSS por injeção;
// token fica em sessionStorage e é enviado só no cabeçalho Authorization (imune a CSRF).

const $app = document.getElementById('app');
const estado = {
  token: sessionStorage.getItem('token'),
  usuario: null,
  carrinho: JSON.parse(localStorage.getItem('carrinho') || '[]'),
  farmacia: null,
};
let limpezas = [];
const EQUIPE = ['farmaceutico', 'admin'];

// ---------------------------------------------------------------- utilidades
function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'style') el.style.cssText = v; // CSSOM é permitido pela CSP (atributo style não)
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso) => new Date(iso).toLocaleString('pt-BR');

function toast(msg, erro = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'mostrar' + (erro ? ' erro' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = ''), 3500);
}

async function api(metodo, caminho, corpo) {
  const r = await fetch(caminho, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(estado.token ? { Authorization: `Bearer ${estado.token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (r.status === 401 && estado.token && !caminho.includes('/auth/login')) { sair(false); toast('Sessão expirada. Entre novamente.', true); }
  if (!r.ok) { const e = new Error(dados?.erro || `Erro ${r.status}`); e.detalhes = dados?.detalhes; e.status = r.status; throw e; }
  return dados;
}

function erroComDetalhes(e) {
  return h('div', { class: 'alerta erro' }, e.message, Array.isArray(e.detalhes) ? h('ul', {}, e.detalhes.map((d) => h('li', {}, `${d.produto}: ${d.motivo}`))) : null);
}

const salvarCarrinho = () => { localStorage.setItem('carrinho', JSON.stringify(estado.carrinho)); renderMenu(); };
const ehEquipe = () => EQUIPE.includes(estado.usuario?.papel);

function campo(rotulo, attrs) { return h('div', {}, h('label', { for: attrs.id }, rotulo), h('input', attrs)); }
function selo(reg) { return h('span', { class: `selo ${reg.classificacao}` }, reg.rotulo); }

// ---------------------------------------------------------------- sessão
async function carregarSessao() {
  if (!estado.token) return;
  try { estado.usuario = await api('GET', '/api/auth/eu'); } catch { estado.token = null; sessionStorage.removeItem('token'); }
}

async function sair(chamarApi = true) {
  if (chamarApi) await api('POST', '/api/auth/logout').catch(() => {});
  estado.token = null; estado.usuario = null;
  sessionStorage.removeItem('token');
  location.hash = '#/catalogo';
  renderMenu();
}

function renderMenu() {
  const nav = document.getElementById('menu');
  const rota = location.hash.split('/')[1] || 'catalogo';
  const qtd = estado.carrinho.reduce((s, i) => s + i.quantidade, 0);
  const link = (id, texto) => h('a', { href: `#/${id}`, class: rota === id ? 'ativo' : '' }, texto);
  nav.replaceChildren(...[
    link('catalogo', 'Catálogo'),
    link('carrinho', `🛒 Carrinho${qtd ? ` (${qtd})` : ''}`),
    estado.usuario ? link('pedidos', 'Meus pedidos') : null,
    link('atendimento', '💬 Atendimento'),
    ehEquipe() ? link('painel', '⚙️ Painel') : null,
    estado.usuario ? h('button', { onclick: () => sair() }, `Sair (${estado.usuario.nome.split(' ')[0]})`) : link('entrar', 'Entrar'),
  ].filter(Boolean));
}

function renderRodape() {
  const f = estado.farmacia;
  if (!f) return;
  document.getElementById('nome-farmacia').textContent = f.nome;
  document.title = f.nome;
  document.getElementById('rodape').replaceChildren(
    h('div', {}, h('strong', {}, f.nome), ` — CNPJ ${f.cnpj} · AFE/ANVISA ${f.afe}`),
    h('div', {}, `Farmacêutico(a) responsável: ${f.responsavelTecnico} — ${f.crf}`),
    h('div', {}, f.horario),
    h('div', {}, f.aviso),
    h('div', {}, 'Medicamentos controlados (Portaria 344/98) não são vendidos pela internet. Dados protegidos conforme a LGPD (Lei 13.709/2018).'),
  );
}

// ---------------------------------------------------------------- catálogo
async function viewCatalogo() {
  const busca = h('input', { type: 'search', placeholder: 'Buscar por nome ou princípio ativo…', 'aria-label': 'Buscar' });
  const cat = h('select', { 'aria-label': 'Categoria' }, h('option', { value: '' }, 'Todas as categorias'));
  const grade = h('div', { class: 'grade' });
  $app.replaceChildren(h('h1', {}, 'Catálogo'), h('div', { class: 'barra' }, busca, cat), grade);

  (await api('GET', '/api/categorias')).forEach((c) => cat.append(h('option', { value: c }, c)));

  async function carregar() {
    const params = new URLSearchParams({ q: busca.value, categoria: cat.value });
    const lista = await api('GET', `/api/produtos?${params}`);
    grade.replaceChildren(...(lista.length ? lista.map(cartaoProduto) : [h('p', { class: 'vazio' }, 'Nenhum produto encontrado.')]));
  }
  let t;
  busca.addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 250); });
  cat.addEventListener('change', carregar);
  await carregar();
}

function cartaoProduto(p) {
  const r = p.regulatorio;
  let botao;
  if (!r.vendaOnline) botao = h('button', { class: 'btn sec', disabled: true }, '🏪 Somente na loja');
  else if (p.disponivel === 0) botao = h('button', { class: 'btn', disabled: true }, 'Indisponível');
  else botao = h('button', { class: 'btn', onclick: () => adicionar(p) }, 'Adicionar');
  const textoEstoque = { DISPONIVEL: `Em estoque (${p.disponivel})`, BAIXO: `Últimas ${p.disponivel} unidades`, ESGOTADO: 'Esgotado' }[p.situacao];
  return h('article', { class: 'cartao' },
    h('div', { class: 'icone', 'aria-hidden': 'true' }, p.icone),
    h('div', {}, selo(r)),
    h('h3', {}, p.nome),
    p.principioAtivo ? h('div', { class: 'aviso' }, `Princípio ativo: ${p.principioAtivo}`) : null,
    h('div', { class: 'desc' }, p.descricao),
    r.exigeReceita && r.vendaOnline ? h('div', { class: 'alerta atencao' }, r.retencaoReceita ? '📄 Exige receita; a 2ª via é recolhida na entrega.' : '📄 Exige envio da receita médica.') : null,
    !r.vendaOnline ? h('div', { class: 'alerta erro' }, 'Venda proibida pela internet. Retire na loja com a receita original.') : null,
    h('div', { class: 'preco' }, brl(p.preco)),
    h('div', { class: `estoque ${p.situacao}` }, textoEstoque),
    r.registroAnvisa ? h('div', { class: 'aviso' }, `Reg. ANVISA ${r.registroAnvisa}`) : null,
    r.aviso ? h('div', { class: 'aviso' }, r.aviso) : null,
    botao,
  );
}

function adicionar(p) {
  const item = estado.carrinho.find((i) => i.produtoId === p.id);
  if (item) item.quantidade = Math.min(item.quantidade + 1, Math.min(20, p.disponivel));
  else estado.carrinho.push({ produtoId: p.id, nome: p.nome, preco: p.preco, icone: p.icone, quantidade: 1, exigeReceita: p.regulatorio.exigeReceita });
  salvarCarrinho();
  toast(`${p.nome} adicionado ao carrinho`);
}

// ---------------------------------------------------------------- carrinho / checkout
function viewCarrinho() {
  if (!estado.carrinho.length) {
    $app.replaceChildren(h('h1', {}, 'Carrinho'), h('p', { class: 'vazio' }, 'Seu carrinho está vazio. ', h('a', { href: '#/catalogo' }, 'Ver catálogo')));
    return;
  }
  const subtotal = estado.carrinho.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const tipo = h('select', { id: 'tipo-entrega' }, h('option', { value: 'delivery' }, '🛵 Entrega (logística iFood)'), h('option', { value: 'retirada' }, '🏪 Retirar na loja'));
  const end = {
    cep: h('input', { id: 'cep', placeholder: '00000-000', inputmode: 'numeric', maxlength: 9, autocomplete: 'postal-code' }),
    logradouro: h('input', { id: 'log', autocomplete: 'address-line1' }), numero: h('input', { id: 'num' }),
    complemento: h('input', { id: 'comp' }), bairro: h('input', { id: 'bairro' }), cidade: h('input', { id: 'cidade', autocomplete: 'address-level2' }),
    uf: h('input', { id: 'uf', maxlength: 2 }),
  };
  const blocoEndereco = h('div', {},
    h('div', { class: 'grid2' }, campoEl('CEP', end.cep), campoEl('Número', end.numero)),
    campoEl('Logradouro', end.logradouro), campoEl('Complemento', end.complemento),
    h('div', { class: 'grid2' }, campoEl('Bairro', end.bairro), campoEl('Cidade', end.cidade)), campoEl('UF', end.uf));
  const frete = h('span');
  const total = h('span', { class: 'total' });
  const msg = h('div');
  const atualizar = () => {
    const f = tipo.value === 'delivery' && subtotal < 10000 ? 790 : 0;
    frete.textContent = f ? brl(f) : 'Grátis';
    total.textContent = brl(subtotal + f);
    blocoEndereco.hidden = tipo.value !== 'delivery';
  };
  tipo.addEventListener('change', atualizar);

  const linhas = estado.carrinho.map((i) => {
    const q = h('input', { type: 'number', min: 1, max: 20, value: i.quantidade, 'aria-label': 'Quantidade' });
    q.addEventListener('change', () => { i.quantidade = Math.max(1, Math.min(20, Number(q.value) || 1)); salvarCarrinho(); viewCarrinho(); });
    return h('div', { class: 'linha' },
      h('div', {}, `${i.icone} ${i.nome}`, i.exigeReceita ? h('div', { class: 'aviso' }, '📄 exige receita') : null),
      h('div', { class: 'qtd' }, q, h('strong', {}, brl(i.preco * i.quantidade)),
        h('button', { class: 'btn sec peq', onclick: () => { estado.carrinho = estado.carrinho.filter((x) => x !== i); salvarCarrinho(); viewCarrinho(); } }, 'Remover')));
  });

  async function finalizar(ev) {
    ev.target.disabled = true;
    msg.replaceChildren();
    if (!estado.usuario) { sessionStorage.setItem('voltarPara', '#/carrinho'); location.hash = '#/entrar'; return; }
    try {
      const entrega = { tipo: tipo.value };
      if (tipo.value === 'delivery') entrega.endereco = Object.fromEntries(Object.entries(end).map(([k, el]) => [k, el.value]));
      const pedido = await api('POST', '/api/pedidos', { itens: estado.carrinho.map(({ produtoId, quantidade }) => ({ produtoId, quantidade })), entrega });
      estado.carrinho = [];
      salvarCarrinho();
      toast(`Pedido ${pedido.numero} criado!`);
      location.hash = `#/pedido/${pedido.id}`;
    } catch (e) { msg.replaceChildren(erroComDetalhes(e)); ev.target.disabled = false; }
  }

  $app.replaceChildren(h('h1', {}, 'Carrinho'), h('div', { class: 'dois' },
    h('div', { class: 'painel' }, linhas,
      estado.carrinho.some((i) => i.exigeReceita) ? h('div', { class: 'alerta info' }, 'Seu pedido contém medicamentos com prescrição: após finalizar, envie a foto da receita. Um farmacêutico vai validá-la antes do pagamento.') : null),
    h('div', { class: 'painel' },
      h('h2', {}, 'Entrega'), tipo, blocoEndereco,
      h('div', { class: 'linha' }, 'Subtotal', h('span', {}, brl(subtotal))),
      h('div', { class: 'linha' }, 'Frete', frete),
      h('div', { class: 'linha' }, 'Total', total),
      msg,
      h('button', { class: 'btn', style: 'width:100%', onclick: finalizar }, estado.usuario ? 'Finalizar pedido' : 'Entrar para finalizar'),
      h('p', { class: 'aviso' }, 'Preços e disponibilidade são confirmados pelo servidor no momento do pedido.'))));
  atualizar();
}
function campoEl(rotulo, el) { return h('div', {}, h('label', { for: el.id }, rotulo), el); }

// ---------------------------------------------------------------- pedidos
async function viewPedidos() {
  if (!estado.usuario) { location.hash = '#/entrar'; return; }
  const lista = await api('GET', '/api/pedidos');
  $app.replaceChildren(h('h1', {}, 'Meus pedidos'),
    lista.length ? h('div', { class: 'painel' }, lista.map((p) => h('div', { class: 'linha' },
      h('div', {}, h('strong', {}, `Pedido ${p.numero}`), h('div', { class: 'aviso' }, `${dataBR(p.criadoEm)} · ${p.itens.length} item(ns) · canal ${p.canal}`)),
      h('span', { class: `status ${p.status}` }, p.statusDescricao),
      h('strong', {}, brl(p.total)),
      h('a', { class: 'btn sec peq', href: `#/pedido/${p.id}` }, 'Detalhes'))))
      : h('p', { class: 'vazio' }, 'Você ainda não fez pedidos.'));
}

async function viewPedido(id) {
  const p = await api('GET', `/api/pedidos/${id}`);
  const acoes = h('div');
  if (p.status === 'AGUARDANDO_RECEITA') acoes.append(blocoReceita(p));
  if (p.status === 'AGUARDANDO_PAGAMENTO') acoes.append(blocoPagamento(p));
  const cancelavel = ['AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO'].includes(p.status);

  $app.replaceChildren(
    h('h1', {}, `Pedido ${p.numero} `, h('span', { class: `status ${p.status}` }, `— ${p.statusDescricao}`)),
    h('div', { class: 'dois' },
      h('div', {},
        acoes,
        h('div', { class: 'painel' }, h('h2', {}, 'Itens'),
          p.itens.map((i) => h('div', { class: 'linha' }, h('span', {}, `${i.quantidade}× ${i.nome}`), h('span', {}, brl(i.subtotal)))),
          h('div', { class: 'linha' }, 'Frete', h('span', {}, p.taxaEntrega ? brl(p.taxaEntrega) : 'Grátis')),
          h('div', { class: 'linha total' }, 'Total', h('span', {}, brl(p.total))))),
      h('div', {},
        h('div', { class: 'painel' }, h('h2', {}, 'Entrega'),
          p.entrega.tipo === 'retirada' ? h('p', {}, '🏪 Retirada na loja') : h('p', {}, '🛵 Entrega via iFood', p.entrega.endereco ? h('div', { class: 'aviso' }, `${p.entrega.endereco.logradouro}, ${p.entrega.endereco.numero} — ${p.entrega.endereco.bairro || ''} ${p.entrega.endereco.cidade || ''}`) : null),
          p.coletarReceitaNaEntrega ? h('div', { class: 'alerta atencao' }, 'Tenha em mãos a 2ª via da receita: ela será recolhida na entrega/retirada (RDC 471/2021).') : null),
        h('div', { class: 'painel' }, h('h2', {}, 'Acompanhamento'),
          h('ul', { class: 'linha-tempo' }, p.historico.map((x) => h('li', {}, h('strong', {}, x.status.replaceAll('_', ' ').toLowerCase()), h('div', { class: 'aviso' }, dataBR(x.em), x.obs ? ` — ${x.obs}` : ''))))),
        cancelavel ? h('button', { class: 'btn perigo', onclick: async () => { if (!confirm('Cancelar este pedido?')) return; await api('POST', `/api/pedidos/${p.id}/cancelar`, { motivo: 'Cancelado pelo cliente' }); toast('Pedido cancelado'); viewPedido(id); } }, 'Cancelar pedido') : null)));

  // Atualiza o status automaticamente enquanto a tela estiver aberta
  if (!['ENTREGUE', 'CANCELADO'].includes(p.status)) {
    const t = setInterval(async () => {
      const atual = await api('GET', `/api/pedidos/${id}`).catch(() => null);
      if (atual && atual.status !== p.status) { toast(`Pedido ${p.numero}: ${atual.statusDescricao}`); viewPedido(id); }
    }, 5000);
    limpezas.push(() => clearInterval(t));
  }
}

function blocoReceita(p) {
  const pendente = p.receitas.find((r) => r.status === 'PENDENTE');
  const rejeitadas = p.receitas.filter((r) => r.status === 'REJEITADA');
  const box = h('div', { class: 'painel' }, h('h2', {}, '📄 Envio da receita'));
  rejeitadas.forEach((r) => box.append(h('div', { class: 'alerta erro' }, `Receita rejeitada pelo farmacêutico${r.avaliacao?.observacao ? `: ${r.avaliacao.observacao}` : ''}. Envie novamente.`)));
  if (pendente) { box.append(h('div', { class: 'alerta info' }, '⏳ Receita recebida. Aguardando validação do farmacêutico — você será avisado por WhatsApp.')); return box; }

  const arquivo = h('input', { id: 'arq', type: 'file', accept: 'image/jpeg,image/png,application/pdf' });
  const nome = h('input', { id: 'presc', placeholder: 'Nome do médico/dentista' });
  const reg = h('input', { id: 'crm', placeholder: 'CRM-SP 123456' });
  const data = h('input', { id: 'dt', type: 'date', max: new Date().toISOString().slice(0, 10) });
  const msg = h('div');
  const enviar = h('button', { class: 'btn' }, 'Enviar receita');
  enviar.addEventListener('click', async () => {
    msg.replaceChildren();
    const f = arquivo.files[0];
    if (!f) return msg.replaceChildren(h('div', { class: 'alerta erro' }, 'Selecione o arquivo da receita.'));
    if (f.size > 2_800_000) return msg.replaceChildren(h('div', { class: 'alerta erro' }, 'Arquivo muito grande (máx. 2,8 MB).'));
    enviar.disabled = true;
    try {
      const base64 = await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = falha; r.readAsDataURL(f); });
      await api('POST', `/api/pedidos/${p.id}/receitas`, { arquivoBase64: base64, tipoArquivo: f.type, nomePrescritor: nome.value, registroPrescritor: reg.value, dataEmissao: data.value });
      toast('Receita enviada para validação');
      viewPedido(p.id);
    } catch (e) { msg.replaceChildren(erroComDetalhes(e)); enviar.disabled = false; }
  });
  box.append(
    h('p', { class: 'aviso' }, 'A receita é um dado de saúde: é armazenada criptografada e acessada apenas pelo farmacêutico. Antimicrobianos: validade de 10 dias a partir da emissão.'),
    campoEl('Foto ou PDF da receita', arquivo), campoEl('Prescritor', nome), h('div', { class: 'grid2' }, campoEl('Registro (CRM/CRO)', reg), campoEl('Data de emissão', data)),
    msg, enviar);
  return box;
}

// "SDK" simulado do gateway: tokeniza o cartão NO NAVEGADOR. O número/CVV nunca vão ao nosso servidor.
const GatewaySimulado = {
  luhn(n) { let s = 0; let alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = Number(n[i]); if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return s % 10 === 0; },
  bandeira(n) { return /^4/.test(n) ? 'visa' : /^5[1-5]/.test(n) ? 'mastercard' : /^3[47]/.test(n) ? 'amex' : /^(636368|438935|504175|451416|636297|5067|4576|4011)/.test(n) ? 'elo' : 'outra'; },
  async tokenizar({ numero, validade, cvv }) {
    const n = numero.replace(/\D/g, '');
    if (n.length < 13 || !this.luhn(n)) throw new Error('Número de cartão inválido');
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(validade)) throw new Error('Validade inválida (MM/AA)');
    if (!/^\d{3,4}$/.test(cvv)) throw new Error('CVV inválido');
    const aleatorio = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijklmnopqrstuvwxyz'[b % 26]).join('');
    return { token: `tok_${n.endsWith('0002') ? 'recusado_' : ''}${aleatorio}`, bandeira: this.bandeira(n), ultimos4: n.slice(-4) };
  },
};

function blocoPagamento(p) {
  const box = h('div', { class: 'painel' }, h('h2', {}, '💳 Pagamento'));
  const conteudo = h('div');
  const abaCartao = h('button', { class: 'ativo' }, 'Cartão');
  const abaPix = h('button', {}, 'PIX');
  const abas = h('div', { class: 'abas' }, abaCartao, abaPix);
  const msg = h('div');

  function formCartao() {
    abaCartao.className = 'ativo'; abaPix.className = '';
    const numero = h('input', { id: 'cc', inputmode: 'numeric', autocomplete: 'cc-number', placeholder: '4111 1111 1111 1111' });
    const nome = h('input', { id: 'ccn', autocomplete: 'cc-name', placeholder: 'Como impresso no cartão' });
    const val = h('input', { id: 'ccv', autocomplete: 'cc-exp', placeholder: 'MM/AA', maxlength: 5 });
    const cvv = h('input', { id: 'cvv', autocomplete: 'cc-csc', inputmode: 'numeric', maxlength: 4, type: 'password' });
    const parcelas = h('select', { id: 'parc' }, [1, 2, 3, 4, 5, 6].map((n) => h('option', { value: n }, `${n}× de ${brl(Math.ceil(p.total / n))}`)));
    const pagar = h('button', { class: 'btn', style: 'width:100%;margin-top:12px' }, `Pagar ${brl(p.total)}`);
    pagar.addEventListener('click', async () => {
      msg.replaceChildren(); pagar.disabled = true;
      try {
        const t = await GatewaySimulado.tokenizar({ numero: numero.value, validade: val.value, cvv: cvv.value });
        numero.value = ''; cvv.value = '';
        const pg = await api('POST', `/api/pedidos/${p.id}/pagar`, { metodo: 'cartao', cartaoToken: t.token, bandeira: t.bandeira, ultimos4: t.ultimos4, parcelas: Number(parcelas.value) });
        if (pg.status === 'APROVADO') { toast('Pagamento aprovado! ✅'); viewPedido(p.id); }
        else { msg.replaceChildren(h('div', { class: 'alerta erro' }, 'Pagamento recusado pela operadora. Tente outro cartão.')); pagar.disabled = false; }
      } catch (e) { msg.replaceChildren(erroComDetalhes(e)); pagar.disabled = false; }
    });
    conteudo.replaceChildren(h('div', { class: 'cartao-mock' }, campoEl('Número do cartão', numero), campoEl('Nome', nome), h('div', { class: 'grid2' }, campoEl('Validade', val), campoEl('CVV', cvv))),
      campoEl('Parcelas', parcelas),
      h('p', { class: 'aviso' }, '🔒 Os dados do cartão são tokenizados no seu navegador pelo gateway de pagamento e nunca são enviados ou armazenados pela farmácia (PCI-DSS). Teste: 4111 1111 1111 1111 (aprova) ou 4000 0000 0000 0002 (recusa).'),
      msg, pagar);
  }

  async function formPix() {
    abaPix.className = 'ativo'; abaCartao.className = '';
    conteudo.replaceChildren(h('p', {}, 'Gerando cobrança PIX…'));
    try {
      const pg = await api('POST', `/api/pedidos/${p.id}/pagar`, { metodo: 'pix' });
      if (pg.metodo !== 'pix') { conteudo.replaceChildren(h('div', { class: 'alerta info' }, `Já existe um pagamento ${pg.status.toLowerCase()} para este pedido.`)); return; }
      const copiar = h('button', { class: 'btn sec peq', onclick: () => navigator.clipboard?.writeText(pg.pix.copiaECola).then(() => toast('Código copiado')) }, 'Copiar código');
      const simular = h('button', { class: 'btn peq', onclick: async () => { await api('POST', `/api/dev/pagamentos/${pg.id}/confirmar-pix`); toast('PIX confirmado (simulação)'); viewPedido(p.id); } }, '⚡ Simular pagamento (ambiente de teste)');
      conteudo.replaceChildren(h('p', {}, `Valor: `, h('strong', {}, brl(pg.valor)), ` · expira em ${dataBR(pg.pix.expiraEm)}`),
        h('div', { class: 'mono' }, pg.pix.copiaECola), h('div', { class: 'barra', style: 'margin-top:10px' }, copiar, simular),
        h('p', { class: 'aviso' }, 'A confirmação chega por webhook assinado do banco/gateway.'));
    } catch (e) { conteudo.replaceChildren(erroComDetalhes(e)); }
  }

  abaCartao.addEventListener('click', formCartao);
  abaPix.addEventListener('click', formPix);
  formCartao();
  box.append(abas, conteudo);
  return box;
}

// ---------------------------------------------------------------- atendimento (simulador WhatsApp)
function viewAtendimento() {
  if (!estado.usuario) {
    $app.replaceChildren(h('h1', {}, 'Atendimento'), h('div', { class: 'painel' },
      h('p', {}, 'Atendimento 24h pelo WhatsApp: consulte preços, acompanhe pedidos e fale com o farmacêutico.'),
      h('p', {}, h('a', { href: '#/entrar' }, 'Entre na sua conta'), ' para testar o assistente aqui no app (simula a conversa do WhatsApp com o número cadastrado).')));
    return;
  }
  const msgs = h('div', { class: 'chat-msgs' });
  const entrada = h('input', { placeholder: 'Digite uma mensagem', 'aria-label': 'Mensagem', autocomplete: 'off' });
  const add = (de, texto) => { msgs.append(h('div', { class: `msg ${de}` }, texto)); msgs.scrollTop = msgs.scrollHeight; };
  async function enviar(texto) {
    if (!texto.trim()) return;
    add('cliente', texto);
    entrada.value = '';
    try { add('bot', (await api('POST', '/api/atendimento/chat', { mensagem: texto })).resposta); } catch (e) { add('bot', `⚠️ ${e.message}`); }
  }
  const form = h('form', {}, entrada, h('button', { class: 'btn', type: 'submit' }, 'Enviar'));
  form.addEventListener('submit', (e) => { e.preventDefault(); enviar(entrada.value); });
  const sugestoes = ['menu', 'buscar dipirona', 'meus pedidos', 'horário', 'receita', 'falar com farmacêutico'];
  $app.replaceChildren(h('h1', {}, 'Atendimento via WhatsApp'),
    h('div', { class: 'dois' },
      h('div', { class: 'chat' }, h('div', { class: 'chat-topo' }, `🟢 ${estado.farmacia?.nome || 'Farmácia'} — assistente virtual`), msgs,
        h('div', { class: 'sugestoes' }, sugestoes.map((s) => h('button', { type: 'button', onclick: () => enviar(s) }, s))), form),
      h('div', { class: 'painel' }, h('h2', {}, 'Como funciona'),
        h('p', {}, 'Este é o mesmo motor que responde no WhatsApp Business (Cloud API). Você é identificado pelo telefone cadastrado.'),
        h('ul', {}, h('li', {}, 'Consulta de preços e estoque'), h('li', {}, 'Status e cancelamento de pedidos'), h('li', {}, 'Orientações sobre receitas'), h('li', {}, 'Transferência para farmacêutico')),
        h('div', { class: 'alerta atencao' }, 'O assistente não indica medicamentos nem doses: essas dúvidas são encaminhadas ao farmacêutico. Em emergência, ligue 192 (SAMU).'))));
  enviar('oi');
}

// ---------------------------------------------------------------- login / cadastro
function viewEntrar() {
  const email = h('input', { id: 'em', type: 'email', autocomplete: 'username', required: true });
  const senha = h('input', { id: 'se', type: 'password', autocomplete: 'current-password', required: true });
  const msg = h('div');
  const form = h('form', { class: 'painel form-estreito' }, h('h1', {}, 'Entrar'), campoEl('E-mail', email), campoEl('Senha', senha), msg,
    h('button', { class: 'btn', type: 'submit', style: 'width:100%;margin-top:12px' }, 'Entrar'),
    h('p', {}, 'Não tem conta? ', h('a', { href: '#/cadastro' }, 'Cadastre-se')),
    h('p', { class: 'aviso' }, 'Demonstração: admin@farmacia.local, farmaceutico@farmacia.local ou cliente@farmacia.local — a senha é exibida no terminal ao iniciar o servidor.'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.replaceChildren();
    try {
      const r = await api('POST', '/api/auth/login', { email: email.value, senha: senha.value });
      estado.token = r.token; estado.usuario = r.usuario;
      sessionStorage.setItem('token', r.token);
      toast(`Bem-vindo(a), ${r.usuario.nome.split(' ')[0]}!`);
      const voltar = sessionStorage.getItem('voltarPara'); sessionStorage.removeItem('voltarPara');
      location.hash = voltar || (EQUIPE.includes(r.usuario.papel) ? '#/painel' : '#/catalogo');
    } catch (err) { msg.replaceChildren(h('div', { class: 'alerta erro' }, err.message)); }
  });
  $app.replaceChildren(form);
}

function viewCadastro() {
  const c = {
    nome: h('input', { id: 'n', autocomplete: 'name', required: true }),
    email: h('input', { id: 'e', type: 'email', autocomplete: 'email', required: true }),
    cpf: h('input', { id: 'c', inputmode: 'numeric', placeholder: '000.000.000-00', required: true }),
    telefone: h('input', { id: 't', type: 'tel', placeholder: '(11) 99999-9999 — WhatsApp', autocomplete: 'tel', required: true }),
    senha: h('input', { id: 's', type: 'password', autocomplete: 'new-password', minlength: 10, required: true }),
  };
  const lgpd = h('input', { type: 'checkbox', id: 'lgpd' });
  const msg = h('div');
  const form = h('form', { class: 'painel form-estreito' }, h('h1', {}, 'Criar conta'),
    campoEl('Nome completo', c.nome), campoEl('E-mail', c.email), campoEl('CPF', c.cpf), campoEl('Celular (WhatsApp)', c.telefone), campoEl('Senha (mín. 10 caracteres, letras e números)', c.senha),
    h('label', { class: 'check', for: 'lgpd' }, lgpd, h('span', {}, 'Li e aceito a Política de Privacidade. Autorizo o tratamento dos meus dados pessoais e de saúde (receitas) exclusivamente para a dispensação de medicamentos e cumprimento de obrigações sanitárias (LGPD, art. 11, II, "a" e "f").')),
    msg, h('button', { class: 'btn', type: 'submit', style: 'width:100%;margin-top:12px' }, 'Cadastrar'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.replaceChildren();
    try {
      await api('POST', '/api/auth/registrar', { ...Object.fromEntries(Object.entries(c).map(([k, el]) => [k, el.value])), consentimentoLgpd: lgpd.checked });
      const r = await api('POST', '/api/auth/login', { email: c.email.value, senha: c.senha.value });
      estado.token = r.token; estado.usuario = r.usuario; sessionStorage.setItem('token', r.token);
      toast('Conta criada!');
      location.hash = sessionStorage.getItem('voltarPara') || '#/catalogo';
    } catch (err) { msg.replaceChildren(h('div', { class: 'alerta erro' }, err.message)); }
  });
  $app.replaceChildren(form);
}

// ---------------------------------------------------------------- painel da equipe
async function abrirStream(aoEvento) {
  const ctrl = new AbortController();
  limpezas.push(() => ctrl.abort());
  try {
    const r = await fetch('/api/estoque/stream', { headers: { Authorization: `Bearer ${estado.token}` }, signal: ctrl.signal });
    const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
        let tipo = 'message'; let dados = '';
        for (const l of bloco.split('\n')) { if (l.startsWith('event: ')) tipo = l.slice(7); else if (l.startsWith('data: ')) dados += l.slice(6); }
        if (dados) aoEvento(tipo, JSON.parse(dados));
      }
    }
  } catch (e) { if (e.name !== 'AbortError') console.warn('stream encerrado', e); }
}

async function viewPainel(aba = 'estoque') {
  if (!ehEquipe()) { location.hash = '#/entrar'; return; }
  const papel = estado.usuario.papel;
  const abas = [['estoque', '📦 Estoque'], ['alertas', '🔔 Alertas'], ['pedidos', '🧾 Pedidos'],
    papel === 'farmaceutico' ? ['receitas', '📄 Receitas'] : null, ['escrituracao', '📒 Escrituração'], ['atendimento', '💬 Atendimento'],
    papel === 'admin' ? ['ifood', '🛵 iFood'] : null, papel === 'admin' ? ['auditoria', '🛡️ Auditoria'] : null].filter(Boolean);
  const conteudo = h('div');
  const vivo = h('span', { class: 'ao-vivo' }, 'tempo real');
  $app.replaceChildren(h('h1', {}, `Painel — ${papel === 'admin' ? 'Administração' : `Farmacêutico(a) ${estado.usuario.crf || ''}`} `, vivo),
    h('div', { class: 'abas' }, abas.map(([id, t]) => h('button', { class: id === aba ? 'ativo' : '', onclick: () => (location.hash = `#/painel/${id}`) }, t))),
    conteudo);

  const telas = { estoque: painelEstoque, alertas: painelAlertas, pedidos: painelPedidos, receitas: painelReceitas, escrituracao: painelEscrituracao, atendimento: painelAtendimento, ifood: painelIfood, auditoria: painelAuditoria };
  const ganchos = {};
  await (telas[aba] || painelEstoque)(conteudo, ganchos);
  abrirStream((tipo, dados) => {
    if (tipo === 'alerta') toast(`🔔 ${dados.mensagem}`);
    if (tipo === 'pedido' && dados.status === 'AGUARDANDO_RECEITA') toast(`📄 Pedido ${dados.numero} aguarda validação de receita`);
    if (tipo === 'atendimento') toast('💬 Cliente aguardando atendimento humano');
    ganchos[tipo]?.(dados);
  });
}

async function painelEstoque(el, ganchos) {
  const itens = await api('GET', '/api/estoque');
  const linhas = new Map();
  const corpo = h('tbody');
  const linhaDe = (r) => h('tr', { 'data-id': r.produtoId },
    h('td', {}, r.nome, h('div', { class: 'aviso' }, r.sku)), h('td', {}, r.fisico), h('td', {}, r.reservado), h('td', {}, h('strong', {}, r.disponivel)), h('td', {}, r.estoqueMinimo),
    h('td', { class: `estoque ${r.situacao}` }, r.situacao),
    h('td', {}, r.lotes.map((l) => h('div', { class: 'aviso' }, `${l.lote} · val. ${l.validade} · ${l.quantidade} un.`))));
  for (const r of itens) { const tr = linhaDe(r); linhas.set(r.produtoId, tr); corpo.append(tr); }
  ganchos.estoque = (r) => { const nova = linhaDe(r); nova.className = 'pulso'; linhas.get(r.produtoId)?.replaceWith(nova); linhas.set(r.produtoId, nova); };

  const prod = h('select', { id: 'prod' }, itens.map((r) => h('option', { value: r.produtoId }, r.nome)));
  const lote = h('input', { id: 'lote', placeholder: 'Ex.: AB1234' });
  const val = h('input', { id: 'val', type: 'date' });
  const qtd = h('input', { id: 'qtd', type: 'number', min: 1 });
  const nf = h('input', { id: 'nf', placeholder: 'Nº da nota fiscal' });
  const msg = h('div');
  const btn = h('button', { class: 'btn' }, 'Registrar entrada');
  btn.addEventListener('click', async () => {
    msg.replaceChildren();
    try { await api('POST', `/api/estoque/${prod.value}/entrada`, { lote: lote.value, validade: val.value, quantidade: Number(qtd.value), notaFiscal: nf.value }); toast('Entrada registrada'); lote.value = qtd.value = nf.value = ''; }
    catch (e) { msg.replaceChildren(erroComDetalhes(e)); }
  });
  el.replaceChildren(
    h('div', { class: 'tabela-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Produto', 'Físico', 'Reservado', 'Disponível', 'Mínimo', 'Situação', 'Lotes (FEFO)'].map((t) => h('th', {}, t)))), corpo)),
    h('div', { class: 'painel', style: 'margin-top:16px' }, h('h2', {}, 'Entrada de mercadoria (por lote)'), campoEl('Produto', prod),
      h('div', { class: 'grid2' }, campoEl('Lote', lote), campoEl('Validade', val)), h('div', { class: 'grid2' }, campoEl('Quantidade', qtd), campoEl('Nota fiscal', nf)), msg, btn));
}

async function painelAlertas(el, ganchos) {
  async function carregar() {
    const lista = await api('GET', '/api/estoque/alertas');
    const cls = { RUPTURA: 'erro', LOTE_VENCIDO: 'erro', REPOSICAO: 'atencao', VALIDADE_PROXIMA: 'atencao' };
    el.replaceChildren(lista.length ? h('div', {}, lista.map((a) => h('div', { class: `alerta ${cls[a.tipo] || 'info'}` },
      h('strong', {}, a.tipo.replace('_', ' ')), ` — ${a.mensagem}`, a.sugestaoCompra ? ` Sugestão de compra: ${a.sugestaoCompra} un.` : '',
      h('div', { class: 'aviso' }, dataBR(a.criadoEm)),
      h('button', { class: 'btn sec peq', onclick: async () => { await api('POST', `/api/estoque/alertas/${a.id}/resolver`); carregar(); } }, 'Marcar como resolvido'))))
      : h('p', { class: 'vazio' }, '✅ Nenhum alerta aberto.'));
  }
  ganchos.alerta = carregar;
  ganchos.estoque = () => { clearTimeout(ganchos._t); ganchos._t = setTimeout(carregar, 400); };
  await carregar();
}

const PROXIMOS = { PAGO: ['EM_SEPARACAO'], EM_SEPARACAO: ['SAIU_PARA_ENTREGA', 'PRONTO_PARA_RETIRADA'], SAIU_PARA_ENTREGA: ['ENTREGUE'], PRONTO_PARA_RETIRADA: ['ENTREGUE'] };

async function painelPedidos(el, ganchos) {
  async function carregar() {
    const lista = await api('GET', '/api/pedidos');
    el.replaceChildren(lista.length ? h('div', { class: 'tabela-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Nº', 'Canal', 'Itens', 'Entrega', 'Total', 'Status', 'Ações'].map((t) => h('th', {}, t)))),
      h('tbody', {}, lista.map((p) => h('tr', {},
        h('td', {}, h('strong', {}, p.numero), h('div', { class: 'aviso' }, dataBR(p.criadoEm))),
        h('td', {}, p.canal === 'ifood' ? `iFood #${p.ifood?.displayId || ''}` : p.canal),
        h('td', {}, p.itens.map((i) => h('div', {}, `${i.quantidade}× ${i.nome}`))),
        h('td', {}, p.entrega.tipo, p.coletarReceitaNaEntrega ? h('div', { class: 'aviso' }, '⚠️ coletar 2ª via da receita') : null),
        h('td', {}, brl(p.total)),
        h('td', { class: `status ${p.status}` }, p.statusDescricao),
        h('td', {}, (PROXIMOS[p.status] || []).filter((s) => (s === 'SAIU_PARA_ENTREGA' ? p.entrega.tipo === 'delivery' : s === 'PRONTO_PARA_RETIRADA' ? p.entrega.tipo === 'retirada' : true))
          .map((s) => h('button', { class: 'btn peq', style: 'margin:2px', onclick: async () => { try { await api('POST', `/api/pedidos/${p.id}/status`, { status: s }); toast('Status atualizado'); carregar(); } catch (e) { toast(e.message, true); } } }, s.replaceAll('_', ' ').toLowerCase())),
          ['AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO', 'PAGO'].includes(p.status) ? h('button', { class: 'btn perigo peq', style: 'margin:2px', onclick: async () => { if (confirm('Cancelar pedido?')) { await api('POST', `/api/pedidos/${p.id}/status`, { status: 'CANCELADO', obs: 'Cancelado pela farmácia' }); carregar(); } } }, 'cancelar') : null))))))
      : h('p', { class: 'vazio' }, 'Nenhum pedido ainda.'));
  }
  ganchos.pedido = carregar;
  await carregar();
}

async function painelReceitas(el, ganchos) {
  async function carregar() {
    const lista = await api('GET', '/api/receitas?status=PENDENTE');
    el.replaceChildren(h('div', { class: 'alerta info' }, 'Confira: identificação do paciente e do prescritor, registro profissional, data, medicamento, dose, posologia e legibilidade. Antimicrobianos: validade de 10 dias.'),
      lista.length ? lista.map((r) => {
        const obs = h('input', { placeholder: 'Observação (obrigatória ao rejeitar)' });
        const previa = h('div');
        return h('div', { class: 'painel' },
          h('div', {}, h('strong', {}, r.produtos.map((p) => p.nome).join(', '))),
          h('div', { class: 'aviso' }, `Paciente: ${r.nomePaciente} · Prescritor: ${r.nomePrescritor} (${r.registroPrescritor}) · Emissão: ${new Date(r.dataEmissao).toLocaleDateString('pt-BR')}`),
          r.validade.valida ? h('div', { class: 'alerta ok' }, `Dentro da validade (${r.validade.dias} dias)`) : h('div', { class: 'alerta erro' }, `VENCIDA — validade de ${r.validade.dias} dias`),
          h('button', { class: 'btn sec peq', onclick: async () => {
            const resp = await fetch(`/api/receitas/${r.id}/arquivo`, { headers: { Authorization: `Bearer ${estado.token}` } });
            const url = URL.createObjectURL(await resp.blob());
            limpezas.push(() => URL.revokeObjectURL(url));
            previa.replaceChildren(r.tipoArquivo === 'application/pdf' ? h('a', { href: url, target: '_blank', rel: 'noopener' }, 'Abrir PDF') : h('img', { src: url, alt: 'Receita', style: 'max-width:100%;margin-top:10px;border-radius:8px' }));
          } }, '👁️ Ver receita'), previa, obs,
          h('div', { class: 'barra', style: 'margin-top:8px' },
            h('button', { class: 'btn', onclick: async () => { try { await api('POST', `/api/receitas/${r.id}/avaliar`, { aprovada: true, observacao: obs.value }); toast('Receita aprovada'); carregar(); } catch (e) { toast(e.message, true); } } }, '✅ Aprovar'),
            h('button', { class: 'btn perigo', onclick: async () => { if (!obs.value) return toast('Informe o motivo da rejeição', true); await api('POST', `/api/receitas/${r.id}/avaliar`, { aprovada: false, observacao: obs.value }); toast('Receita rejeitada'); carregar(); } }, '❌ Rejeitar')));
      }) : h('p', { class: 'vazio' }, 'Nenhuma receita aguardando validação.'));
  }
  ganchos.pedido = carregar;
  await carregar();
}

async function painelEscrituracao(el) {
  const lista = await api('GET', '/api/anvisa/escrituracao');
  el.replaceChildren(h('div', { class: 'alerta info' }, 'Registro das dispensações de antimicrobianos e controlados — base para transmissão ao SNGPC/ANVISA.'),
    lista.length ? h('div', { class: 'tabela-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Data', 'Princípio ativo', 'Reg. ANVISA', 'Qtd', 'Lotes', 'Prescritor', 'Farmacêutico', 'SNGPC'].map((t) => h('th', {}, t)))),
      h('tbody', {}, lista.map((e) => h('tr', {}, h('td', {}, dataBR(e.criadoEm)), h('td', {}, e.principioAtivo), h('td', {}, e.registroAnvisa), h('td', {}, e.quantidade),
        h('td', {}, e.lotes.map((l) => `${l.lote} (${l.quantidade})`).join(', ')), h('td', {}, e.registroPrescritor || '—'), h('td', {}, e.crfFarmaceutico || '—'), h('td', {}, e.transmitidoSngpc ? 'transmitido' : 'pendente'))))))
      : h('p', { class: 'vazio' }, 'Nenhuma dispensação escriturada ainda.'));
}

async function painelAtendimento(el, ganchos) {
  const lista = h('div', { class: 'painel' });
  const detalhe = h('div', { class: 'painel' }, h('p', { class: 'vazio' }, 'Selecione uma conversa.'));
  let aberta = null;
  async function abrir(c) {
    aberta = c;
    const hist = await api('GET', `/api/atendimento/conversas/${c.id}`);
    const entrada = h('input', { placeholder: 'Responder como farmacêutico…' });
    const form = h('form', { class: 'barra', style: 'margin-top:10px' }, entrada, h('button', { class: 'btn', type: 'submit' }, 'Enviar'));
    form.addEventListener('submit', async (e) => { e.preventDefault(); if (!entrada.value) return; await api('POST', `/api/atendimento/conversas/${c.id}/responder`, { mensagem: entrada.value }); abrir(c); });
    detalhe.replaceChildren(h('h2', {}, `Conversa ${c.telefone}`),
      h('div', { class: 'chat-msgs', style: 'background:#e7ddd3;border-radius:10px;max-height:360px' }, hist.map((m) => h('div', { class: `msg ${m.de}` }, m.texto))),
      form, h('button', { class: 'btn sec peq', onclick: async () => { await api('POST', `/api/atendimento/conversas/${c.id}/encerrar`); toast('Devolvido ao assistente automático'); carregar(); } }, 'Encerrar atendimento humano'));
  }
  async function carregar() {
    const cs = await api('GET', '/api/atendimento/conversas');
    lista.replaceChildren(h('h2', {}, 'Conversas'), cs.length ? cs.map((c) => h('div', { class: 'linha' },
      h('span', {}, c.telefone, c.aguardandoHumano ? h('span', { class: 'contador' }, 'aguardando') : null),
      h('button', { class: 'btn sec peq', onclick: () => abrir(c) }, 'Abrir'))) : h('p', { class: 'vazio' }, 'Sem conversas.'));
    if (aberta) abrir(aberta);
  }
  ganchos.atendimento = carregar;
  el.replaceChildren(h('div', { class: 'dois', style: 'grid-template-columns:1fr 2fr' }, lista, detalhe));
  await carregar();
}

async function painelIfood(el) {
  const st = await api('GET', '/api/ifood/status');
  const saida = h('div');
  el.replaceChildren(h('div', { class: 'painel' }, h('h2', {}, 'Integração iFood'),
    h('p', {}, `Modo: `, h('strong', {}, st.modo), st.modo === 'mock' ? ' (simulado — configure IFOOD_* no .env para usar a API real)' : ''),
    h('div', { class: 'alerta info' }, 'Somente MIPs e não medicamentos são publicados no iFood. Pedidos recebidos passam pelas mesmas validações ANVISA e de estoque; se reprovados, são cancelados automaticamente na plataforma.'),
    h('div', { class: 'barra' },
      h('button', { class: 'btn', onclick: async () => { const r = await api('POST', '/api/ifood/sincronizar-catalogo'); saida.replaceChildren(h('div', { class: 'alerta ok' }, `${r.enviados} itens sincronizados.`), r.bloqueados.length ? h('div', { class: 'alerta atencao' }, h('strong', {}, 'Não publicados:'), h('ul', {}, r.bloqueados.map((b) => h('li', {}, `${b.nome}: ${b.motivo}`)))) : ''); } }, 'Sincronizar catálogo'),
      h('button', { class: 'btn sec', onclick: async () => { const r = await api('POST', '/api/dev/ifood/simular-pedido', {}); saida.replaceChildren(h('div', { class: r.aceito ? 'alerta ok' : 'alerta erro' }, r.aceito ? `Pedido iFood importado como nº ${r.numero}.` : `Recusado: ${r.motivo}`)); } }, 'Simular pedido iFood (MIP)'),
      h('button', { class: 'btn sec', onclick: async () => { const r = await api('POST', '/api/dev/ifood/simular-pedido', { itens: [{ sku: 'AMX-500-21', quantidade: 1 }] }); saida.replaceChildren(h('div', { class: r.aceito ? 'alerta ok' : 'alerta erro' }, r.aceito ? `Importado nº ${r.numero}` : `Recusado e cancelado no iFood: ${r.motivo}`)); } }, 'Simular pedido iFood (antibiótico)')),
    saida),
    h('div', { class: 'painel' }, h('h2', {}, 'Últimos eventos'), st.ultimosEventos.map((e) => h('div', { class: 'aviso' }, `${dataBR(e.criadoEm)} — ${e.acao}`))));
}

async function painelAuditoria(el) {
  const [v, lista] = await Promise.all([api('GET', '/api/auditoria/verificar'), api('GET', '/api/auditoria')]);
  el.replaceChildren(h('div', { class: v.integra ? 'alerta ok' : 'alerta erro' }, v.integra ? `🛡️ Trilha de auditoria íntegra (${v.registros} registros encadeados por hash SHA-256).` : `⚠️ Adulteração detectada no registro ${v.quebraEm}`),
    h('div', { class: 'tabela-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Data', 'Ação', 'Usuário', 'Alvo', 'IP'].map((t) => h('th', {}, t)))),
      h('tbody', {}, lista.map((a) => h('tr', {}, h('td', {}, dataBR(a.em)), h('td', {}, a.acao), h('td', { class: 'aviso' }, a.usuarioId?.slice(0, 8) || '—'), h('td', { class: 'aviso' }, a.alvo?.slice(0, 8) || '—'), h('td', { class: 'aviso' }, a.ip || '—')))))));
}

// ---------------------------------------------------------------- roteamento
async function render() {
  limpezas.forEach((f) => f()); limpezas = [];
  renderMenu();
  const [, rota = 'catalogo', param] = location.hash.split('/');
  const views = { catalogo: viewCatalogo, carrinho: viewCarrinho, pedidos: viewPedidos, pedido: () => viewPedido(param), atendimento: viewAtendimento, entrar: viewEntrar, cadastro: viewCadastro, painel: () => viewPainel(param) };
  try { await (views[rota] || viewCatalogo)(); window.scrollTo(0, 0); }
  catch (e) { $app.replaceChildren(erroComDetalhes(e)); }
}

window.addEventListener('hashchange', render);
(async () => {
  estado.farmacia = await api('GET', '/api/farmacia').catch(() => null);
  renderRodape();
  await carregarSessao();
  if (!location.hash) location.hash = '#/catalogo';
  render();
})();
