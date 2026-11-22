import { config } from '../config.js';
import { barramento } from '../lib/eventos.js';
import { erro, texto, inteiroPositivo } from '../lib/http.js';

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Gestão de estoque por lote (rastreabilidade sanitária), com:
 *  - reserva no momento do pedido (evita vender o que não existe);
 *  - baixa FEFO (primeiro que vence, primeiro que sai);
 *  - lotes vencidos excluídos automaticamente do disponível;
 *  - alertas de reposição, ruptura e validade próxima, emitidos em tempo real.
 */
export function criarEstoque(store) {
  const lotesValidos = (p) => (p.lotes || []).filter((l) => l.quantidade > 0 && l.validade >= hoje());
  const fisico = (p) => lotesValidos(p).reduce((s, l) => s + l.quantidade, 0);
  const disponivel = (p) => Math.max(0, fisico(p) - (p.reservado || 0));

  function situacao(p) {
    const d = disponivel(p);
    if (d === 0) return 'ESGOTADO';
    if (d <= p.estoqueMinimo) return 'BAIXO';
    return 'DISPONIVEL';
  }

  function resumo(p) {
    return { produtoId: p.id, nome: p.nome, sku: p.sku, fisico: fisico(p), reservado: p.reservado || 0, disponivel: disponivel(p), estoqueMinimo: p.estoqueMinimo, situacao: situacao(p), lotes: p.lotes };
  }

  function emitir(p) { barramento.emit('estoque', resumo(p)); }

  function registrarMovimento(p, tipo, quantidade, extra = {}) {
    store.inserir('movimentos', { produtoId: p.id, tipo, quantidade, saldoFisico: fisico(p), ...extra });
  }

  function abrirAlerta(p, tipo, mensagem, extra = {}) {
    const existente = store.encontrar('alertas', (a) => a.produtoId === p.id && a.tipo === tipo && !a.resolvido && (extra.lote ? a.lote === extra.lote : true));
    if (existente) return existente;
    const alerta = store.inserir('alertas', { produtoId: p.id, produto: p.nome, tipo, mensagem, resolvido: false, ...extra });
    barramento.emit('alerta', alerta);
    return alerta;
  }

  function resolverAlertas(p, tipo) {
    for (const a of store.listar('alertas', (x) => x.produtoId === p.id && x.tipo === tipo && !x.resolvido)) {
      store.atualizar('alertas', a.id, { resolvido: true, resolvidoEm: new Date().toISOString(), resolucao: 'automatica' });
    }
  }

  function verificarAlertas(p) {
    const d = disponivel(p);
    if (d === 0) abrirAlerta(p, 'RUPTURA', `${p.nome} esgotado. Reposição urgente.`, { sugestaoCompra: p.estoqueMinimo * 3 });
    else resolverAlertas(p, 'RUPTURA');
    if (d > 0 && d <= p.estoqueMinimo) abrirAlerta(p, 'REPOSICAO', `${p.nome} abaixo do estoque mínimo (${d}/${p.estoqueMinimo}).`, { sugestaoCompra: p.estoqueMinimo * 3 - d });
    else if (d > p.estoqueMinimo) resolverAlertas(p, 'REPOSICAO');
  }

  function verificarValidades() {
    const limite = new Date(Date.now() + config.anvisa.diasAlertaValidadeLote * 86_400_000).toISOString().slice(0, 10);
    for (const p of store.listar('produtos')) {
      for (const l of p.lotes || []) {
        if (l.quantidade <= 0) continue;
        if (l.validade < hoje()) abrirAlerta(p, 'LOTE_VENCIDO', `Lote ${l.lote} de ${p.nome} VENCIDO — segregar e não dispensar (descarte conforme RDC 222/2018).`, { lote: l.lote });
        else if (l.validade <= limite) abrirAlerta(p, 'VALIDADE_PROXIMA', `Lote ${l.lote} de ${p.nome} vence em ${l.validade}.`, { lote: l.lote });
      }
      verificarAlertas(p);
    }
  }

  function produtoOu404(id) {
    const p = store.obter('produtos', id);
    if (!p) throw erro(404, 'Produto não encontrado');
    return p;
  }

  /** Reserva atômica de vários itens: ou reserva tudo, ou nada. */
  function reservar(itens) {
    for (const { produtoId, quantidade } of itens) {
      const p = produtoOu404(produtoId);
      if (disponivel(p) < quantidade) throw erro(409, `Estoque insuficiente para ${p.nome} (disponível: ${disponivel(p)})`);
    }
    for (const { produtoId, quantidade } of itens) {
      const p = produtoOu404(produtoId);
      store.atualizar('produtos', p.id, { reservado: (p.reservado || 0) + quantidade });
      verificarAlertas(p);
      emitir(p);
    }
  }

  function liberar(itens) {
    for (const { produtoId, quantidade } of itens) {
      const p = store.obter('produtos', produtoId);
      if (!p) continue;
      store.atualizar('produtos', p.id, { reservado: Math.max(0, (p.reservado || 0) - quantidade) });
      verificarAlertas(p);
      emitir(p);
    }
  }

  /** Baixa definitiva (FEFO) de um item reservado. Retorna os lotes utilizados. */
  function baixar({ produtoId, quantidade }, referencia) {
    const p = produtoOu404(produtoId);
    let restante = quantidade;
    const usados = [];
    const ordenados = lotesValidos(p).sort((a, b) => a.validade.localeCompare(b.validade));
    for (const l of ordenados) {
      if (restante === 0) break;
      const q = Math.min(l.quantidade, restante);
      l.quantidade -= q;
      restante -= q;
      usados.push({ lote: l.lote, validade: l.validade, quantidade: q });
    }
    if (restante > 0) throw erro(409, `Estoque físico insuficiente para ${p.nome}`);
    store.atualizar('produtos', p.id, { lotes: p.lotes, reservado: Math.max(0, (p.reservado || 0) - quantidade) });
    registrarMovimento(p, 'SAIDA_VENDA', -quantidade, { referencia, lotes: usados });
    verificarAlertas(p);
    emitir(p);
    return usados;
  }

  function entrada(produtoId, dados, usuario) {
    const p = produtoOu404(produtoId);
    const quantidade = inteiroPositivo(dados.quantidade, 'quantidade');
    const lote = texto(dados.lote, 40);
    const validade = String(dados.validade || '');
    if (!lote) throw erro(400, 'Lote obrigatório (rastreabilidade)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validade)) throw erro(400, 'Validade deve estar no formato AAAA-MM-DD');
    if (validade < hoje()) throw erro(422, 'Não é permitido dar entrada em lote vencido');
    const existente = p.lotes.find((l) => l.lote === lote);
    if (existente) {
      if (existente.validade !== validade) throw erro(409, 'Lote já cadastrado com outra validade');
      existente.quantidade += quantidade;
    } else {
      p.lotes.push({ lote, validade, quantidade });
    }
    store.atualizar('produtos', p.id, { lotes: p.lotes });
    registrarMovimento(p, 'ENTRADA', quantidade, { lote, validade, notaFiscal: texto(dados.notaFiscal, 60) || null, usuarioId: usuario?.id });
    verificarAlertas(p);
    emitir(p);
    return resumo(p);
  }

  function ajustar(produtoId, dados, usuario) {
    const p = produtoOu404(produtoId);
    const l = p.lotes.find((x) => x.lote === dados.lote);
    if (!l) throw erro(404, 'Lote não encontrado');
    const nova = Number(dados.quantidade);
    if (!Number.isInteger(nova) || nova < 0) throw erro(400, 'Quantidade inválida');
    const motivo = texto(dados.motivo, 200);
    if (!motivo) throw erro(400, 'Motivo do ajuste é obrigatório (inventário, perda, avaria...)');
    const delta = nova - l.quantidade;
    l.quantidade = nova;
    store.atualizar('produtos', p.id, { lotes: p.lotes });
    registrarMovimento(p, 'AJUSTE', delta, { lote: l.lote, motivo, usuarioId: usuario?.id });
    verificarAlertas(p);
    emitir(p);
    return resumo(p);
  }

  function iniciarMonitoramento(intervaloMs = 60 * 60 * 1000) {
    verificarValidades();
    const t = setInterval(verificarValidades, intervaloMs);
    t.unref();
    return t;
  }

  return { disponivel, situacao, resumo, reservar, liberar, baixar, entrada, ajustar, verificarAlertas, verificarValidades, iniciarMonitoramento };
}
