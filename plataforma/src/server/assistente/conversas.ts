import 'server-only';
import { db } from '../db';
import { cifrar, decifrar } from '../cripto';
import { ErroNegocio } from '../erros';
import { auditar } from '../auditoria';
import { enriquecer } from '../catalogo';
import { normalizar } from '@/lib/texto';
import { consultarIA, AssistenteIndisponivel, type RespostaAssistente, type Imagem } from './ia';
import { detectarEmergencia, respostaEmergencia, verificarResposta, RESPOSTA_SEGURA } from './regras';
import type { UsuarioSessao } from '../auth';
import type { AutorMensagem } from '@/generated/prisma/enums';

const LIMITE_DIARIO = 40;
const MAX_IMAGEM = 5 * 1024 * 1024;
const ASSINATURAS: Record<Imagem['mime'], number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};

export type ProdutoSugerido = { slug: string; nome: string; preco: number; classificacao: string; disponivel: number; icone: string };
export type DadosMensagem = { medicamentos?: RespostaAssistente['medicamentos']; produtos?: ProdutoSugerido[]; emergencia?: boolean; encaminhado?: boolean };

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

export async function conversaAtiva(usuarioId: string) {
  return db.conversa.findFirst({ where: { usuarioId, status: { not: 'ENCERRADA' } }, orderBy: { atualizadoEm: 'desc' } });
}

export async function mensagensDa(conversaId: string) {
  const ms = await db.mensagem.findMany({ where: { conversaId }, orderBy: { criadoEm: 'asc' } });
  return ms.map((m) => ({
    id: m.id, autor: m.autor, criadoEm: m.criadoEm, teveImagem: m.teveImagem, bloqueadaPorRegra: m.bloqueadaPorRegra,
    texto: decifrar(m.textoCifrado) ?? '',
    dados: m.dadosCifrados ? (JSON.parse(decifrar(m.dadosCifrados) ?? '{}') as DadosMensagem) : null,
  }));
}

