import { cifrar, decifrar } from '../lib/crypto.js';
import { barramento } from '../lib/eventos.js';
import { erro, texto, inteiroPositivo } from '../lib/http.js';
import { avaliarProduto, regra } from './anvisa.js';

export const STATUS = {
  AGUARDANDO_RECEITA: 'Aguardando validação da receita',
  AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
  PAGO: 'Pagamento confirmado',
  EM_SEPARACAO: 'Em separação (dispensação)',
  PRONTO_PARA_RETIRADA: 'Pronto para retirada',
  SAIU_PARA_ENTREGA: 'Saiu para entrega',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

const TRANSICOES = {
  AGUARDANDO_RECEITA: ['AGUARDANDO_PAGAMENTO', 'CANCELADO'],
  AGUARDANDO_PAGAMENTO: ['PAGO', 'CANCELADO'],
  PAGO: ['EM_SEPARACAO', 'CANCELADO'],
  EM_SEPARACAO: ['PRONTO_PARA_RETIRADA', 'SAIU_PARA_ENTREGA'],
  PRONTO_PARA_RETIRADA: ['ENTREGUE'],
  SAIU_PARA_ENTREGA: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADO: [],
};

const TAXA_ENTREGA = 790; // centavos
const FRETE_GRATIS_ACIMA = 10_000;
const MAX_ITENS = 30;

export function criarPedidos(store, { estoque, anvisa }) {
  let sequencia = store.listar('pedidos').reduce((m, p) => Math.max(m, p.numero || 0), 1000);

  function montarItens(itensEntrada, canal) {
    if (!Array.isArray(itensEntrada) || itensEntrada.length === 0) throw erro(400, 'Carrinho vazio');
    if (itensEntrada.length > MAX_ITENS) throw erro(400, `Máximo de ${MAX_ITENS} itens por pedido`);
    const agrupados = new Map();
    for (const i of itensEntrada) {
      const q = inteiroPositivo(i.quantidade, 'quantidade');
      if (q > 20) throw erro(400, 'Quantidade máxima por item: 20 unidades');
      agrupados.set(i.produtoId, (agrupados.get(i.produtoId) || 0) + q);
    }
    const itens = [];
    const errosAnvisa = [];
    for (const [produtoId, quantidade] of agrupados) {
      const p = store.obter('produtos', produtoId);
      if (!p || !p.ativo) throw erro(404, `Produto indisponível: ${produtoId}`);
      const a = avaliarProduto(p, canal);
      if (!a.permitido) { errosAnvisa.push({ produtoId, produto: p.nome, motivo: a.motivo }); continue; }
      const r = regra(p);
      // Preço SEMPRE calculado no servidor — nunca confiar no valor enviado pelo cliente.
      itens.push({
        produtoId, nome: p.nome, sku: p.sku, classificacao: p.classificacao,
        precoUnitario: p.preco, quantidade, subtotal: p.preco * quantidade,
        exigeReceita: r.exigeReceita, retencaoReceita: r.retencao,
      });
    }
    if (errosAnvisa.length) throw erro(422, 'Itens não permitidos neste canal de venda', errosAnvisa);
    return itens;
  }

  function registrarHistorico(pedido, status, por, obs) {
    pedido.historico.push({ status, em: new Date().toISOString(), por: por || 'sistema', obs: obs || null });
  }

  function emitir(pedido) {
    barramento.emit('pedido', { id: pedido.id, numero: pedido.numero, status: pedido.status, usuarioId: pedido.usuarioId, canal: pedido.canal, total: pedido.total, entrega: { tipo: pedido.entrega.tipo } });
  }

  function criar({ usuario, itens: itensEntrada, entrega = {}, canal = 'app', externo = null, ip }) {
    const itens = montarItens(itensEntrada, canal);
    const tipoEntrega = entrega.tipo === 'retirada' ? 'retirada' : 'delivery';
    let endereco = null;
    if (tipoEntrega === 'delivery') {
      endereco = {
        logradouro: texto(entrega.endereco?.logradouro, 150), numero: texto(entrega.endereco?.numero, 15),
        complemento: texto(entrega.endereco?.complemento, 80), bairro: texto(entrega.endereco?.bairro, 80),
        cidade: texto(entrega.endereco?.cidade, 80), uf: texto(entrega.endereco?.uf, 2).toUpperCase(),
        cep: String(entrega.endereco?.cep || '').replace(/\D/g, ''),
      };
      if (!endereco.logradouro || !endereco.numero || endereco.cep.length !== 8) throw erro(400, 'Endereço de entrega incompleto (logradouro, número e CEP)');
    }
    const subtotal = itens.reduce((s, i) => s + i.subtotal, 0);
    const taxaEntrega = tipoEntrega === 'delivery' && subtotal < FRETE_GRATIS_ACIMA && !externo ? TAXA_ENTREGA : 0;
    const exigeReceita = itens.some((i) => i.exigeReceita);

    estoque.reservar(itens); // lança 409 se faltar estoque — nada é reservado parcialmente

    const statusInicial = externo?.pago ? 'PAGO' : exigeReceita ? 'AGUARDANDO_RECEITA' : 'AGUARDANDO_PAGAMENTO';
    const pedido = store.inserir('pedidos', {
      numero: ++sequencia,
      usuarioId: usuario?.id || null,
      clienteExterno: externo?.cliente || null,
      canal,
      status: statusInicial,
      itens, subtotal, taxaEntrega, total: subtotal + taxaEntrega,
      exigeReceita,
      coletarReceitaNaEntrega: itens.some((i) => i.retencaoReceita),
      entrega: { tipo: tipoEntrega, parceiro: tipoEntrega === 'delivery' ? 'ifood' : null, enderecoCifrado: endereco ? cifrar(JSON.stringify(endereco)) : null },
      ifood: externo?.ifood || null,
      historico: [],
    });
    registrarHistorico(pedido, statusInicial, usuario?.id || canal);
    store.atualizar('pedidos', pedido.id, { historico: pedido.historico });
    store.auditar('pedido.criado', { usuarioId: usuario?.id, alvo: pedido.id, ip, detalhes: { canal, total: pedido.total } });
    emitir(pedido);
    return pedido;
  }

  function obterPara(id, usuario) {
    const p = store.obter('pedidos', id);
    if (!p) throw erro(404, 'Pedido não encontrado');
    const equipe = ['farmaceutico', 'admin'].includes(usuario.papel);
    if (!equipe && p.usuarioId !== usuario.id) throw erro(404, 'Pedido não encontrado'); // não revela existência (anti-IDOR)
    return p;
  }

  function publico(p, { incluirEndereco = false } = {}) {
    const { enderecoCifrado, ...entrega } = p.entrega;
    return {
      ...p,
      statusDescricao: STATUS[p.status],
      entrega: { ...entrega, endereco: incluirEndereco && enderecoCifrado ? JSON.parse(decifrar(enderecoCifrado)) : undefined },
      receitas: store.listar('receitas', (r) => r.pedidoId === p.id).map((r) => anvisa.resumoReceita(r)),
    };
  }

  function mudarStatus(pedido, novo, { usuario, obs, ip } = {}) {
    if (!TRANSICOES[pedido.status]?.includes(novo)) throw erro(409, `Transição inválida: ${pedido.status} → ${novo}`);
    if (novo === 'EM_SEPARACAO') {
      if (pedido.exigeReceita && usuario?.papel !== 'farmaceutico') throw erro(403, 'Dispensação de itens com receita exige farmacêutico');
      // Baixa definitiva FEFO + escrituração (SNGPC) dos itens controlados/antimicrobianos
      pedido.dispensacao = pedido.itens.map((item) => {
        const lotes = estoque.baixar(item, pedido.id);
        const produto = store.obter('produtos', item.produtoId);
        anvisa.registrarDispensacao({ pedido, item, produto, lotes, farmaceutico: usuario });
        return { produtoId: item.produtoId, lotes };
      });
    }
    if (novo === 'SAIU_PARA_ENTREGA' && pedido.entrega.tipo !== 'delivery') throw erro(409, 'Pedido é para retirada');
    if (novo === 'PRONTO_PARA_RETIRADA' && pedido.entrega.tipo !== 'retirada') throw erro(409, 'Pedido é para entrega');
    if (novo === 'CANCELADO') estoque.liberar(pedido.itens);
    pedido.status = novo;
    registrarHistorico(pedido, novo, usuario?.id, texto(obs, 200));
    store.atualizar('pedidos', pedido.id, { status: novo, historico: pedido.historico, dispensacao: pedido.dispensacao });
    store.auditar('pedido.status', { usuarioId: usuario?.id, alvo: pedido.id, ip, detalhes: { status: novo } });
    emitir(pedido);
    return pedido;
  }

  /** Chamado após aprovação/rejeição de receita. */
  function reavaliarReceitas(pedido, farmaceutico) {
    if (pedido.status !== 'AGUARDANDO_RECEITA') return pedido;
    const receitas = store.listar('receitas', (r) => r.pedidoId === pedido.id);
    const precisam = pedido.itens.filter((i) => i.exigeReceita).map((i) => i.produtoId);
    const aprovados = new Set(receitas.filter((r) => r.status === 'APROVADA').flatMap((r) => r.produtosIds));
    if (precisam.every((id) => aprovados.has(id))) return mudarStatus(pedido, 'AGUARDANDO_PAGAMENTO', { usuario: farmaceutico, obs: 'Receita validada pelo farmacêutico' });
    return pedido;
  }

  function marcarPago(pedido, pagamentoId) {
    if (pedido.status === 'PAGO') return pedido;
    pedido.pagamentoId = pagamentoId;
    store.atualizar('pedidos', pedido.id, { pagamentoId });
    return mudarStatus(pedido, 'PAGO', { obs: 'Pagamento aprovado pelo gateway' });
  }

  function enderecoDe(pedido) {
    return pedido.entrega.enderecoCifrado ? JSON.parse(decifrar(pedido.entrega.enderecoCifrado)) : null;
  }

  return { criar, obterPara, publico, mudarStatus, reavaliarReceitas, marcarPago, enderecoDe, STATUS };
}
