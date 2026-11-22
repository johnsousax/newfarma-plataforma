import { config } from '../config.js';
import { cifrar, decifrar, indiceCego, verificarAssinaturaWebhook, compararSeguro } from '../lib/crypto.js';
import { barramento } from '../lib/eventos.js';
import { erro, texto } from '../lib/http.js';
import { infoRegulatoria } from '../services/anvisa.js';
import { STATUS } from '../services/pedidos.js';

const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const EMERGENCIA = /(dor no peito|falta de ar|desmai|convuls|overdose|intoxica|envenena|sangramento forte|suicid)/;
const CLINICO = /(dose|dosagem|posso tomar|pode tomar|efeito colateral|interac|gravid|amament|alergi|substitu|qual remedio|qual medicamento|o que tomar|serve para)/;

const MENU = (nome) =>
  `Olá${nome ? `, ${nome.split(' ')[0]}` : ''}! Sou o assistente virtual da ${config.farmacia.nome}. 💊\n\n` +
  'Como posso ajudar?\n1️⃣ Consultar produto e preço (ex.: "buscar dipirona")\n2️⃣ Status dos meus pedidos\n3️⃣ Horário e endereço\n4️⃣ Como enviar receita\n5️⃣ Falar com o farmacêutico\n\n' +
  'Para cancelar: "cancelar pedido 1001".';

/**
 * Agente de atendimento via WhatsApp (WhatsApp Business Cloud API — Meta).
 *  - Webhook com verificação do token (GET) e da assinatura X-Hub-Signature-256 (POST).
 *  - Cliente identificado pelo telefone (índice cego, sem telefone em claro no banco).
 *  - Nunca dá orientação clínica: dúvidas sobre dose/uso vão para o farmacêutico;
 *    sinais de emergência direcionam ao SAMU 192.
 *  - Notifica o cliente automaticamente a cada mudança de status do pedido.
 */