/** Produtos do catálogo com o mesmo princípio ativo dos medicamentos identificados. */
async function produtosRelacionados(meds: RespostaAssistente['medicamentos']): Promise<ProdutoSugerido[]> {
  const termos = meds.filter((m) => m.confianca !== 'baixa').map((m) => normalizar(m.principio_ativo || m.nome).split(' ')[0]).filter((t) => t.length >= 4);
  if (!termos.length) return [];
  const brutos = await db.produto.findMany({
    where: { ativo: true, OR: termos.map((t) => ({ busca: { contains: t } })) },
    take: 6, orderBy: [{ tipo: 'asc' }, { preco: 'asc' }],
    select: { id: true, slug: true, nome: true, icone: true, preco: true, precoDe: true, classificacao: true, tipo: true, categoriaId: true, marcaId: true, descricaoCurta: true, principioAtivo: true, concentracao: true, marca: { select: { nome: true, slug: true } }, categoria: { select: { paiId: true, nome: true, cor: true, slug: true } }, imagens: { select: { id: true }, orderBy: { ordem: 'asc' }, take: 1 } },
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
 * Pergunta do cliente ao assistente. Ordem das camadas de segurança:
 * consentimento → limite de uso → emergência (sem IA) → IA estruturada → verificação da resposta.
 * A imagem é processada e descartada: nunca é gravada.
 */
export async function perguntar(u: UsuarioSessao, texto: string, arquivo: File | null, ip: string) {
  const usuario = await db.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { consentimentoAssistenteEm: true } });
  if (!usuario.consentimentoAssistenteEm) throw new ErroNegocio('Para usar o assistente, aceite o termo de uso de dados de saúde.');
  const pergunta = texto.trim().slice(0, 1500);
  if (!pergunta && !arquivo) throw new ErroNegocio('Escreva sua dúvida ou envie uma foto.');

  const desde = new Date(Date.now() - 86_400_000);
  const usadas = await db.mensagem.count({ where: { autor: 'CLIENTE', criadoEm: { gte: desde }, conversa: { usuarioId: u.id } } });
  if (usadas >= LIMITE_DIARIO) throw new ErroNegocio('Você atingiu o limite de perguntas de hoje. Fale com o farmacêutico pelo botão abaixo ou volte amanhã.');

  let imagem: Imagem | undefined;
  if (arquivo && arquivo.size > 0) {
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    imagem = { mime: validarImagem(bytes, arquivo.type), base64: bytes.toString('base64') };
  }

  let conversa = await conversaAtiva(u.id);
  conversa ??= await db.conversa.create({ data: { usuarioId: u.id } });
  await salvar(conversa.id, 'CLIENTE', pergunta || '(enviou uma foto)', { autorId: u.id, teveImagem: !!imagem });

  // Com farmacêutico na conversa, a IA não responde mais: a mensagem vai para ele
  if (conversa.status === 'AGUARDANDO_FARMACEUTICO' || conversa.status === 'EM_ATENDIMENTO') return;

  // Camada 1: emergência (não depende da IA)
  const emerg = detectarEmergencia(pergunta);
  if (emerg) {
    await salvar(conversa.id, 'ASSISTENTE', respostaEmergencia(emerg), { dados: { emergencia: true, encaminhado: true } });
    await db.conversa.update({ where: { id: conversa.id }, data: { status: 'AGUARDANDO_FARMACEUTICO', emergencia: true, motivoEncaminhamento: `Possível emergência (${emerg})` } });
    await auditar('assistente.emergencia', { usuarioId: u.id, alvo: conversa.id, ip, detalhes: { tipo: emerg } });
    return;
  }

  // Camada 2: IA com resposta estruturada
  const anteriores = (await mensagensDa(conversa.id)).slice(0, -1).filter((m) => m.autor === 'CLIENTE' || m.autor === 'ASSISTENTE');
  let r: RespostaAssistente;
  try {
    r = await consultarIA(anteriores.map((m) => ({ autor: m.autor as 'CLIENTE' | 'ASSISTENTE', texto: m.texto })), pergunta, imagem);
  } catch (e) {
    if (!(e instanceof AssistenteIndisponivel)) throw e;
    console.error('[assistente]', e.message);
    await salvar(conversa.id, 'ASSISTENTE', 'O assistente automático está indisponível agora. Já avisei o farmacêutico da loja, que vai responder você por aqui.', { dados: { encaminhado: true } });
    await db.conversa.update({ where: { id: conversa.id }, data: { status: 'AGUARDANDO_FARMACEUTICO', motivoEncaminhamento: 'Assistente indisponível' } });
    return;
  }

  if (r.emergencia) {
    await salvar(conversa.id, 'ASSISTENTE', respostaEmergencia('medica'), { dados: { emergencia: true, encaminhado: true } });
    await db.conversa.update({ where: { id: conversa.id }, data: { status: 'AGUARDANDO_FARMACEUTICO', emergencia: true, motivoEncaminhamento: 'Possível emergência (detectada pela IA)' } });
    await auditar('assistente.emergencia', { usuarioId: u.id, alvo: conversa.id, ip, detalhes: { origem: 'ia' } });
    return;
  }

  // Camada 3: verificação do que vai ao cliente
  let resposta = r.resposta.trim() || RESPOSTA_SEGURA;
  let bloqueio: string | undefined;
  const v = verificarResposta(resposta);
  if (!v.ok) { bloqueio = v.motivo; resposta = RESPOSTA_SEGURA; }
  const medicamentos = r.medicamentos.slice(0, 8).map((m) => {
    const vm = m.para_que_serve_segundo_a_bula ? verificarResposta(m.para_que_serve_segundo_a_bula) : { ok: true as const };
    if (!vm.ok) bloqueio ??= vm.motivo;
    return { ...m, para_que_serve_segundo_a_bula: vm.ok ? m.para_que_serve_segundo_a_bula : null };
  });
  const encaminhar = r.encaminhar_farmaceutico || !!bloqueio || !r.resposta.trim();
  const produtos = await produtosRelacionados(medicamentos);

  await salvar(conversa.id, 'ASSISTENTE', resposta, { dados: { medicamentos, produtos, encaminhado: encaminhar }, bloqueadaPorRegra: bloqueio });
  if (encaminhar) {
    await db.conversa.update({ where: { id: conversa.id }, data: { status: 'AGUARDANDO_FARMACEUTICO', motivoEncaminhamento: (bloqueio ? `Bloqueio automático: ${bloqueio}` : r.motivo_encaminhamento)?.slice(0, 200) ?? 'Dúvida sobre o caso do cliente' } });
  }
  await auditar('assistente.consulta', { usuarioId: u.id, alvo: conversa.id, ip, detalhes: { tipo: r.tipo_entrada, imagem: !!imagem, encaminhado: encaminhar, bloqueio: bloqueio ?? null } });
}

export async function chamarFarmaceutico(u: UsuarioSessao, motivo = 'Cliente pediu para falar com o farmacêutico') {
  let c = await conversaAtiva(u.id);
  c ??= await db.conversa.create({ data: { usuarioId: u.id } });
  if (c.status === 'ASSISTENTE') {
    await db.conversa.update({ where: { id: c.id }, data: { status: 'AGUARDANDO_FARMACEUTICO', motivoEncaminhamento: motivo } });
    await salvar(c.id, 'SISTEMA', 'Você entrou na fila de atendimento. Um farmacêutico vai responder por aqui assim que possível.');
  }
}

export async function encerrarConversa(usuarioId: string, conversaId: string) {
  await db.conversa.updateMany({ where: { id: conversaId, usuarioId }, data: { status: 'ENCERRADA' } });
}

// ── Equipe (farmacêutico) ──────────────────────────────────────────────────────

export async function filaAtendimento() {
  return db.conversa.findMany({
    where: { status: { in: ['AGUARDANDO_FARMACEUTICO', 'EM_ATENDIMENTO'] } },
    orderBy: [{ emergencia: 'desc' }, { atualizadoEm: 'asc' }],
    include: { usuario: { select: { nome: true, telefone: true } }, farmaceutico: { select: { nome: true } }, _count: { select: { mensagens: true } } },
  });
}

export async function responderComoFarmaceutico(farm: UsuarioSessao, conversaId: string, texto: string, ip: string) {
  if (farm.papel !== 'FARMACEUTICO') throw new ErroNegocio('Somente farmacêuticos respondem no atendimento.', 403);
  const t = texto.trim();
  if (t.length < 2) throw new ErroNegocio('Escreva a resposta.');
  const c = await db.conversa.findUnique({ where: { id: conversaId } });
  if (!c || c.status === 'ENCERRADA') throw new ErroNegocio('Conversa encerrada ou inexistente.');
  await db.conversa.update({ where: { id: c.id }, data: { status: 'EM_ATENDIMENTO', farmaceuticoId: farm.id } });
  await salvar(c.id, 'FARMACEUTICO', t.slice(0, 3000), { autorId: farm.id });
  await auditar('atendimento.resposta', { usuarioId: farm.id, alvo: c.id, ip });
}

export async function finalizarAtendimento(farm: UsuarioSessao, conversaId: string) {
  if (farm.papel !== 'FARMACEUTICO') throw new ErroNegocio('Somente farmacêuticos encerram o atendimento.', 403);
  await db.conversa.update({ where: { id: conversaId }, data: { status: 'ENCERRADA' } });
  await salvar(conversaId, 'SISTEMA', `Atendimento encerrado por ${farm.nome}${farm.crf ? ` (${farm.crf})` : ''}. Se precisar, é só mandar uma nova mensagem.`);
}
