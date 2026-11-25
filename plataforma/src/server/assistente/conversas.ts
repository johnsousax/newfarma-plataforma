import 'server-only';
import { db } from '../db';
import { cifrar, decifrar } from '../cripto';
import { ErroNegocio } from '../erros';
import { auditar } from '../auditoria';
import { enriquecer } from '../catalogo';
import { configuracoes } from '../configuracoes';
import { normalizar } from '@/lib/texto';
import { consultarIA, AssistenteIndisponivel, type RespostaAssistente, type Imagem } from './ia';
import { detectarEmergencia, respostaEmergencia, verificarResposta, RESPOSTA_SEGURA } from './regras';
import type { UsuarioSessao } from '../auth';
import type { AutorMensagem, Classificacao } from '@/generated/prisma/enums';

const MAX_IMAGEM = 5 * 1024 * 1024;
const ASSINATURAS: Record<Imagem['mime'], number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};

export type ProdutoSugerido = { slug: string; nome: string; preco: number; classificacao: string; disponivel: number; icone: string };
export type DadosMensagem = {
  medicamentos?: RespostaAssistente['medicamentos'];
  produtos?: ProdutoSugerido[];
  /** Opções sem receita para um sintoma leve */
  sugestoes?: { sintoma: string; produtos: ProdutoSugerido[] };
  informacoes?: string[];
  emergencia?: boolean;
  encaminhado?: boolean;
};

async function salvar(conversaId: string, autor: AutorMensagem, texto: string, extra: { autorId?: string; dados?: DadosMensagem; teveImagem?: boolean; bloqueadaPorRegra?: string } = {}) {
  await db.mensagem.create({
    data: {
      conversaId, autor, autorId: extra.autorId ?? null, textoCifrado: cifrar(texto),
      dadosCifrados: extra.dados ? cifrar(JSON.stringify(extra.dados)) : null,
      teveImagem: !!extra.teveImagem, bloqueadaPorRegra: extra.bloqueadaPorRegra ?? null,
    },
  });
  await db.conversa.update({ where: { id: conversaId }, data: { atualizadoEm: new Date() } });
}

/**
 * Conversa ÚNICA do cliente com a assistente: uma só, para sempre (não há "nova conversa").
 * Se o cliente tiver conversas antigas (de antes desta regra), usa a mais recente.
 */
export async function conversaUnica(usuarioId: string) {
  return db.conversa.findFirst({ where: { usuarioId }, orderBy: { atualizadoEm: 'desc' } });
}

/** Mantido por compatibilidade: é a mesma conversa única. */
export const conversaAtiva = conversaUnica;

export async function mensagensDa(conversaId: string) {
  const ms = await db.mensagem.findMany({ where: { conversaId }, orderBy: { criadoEm: 'asc' } });
  return ms.map(mapearMensagem);
}

/** Histórico completo do cliente (todas as conversas, inclusive antigas), em ordem. */
export async function historicoDoCliente(usuarioId: string, limite = 200) {
  const ms = await db.mensagem.findMany({ where: { conversa: { usuarioId } }, orderBy: { criadoEm: 'desc' }, take: limite });
  return ms.reverse().map(mapearMensagem);
}

function mapearMensagem(m: { id: string; autor: AutorMensagem; criadoEm: Date; teveImagem: boolean; bloqueadaPorRegra: string | null; textoCifrado: string; dadosCifrados: string | null }) {
  return {
    id: m.id, autor: m.autor, criadoEm: m.criadoEm, teveImagem: m.teveImagem, bloqueadaPorRegra: m.bloqueadaPorRegra,
    texto: decifrar(m.textoCifrado) ?? '',
    dados: m.dadosCifrados ? (JSON.parse(decifrar(m.dadosCifrados) ?? '{}') as DadosMensagem) : null,
  };
}