export function criarWhatsapp(store, { auth, pedidos, estoque }) {
  const cfg = config.whatsapp;

  function conversaDe(telefone) {
    const idx = indiceCego(telefone);
    return store.encontrar('conversas', (c) => c.telefoneIndice === idx)
      || store.inserir('conversas', { telefoneIndice: idx, telefoneCifrado: cifrar(telefone), mensagens: [], aguardandoHumano: false });
  }

  function registrar(conversa, de, msg) {
    conversa.mensagens.push({ de, textoCifrado: cifrar(msg), em: new Date().toISOString() });
    if (conversa.mensagens.length > 200) conversa.mensagens.splice(0, conversa.mensagens.length - 200);
    store.atualizar('conversas', conversa.id, { mensagens: conversa.mensagens, aguardandoHumano: conversa.aguardandoHumano });
  }

  async function enviar(telefone, mensagem) {
    const conversa = conversaDe(telefone);
    registrar(conversa, 'bot', mensagem);
    if (cfg.modo !== 'live') return { simulado: true };
    const r = await fetch(`https://graph.facebook.com/${cfg.versaoApi}/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: telefone, type: 'text', text: { body: mensagem.slice(0, 4096) } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.error('[whatsapp] falha ao enviar:', r.status);
    return { enviado: r.ok };
  }

  function buscarProdutos(termo) {
    const t = normalizar(termo);
    return store.listar('produtos', (p) => p.ativo && (normalizar(p.nome).includes(t) || normalizar(p.principioAtivo || '').includes(t) || normalizar(p.categoria).includes(t))).slice(0, 5);
  }

  /** Motor de respostas (independente do canal; usado pelo webhook e pelo simulador do app). */
  function responder(telefone, mensagem) {
    const usuarioBruto = auth.buscarPorTelefone(telefone);
    const usuario = usuarioBruto ? auth.publico(usuarioBruto) : null;
    const conversa = conversaDe(telefone);
    const m = normalizar(texto(mensagem, 1000));

    if (EMERGENCIA.test(m)) {
      conversa.aguardandoHumano = true;
      return '🚨 Se for uma emergência, ligue AGORA para o SAMU (192) ou procure o pronto-socorro mais próximo. Um farmacêutico também foi avisado.';
    }
    if (CLINICO.test(m)) {
      conversa.aguardandoHumano = true;
      barramento.emit('atendimento', { conversaId: conversa.id, motivo: 'duvida_clinica' });
      return `Dúvidas sobre uso, dose ou indicação de medicamentos precisam ser respondidas por um profissional. 👩‍⚕️ Encaminhei sua mensagem ao farmacêutico responsável (${config.farmacia.responsavelTecnico}, ${config.farmacia.crf}). Aguarde, por favor.`;
    }
    if (conversa.aguardandoHumano && !/^(menu|oi|ola|0)$/.test(m)) {
      barramento.emit('atendimento', { conversaId: conversa.id, motivo: 'mensagem_cliente' });
      return 'Sua mensagem foi encaminhada ao farmacêutico, que responderá em instantes. Digite "menu" para voltar ao atendimento automático.';
    }
    if (/^(menu|oi|ola|bom dia|boa tarde|boa noite|0|ajuda)\b/.test(m)) {
      conversa.aguardandoHumano = false;
      return MENU(usuario?.nome);
    }

    const busca = m.match(/^(?:1|buscar|busca|produto|tem|preco|quanto custa)(?:\s+(.*))?$/);
    if (busca) {
      if (!busca[1]?.trim()) return 'Qual produto você procura? Ex.: "buscar protetor solar".';
      const achados = buscarProdutos(busca[1]);
      if (!achados.length) return `Não encontrei "${busca[1]}". Tente o nome do princípio ativo ou fale com o farmacêutico (5).`;
      return achados.map((p) => {
        const r = infoRegulatoria(p);
        const d = estoque.disponivel(p);
        const venda = !r.vendaOnline ? '🏪 Somente na loja, com receita original' : r.exigeReceita ? '📄 Exige receita (envie pelo app)' : '✅ Compra pelo app';
        return `• *${p.nome}* — ${brl(p.preco)}\n  ${d > 0 ? `Em estoque (${d})` : 'Indisponível no momento'} · ${venda}`;
      }).join('\n') + '\n\nPara comprar, acesse o app.';
    }

    const cancelar = m.match(/^cancelar pedido\s*#?(\d+)/);
    if (cancelar) {
      if (!usuario) return 'Não encontrei cadastro com este número. Cancele pelo app ou fale com o farmacêutico (5).';
      const p = store.encontrar('pedidos', (x) => x.numero === Number(cancelar[1]) && x.usuarioId === usuario.id);
      if (!p) return `Pedido ${cancelar[1]} não encontrado na sua conta.`;
      if (!['AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO'].includes(p.status)) return `O pedido ${p.numero} está "${STATUS[p.status]}" e não pode ser cancelado por aqui. Fale com o farmacêutico (5).`;
      pedidos.mudarStatus(p, 'CANCELADO', { usuario, obs: 'Cancelado pelo cliente via WhatsApp' });
      return `Pedido ${p.numero} cancelado. ✅`;
    }

    if (/^2$|\b(pedidos?|status|rastre\w*|entrega)\b/.test(m)) {
      if (!usuario) return 'Não encontrei cadastro com este número de WhatsApp. Faça seu cadastro no app com este telefone para acompanhar pedidos por aqui.';
      const numero = m.match(/(\d{4,})/);
      const lista = store.listar('pedidos', (p) => p.usuarioId === usuario.id && (!numero || p.numero === Number(numero[1])))
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 3);
      if (!lista.length) return 'Você ainda não tem pedidos.';
      return lista.map((p) => `📦 Pedido *${p.numero}* — ${brl(p.total)}\n   Status: ${STATUS[p.status]}`).join('\n');
    }
    if (/^3$|\b(horario|endereco|onde fica|aberto|abre|fecha)\b/.test(m)) {
      return `🕒 ${config.farmacia.horario}\n🏥 ${config.farmacia.nome} — CNPJ ${config.farmacia.cnpj} · AFE ${config.farmacia.afe}\nFarmacêutico responsável: ${config.farmacia.responsavelTecnico} (${config.farmacia.crf}).`;
    }
    if (/^4$|\breceita\b/.test(m)) {
      return '📄 Para medicamentos com prescrição: finalize o pedido no app e anexe a foto/PDF da receita. O farmacêutico valida antes do pagamento.\n• Antimicrobianos: receita válida por 10 dias; a 2ª via é recolhida na entrega.\n• Controlados (tarja preta / Portaria 344): somente na loja, com receita original.';
    }
    if (/^5$|\b(farmaceutic\w*|atendente|humano|pessoa)\b/.test(m)) {
      conversa.aguardandoHumano = true;
      barramento.emit('atendimento', { conversaId: conversa.id, motivo: 'solicitou_humano' });
      return 'Certo! Um farmacêutico vai continuar o atendimento por aqui em instantes. 👩‍⚕️';
    }
    return 'Não entendi. 🤔 Digite "menu" para ver as opções.';
  }

  async function receberMensagem(telefone, mensagem) {
    const conversa = conversaDe(telefone);
    registrar(conversa, 'cliente', texto(mensagem, 1000));
    const resposta = responder(telefone, mensagem);
    await enviar(telefone, resposta);
    return resposta;
  }

  // ---- Webhook da Meta ---------------------------------------------------------
  function verificarWebhook(query) {
    if (query.get('hub.mode') === 'subscribe' && cfg.verifyToken && compararSeguro(query.get('hub.verify_token'), cfg.verifyToken)) {
      return query.get('hub.challenge');
    }
    throw erro(403, 'Token de verificação inválido');
  }

  async function processarWebhook(corpoBruto, assinatura) {
    if (!verificarAssinaturaWebhook(cfg.appSecret, corpoBruto, assinatura)) throw erro(401, 'Assinatura WhatsApp inválida');
    const corpo = JSON.parse(corpoBruto.toString('utf8'));
    const processadas = [];
    for (const entry of corpo.entry || []) {
      for (const change of entry.changes || []) {
        for (const msg of change.value?.messages || []) {
          if (msg.type !== 'text') {
            await enviar(msg.from, 'No momento entendo apenas mensagens de texto. Para enviar receitas, use o app. 📱');
            continue;
          }
          processadas.push(await receberMensagem(msg.from, msg.text?.body || ''));
        }
      }
    }
    return { processadas: processadas.length };
  }

  // ---- Notificações de status do pedido -------------------------------------------
  barramento.on('pedido', (ev) => {
    if (!ev.usuarioId) return;
    const u = store.obter('usuarios', ev.usuarioId);
    if (!u) return;
    const tel = decifrar(u.telefoneCifrado);
    const extra = ev.status === 'AGUARDANDO_RECEITA' ? ' Anexe a receita no app para continuarmos.' : '';
    enviar(tel, `📦 Pedido ${ev.numero}: ${STATUS[ev.status]}.${extra}`).catch(() => {});
  });

  // ---- Painel da equipe ---------------------------------------------------------
  function listarConversas() {
    return store.listar('conversas').map((c) => ({
      id: c.id, aguardandoHumano: c.aguardandoHumano,
      telefone: decifrar(c.telefoneCifrado).replace(/^(\d{4})\d+(\d{4})$/, '$1*****$2'),
      ultima: c.mensagens.length ? { de: c.mensagens.at(-1).de, em: c.mensagens.at(-1).em } : null,
    })).sort((a, b) => Number(b.aguardandoHumano) - Number(a.aguardandoHumano));
  }

  function historico(conversaId) {
    const c = store.obter('conversas', conversaId);
    if (!c) throw erro(404, 'Conversa não encontrada');
    return c.mensagens.map((m) => ({ de: m.de, texto: decifrar(m.textoCifrado), em: m.em }));
  }

  async function responderComoAtendente(conversaId, atendente, mensagem) {
    const c = store.obter('conversas', conversaId);
    if (!c) throw erro(404, 'Conversa não encontrada');
    const tel = decifrar(c.telefoneCifrado);
    const textoFinal = `👩‍⚕️ ${atendente.nome}${atendente.crf ? ` (${atendente.crf})` : ''}: ${texto(mensagem, 2000)}`;
    registrar(c, 'atendente', textoFinal);
    if (cfg.modo === 'live') await enviar(tel, textoFinal);
    return { ok: true };
  }

  function encerrarAtendimento(conversaId) {
    const c = store.obter('conversas', conversaId);
    if (!c) throw erro(404, 'Conversa não encontrada');
    store.atualizar('conversas', c.id, { aguardandoHumano: false });
    return { ok: true };
  }

  return { receberMensagem, responder, verificarWebhook, processarWebhook, listarConversas, historico, responderComoAtendente, encerrarAtendimento, enviar };
}
