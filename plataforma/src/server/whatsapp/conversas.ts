import 'server-only';
import { db } from '../db';
import { cifrar, decifrar, cifrarBytes, decifrarBytes } from '../cripto';
import { ErroNegocio } from '../erros';
import { auditar } from '../auditoria';
import { enviarTexto } from './evolution';
import type { StatusMensagemWhats } from '@/generated/prisma/enums';

export const soDigitos = (t: string) => t.replace(/\D/g, '');
/** Número brasileiro com DDI (55) */
export function normalizarNumero(t: string) {
  const d = soDigitos(t);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

const MIDIA_MAX = 6 * 1024 * 1024;

type Recebida = { externoId: string; numero: string; nome?: string | null; deMim: boolean; tipo: string; texto?: string | null; midiaBase64?: string | null; midiaMime?: string | null; arquivoNome?: string | null; quando: Date };

const previa = (tipo: string, texto?: string | null) => (texto ? texto.slice(0, 80) : ({ imagem: 'Foto', audio: 'Áudio', video: 'Vídeo', documento: 'Documento', figurinha: 'Figurinha' } as Record<string, string>)[tipo] ?? 'Mensagem');

/** Grava mensagem vinda do webhook (recebida ou enviada pelo celular da loja). Idempotente pelo id externo. */
export async function registrarMensagem(m: Recebida) {
  if (await db.whatsappMensagem.findUnique({ where: { externoId: m.externoId }, select: { id: true } })) return;
  const cliente = await db.usuario.findFirst({ where: { telefone: { in: [m.numero, m.numero.replace(/^55/, '')] } }, select: { id: true, nome: true } });
  const conversa = await db.whatsappConversa.upsert({
    where: { telefone: m.numero },
    create: { telefone: m.numero, nome: (!m.deMim && m.nome) || cliente?.nome || null, usuarioId: cliente?.id ?? null, ultimaPrevia: previa(m.tipo, m.texto), ultimaEm: m.quando, naoLidas: m.deMim ? 0 : 1 },
    update: { ...(m.deMim || !m.nome ? {} : { nome: m.nome }), ultimaPrevia: previa(m.tipo, m.texto), ultimaEm: m.quando, arquivada: false, ...(m.deMim ? {} : { naoLidas: { increment: 1 } }) },
  });
  let midia: Uint8Array<ArrayBuffer> | null = null;
  if (m.midiaBase64) {
    const b = Buffer.from(m.midiaBase64, 'base64');
    if (b.length <= MIDIA_MAX) midia = new Uint8Array(cifrarBytes(b));
  }
  await db.whatsappMensagem.create({
    data: {
      conversaId: conversa.id, externoId: m.externoId, deMim: m.deMim, tipo: m.tipo, textoCifrado: m.texto ? cifrar(m.texto) : null,
      midia, midiaMime: midia ? m.midiaMime ?? null : null, arquivoNome: m.arquivoNome ?? null, status: m.deMim ? 'ENVIADA' : 'RECEBIDA', criadoEm: m.quando,
    },
  });
}

const ACK: Record<string, StatusMensagemWhats> = { SERVER_ACK: 'ENVIADA', DELIVERY_ACK: 'ENTREGUE', READ: 'LIDA', PLAYED: 'LIDA', ERROR: 'ERRO' };
export async function atualizarStatus(externoId: string, status: string) {
  const st = ACK[status];
  if (st) await db.whatsappMensagem.updateMany({ where: { externoId }, data: { status: st } });
}

export async function listarConversas(busca?: string) {
  const b = busca?.trim();
  return db.whatsappConversa.findMany({
    where: b ? { OR: [{ nome: { contains: b, mode: 'insensitive' } }, { telefone: { contains: soDigitos(b) || '¬' } }] } : { arquivada: false },
    orderBy: { ultimaEm: 'desc' }, take: 150,
    select: { id: true, telefone: true, nome: true, ultimaPrevia: true, ultimaEm: true, naoLidas: true },
  });
}

export async function mensagensDe(conversaId: string, depois?: Date) {
  const ms = await db.whatsappMensagem.findMany({
    where: { conversaId, ...(depois ? { criadoEm: { gt: depois } } : {}) }, orderBy: { criadoEm: depois ? 'asc' : 'desc' }, take: depois ? 100 : 80,
    select: { id: true, deMim: true, tipo: true, textoCifrado: true, midiaMime: true, arquivoNome: true, status: true, criadoEm: true, midia: false },
  });
  const lista = depois ? ms : ms.reverse();
  return lista.map(({ textoCifrado, ...m }) => ({ ...m, texto: decifrar(textoCifrado), temMidia: !!m.midiaMime, criadoEm: m.criadoEm.toISOString() }));
}

export async function marcarLida(conversaId: string) {
  await db.whatsappConversa.update({ where: { id: conversaId }, data: { naoLidas: 0 } });
}

export async function midiaDa(id: string) {
  const m = await db.whatsappMensagem.findUnique({ where: { id }, select: { midia: true, midiaMime: true, arquivoNome: true } });
  if (!m?.midia || !m.midiaMime) return null;
  return { bytes: decifrarBytes(m.midia), mime: m.midiaMime, nome: m.arquivoNome };
}

/** Envia texto pela loja e já mostra na conversa (o status é atualizado pelo webhook). */
export async function responder(usuarioId: string, alvo: { conversaId?: string; numero?: string }, texto: string) {
  const t = texto.trim();
  if (!t) throw new ErroNegocio('Escreva a mensagem.');
  if (t.length > 4000) throw new ErroNegocio('Mensagem muito longa.');
  const conversa = alvo.conversaId
    ? await db.whatsappConversa.findUnique({ where: { id: alvo.conversaId } })
    : await db.whatsappConversa.upsert({ where: { telefone: normalizarNumero(alvo.numero ?? '') }, create: { telefone: normalizarNumero(alvo.numero ?? '') }, update: {} });
  if (!conversa) throw new ErroNegocio('Conversa não encontrada.', 404);
  if (conversa.telefone.length < 12) throw new ErroNegocio('Número inválido. Use DDD + número.');
  const msg = await db.whatsappMensagem.create({ data: { conversaId: conversa.id, deMim: true, tipo: 'texto', textoCifrado: cifrar(t), status: 'ENVIANDO', autorId: usuarioId } });
  try {
    const externoId = await enviarTexto(conversa.telefone, t);
    // o webhook pode chegar antes desta linha com o mesmo id: nesse caso, remove a duplicata
    const dup = externoId ? await db.whatsappMensagem.findUnique({ where: { externoId }, select: { id: true } }) : null;
    if (dup && dup.id !== msg.id) await db.whatsappMensagem.delete({ where: { id: dup.id } });
    await db.whatsappMensagem.update({ where: { id: msg.id }, data: { externoId, status: 'ENVIADA' } });
  } catch (e) {
    await db.whatsappMensagem.update({ where: { id: msg.id }, data: { status: 'ERRO' } });
    throw e;
  }
  await db.whatsappConversa.update({ where: { id: conversa.id }, data: { ultimaPrevia: t.slice(0, 80), ultimaEm: new Date(), naoLidas: 0, arquivada: false } });
  await auditar('whatsapp.enviada', { usuarioId, alvo: conversa.id });
  return conversa.id;
}