/** Quantas perguntas o cliente ainda pode fazer hoje. */
export async function perguntasRestantes(usuarioId: string) {
  const { assistente } = await configuracoes();
  const desde = new Date(Date.now() - 86_400_000);
  const usadas = await db.mensagem.count({ where: { autor: 'CLIENTE', criadoEm: { gte: desde }, conversa: { usuarioId } } });
  return { limite: assistente.limiteDiario, usadas, restantes: Math.max(0, assistente.limiteDiario - usadas) };
}

const selecaoProduto = {
  id: true, slug: true, nome: true, icone: true, preco: true, precoDe: true, classificacao: true, tipo: true, categoriaId: true, marcaId: true, descricaoCurta: true,
  principioAtivo: true, concentracao: true, marca: { select: { nome: true, slug: true } }, categoria: { select: { paiId: true, nome: true, cor: true, slug: true } },
  imagens: { select: { id: true }, orderBy: { ordem: 'asc' as const }, take: 1 },
};

async function buscarProdutos(termos: string[], somente?: Classificacao[], limite = 6): Promise<ProdutoSugerido[]> {
  const t = termos.map((x) => normalizar(x).split(' ')[0]).filter((x) => x.length >= 4);
  if (!t.length) return [];
  const brutos = await db.produto.findMany({
    where: { ativo: true, OR: t.map((x) => ({ busca: { contains: x } })), ...(somente ? { classificacao: { in: somente } } : {}) },
    take: limite, orderBy: [{ tipo: 'asc' }, { preco: 'asc' }], select: selecaoProduto,
  });
  return (await enriquecer(brutos)).map((p) => ({ slug: p.slug, nome: p.nome, preco: p.oferta.preco, classificacao: p.classificacao, disponivel: p.disponivel, icone: p.icone }));
}

function validarImagem(bytes: Buffer, mime: string): Imagem['mime'] {
  if (bytes.length > MAX_IMAGEM) throw new ErroNegocio('A foto é muito grande (máximo 5 MB).');
  if (!(mime in ASSINATURAS)) throw new ErroNegocio('Envie a foto em JPG, PNG ou WEBP.');
  const m = mime as Imagem['mime'];
  if (!ASSINATURAS[m].every((b, i) => bytes[i] === b)) throw new ErroNegocio('O arquivo enviado não é uma imagem válida.');
  return m;
}

/**
 * Pergunta do cliente. Ordem das camadas de segurança:
 * cadastro e consentimento → limite diário → emergência (sem IA) → IA estruturada → verificação da resposta
 * → filtro do catálogo (sugestão por sintoma só mostra produto sem receita).
 * A imagem é processada e descartada: nunca é gravada.
 */
export async function perguntar(u: UsuarioSessao, entrada: { texto: string; arquivo: File | null }, ip: string) {
  const cfg = await configuracoes();
  if (!cfg.assistente.ativo) throw new ErroNegocio('A assistente está desativada no momento. Fale com a farmácia pelo WhatsApp.');
  const usuario = await db.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { consentimentoAssistenteEm: true } });
  if (!usuario.consentimentoAssistenteEm) throw new ErroNegocio('Para usar a assistente, aceite o termo de uso de dados de saúde.');
  const pergunta = entrada.texto.trim().slice(0, 1500);
  if (!pergunta && !entrada.arquivo) throw new ErroNegocio('Escreva sua dúvida ou envie uma foto.');

  const cota = await perguntasRestantes(u.id);
  if (cota.restantes <= 0) throw new ErroNegocio(`Você usou as ${cota.limite} consultas de hoje. Amanhã libera de novo; se for urgente, fale com o farmacêutico pelo WhatsApp.`);

  let imagem: Imagem | undefined;
  if (entrada.arquivo && entrada.arquivo.size > 0) {
    const bytes = Buffer.from(await entrada.arquivo.arrayBuffer());
    imagem = { mime: validarImagem(bytes, entrada.arquivo.type), base64: bytes.toString('base64') };
  }

  // Uma conversa só, para sempre: cria na primeira pergunta e depois sempre continua nela.
  let conversa = await conversaUnica(u.id);
  if (!conversa) {
    conversa = await db.conversa.create({ data: { usuarioId: u.id, titulo: cifrar('Conversa com a assistente') } });
  } else if (conversa.status === 'ENCERRADA') {
    // Atendimento do farmacêutico terminou: a mesma conversa volta para a assistente.
    conversa = await db.conversa.update({ where: { id: conversa.id }, data: { status: 'ASSISTENTE', emergencia: false, motivoEncaminhamento: null } });
  }
  await salvar(conversa.id, 'CLIENTE', pergunta || '(enviou uma foto)', { autorId: u.id, teveImagem: !!imagem });
  if (conversa.status === 'EM_ATENDIMENTO') return conversa.id;

  // Camada 1: emergência (não depende da IA)
  const emerg = detectarEmergencia(pergunta);
  if (emerg) {
    await salvar(conversa.id, 'ASSISTENTE', respostaEmergencia(emerg), { dados: { emergencia: true, encaminhado: true } });
    await db.conversa.update({ where: { id: conversa.id }, data: { status: 'AGUARDANDO_FARMACEUTICO', emergencia: true, motivoEncaminhamento: `Possível emergência (${emerg})` } });
    await auditar('assistente.emergencia', { usuarioId: u.id, alvo: conversa.id, ip, detalhes: { tipo: emerg } });
    return conversa.id;
  }

  // Camada 2: IA com resposta estruturada
  const anteriores = (await mensagensDa(conversa.id)).slice(0, -1).filter((m) => m.autor === 'CLIENTE' || m.autor === 'ASSISTENTE');
  let r: RespostaAssistente;
  try {
    r = await consultarIA(anteriores.map((m) => ({ autor: m.autor as 'CLIENTE' | 'ASSISTENTE', texto: m.texto })), pergunta, imagem, cfg.assistente.nome);
  } catch (e) {
    if (!(e instanceof AssistenteIndisponivel)) throw e;
    console.error('[assistente]', e.message);
    await salvar(conversa.id, 'ASSISTENTE', 'Não consegui analisar agora. Toque em "Falar com o farmacêutico" para ser atendido pelo WhatsApp.', { dados: { encaminhado: true } });
    await db.conversa.update({ where: { id: conversa.id }, data: { status: 'AGUARDANDO_FARMACEUTICO', motivoEncaminhamento: 'Assistente indisponível' } });
    return conversa.id;
  }

  if (r.emergencia) {
    await salvar(conversa.id, 'ASSISTENTE', respostaEmergencia('medica'), { dados: { emergencia: true, encaminhado: true } });
    await db.conversa.update({ where: { id: conversa.id }, data: { status: 'AGUARDANDO_FARMACEUTICO', emergencia: true, motivoEncaminhamento: 'Possível emergência (detectada pela IA)' } });
    await auditar('assistente.emergencia', { usuarioId: u.id, alvo: conversa.id, ip, detalhes: { origem: 'ia' } });
    return conversa.id;
  }

  // Camada 3: verificação de tudo que vai ao cliente
  let resposta = r.resposta.trim() || RESPOSTA_SEGURA;
  let bloqueio: string | undefined;
  const v = verificarResposta(resposta);
  if (!v.ok) { bloqueio = v.motivo; resposta = RESPOSTA_SEGURA; }
  const medicamentos = r.medicamentos.slice(0, 8).map((m) => {
    const vm = m.indicacao ? verificarResposta(m.indicacao) : { ok: true as const };
    if (!vm.ok) bloqueio ??= vm.motivo;
    return { ...m, indicacao: vm.ok ? m.indicacao : null };
  });
  const informacoes = r.informacoes.slice(0, 6).filter((i) => {
    const vi = verificarResposta(i);
    if (!vi.ok) bloqueio ??= vi.motivo;
    return vi.ok;
  });

  // Catálogo: produtos dos medicamentos identificados; para sintoma, SOMENTE isentos de prescrição
  const produtos = bloqueio ? [] : await buscarProdutos(medicamentos.filter((m) => m.confianca !== 'baixa').map((m) => m.principio_ativo || m.nome));
  let sugestoes: DadosMensagem['sugestoes'];
  if (!bloqueio && !r.encaminhar_farmaceutico && r.sugestao_sintoma?.principios_ativos.length) {
    const ps = await buscarProdutos(r.sugestao_sintoma.principios_ativos.slice(0, 4), ['MIP', 'NAO_MEDICAMENTO'], 6);
    if (ps.length) sugestoes = { sintoma: r.sugestao_sintoma.sintoma.slice(0, 80), produtos: ps.filter((p) => p.disponivel > 0).slice(0, 4) };
  }

  const encaminhar = r.encaminhar_farmaceutico || !!bloqueio || !r.resposta.trim();
  await salvar(conversa.id, 'ASSISTENTE', resposta, { dados: { medicamentos, produtos, sugestoes, informacoes, encaminhado: encaminhar }, bloqueadaPorRegra: bloqueio });
  if (encaminhar) {
    await db.conversa.update({ where: { id: conversa.id }, data: { status: 'AGUARDANDO_FARMACEUTICO', motivoEncaminhamento: (bloqueio ? `Bloqueio automático: ${bloqueio}` : r.motivo_encaminhamento)?.slice(0, 200) ?? 'Dúvida sobre o caso do cliente' } });
  }
  await auditar('assistente.consulta', { usuarioId: u.id, alvo: conversa.id, ip, detalhes: { tipo: r.tipo_entrada, imagem: !!imagem, encaminhado: encaminhar, bloqueio: bloqueio ?? null, sugestaoSintoma: !!sugestoes } });
  return conversa.id;
}

// ── Equipe (farmacêutico) ──────────────────────────────────────────────────────

export async function filaAtendimento() {
  return db.conversa.findMany({
    where: { status: { in: ['AGUARDANDO_FARMACEUTICO', 'EM_ATENDIMENTO'] } },
    orderBy: [{ emergencia: 'desc' }, { atualizadoEm: 'asc' }],
    include: { usuario: { select: { nome: true, telefone: true } }, farmaceutico: { select: { nome: true } }, _count: { select: { mensagens: true } } },
  });
}

export async function assumirAtendimento(farm: UsuarioSessao, conversaId: string) {
  if (farm.papel !== 'FARMACEUTICO' && farm.papel !== 'ADMIN') throw new ErroNegocio('Somente farmacêuticos assumem o atendimento.', 403);
  await db.conversa.update({ where: { id: conversaId }, data: { status: 'EM_ATENDIMENTO', farmaceuticoId: farm.id } });
  await auditar('atendimento.assumido', { usuarioId: farm.id, alvo: conversaId });
}

export async function responderComoFarmaceutico(farm: UsuarioSessao, conversaId: string, texto: string, ip: string) {
  if (farm.papel !== 'FARMACEUTICO' && farm.papel !== 'ADMIN') throw new ErroNegocio('Somente farmacêuticos respondem no atendimento.', 403);
  const t = texto.trim();
  if (t.length < 2) throw new ErroNegocio('Escreva a resposta.');
  const c = await db.conversa.findUnique({ where: { id: conversaId } });
  if (!c || c.status === 'ENCERRADA') throw new ErroNegocio('Conversa encerrada ou inexistente.');
  await db.conversa.update({ where: { id: c.id }, data: { status: 'EM_ATENDIMENTO', farmaceuticoId: farm.id } });
  await salvar(c.id, 'FARMACEUTICO', t.slice(0, 3000), { autorId: farm.id });
  await auditar('atendimento.resposta', { usuarioId: farm.id, alvo: c.id, ip });
}

export async function finalizarAtendimento(farm: UsuarioSessao, conversaId: string) {
  if (farm.papel !== 'FARMACEUTICO' && farm.papel !== 'ADMIN') throw new ErroNegocio('Somente farmacêuticos encerram o atendimento.', 403);
  await db.conversa.update({ where: { id: conversaId }, data: { status: 'ENCERRADA' } });
  await salvar(conversaId, 'SISTEMA', `Atendimento concluído por ${farm.nome}${farm.crf ? ` (${farm.crf})` : ''}.`);
}
