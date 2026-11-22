import 'server-only';
import { registrarMensagem, atualizarStatus, soDigitos } from './conversas';

type Msg = Record<string, unknown> & { base64?: string };
type Dado = { key?: { remoteJid?: string; remoteJidAlt?: string; senderPn?: string; fromMe?: boolean; id?: string }; keyId?: string; pushName?: string; message?: Msg; messageType?: string; messageTimestamp?: number | string; status?: string };

/** Número do contato a partir do JID (ignora grupos, status e canais). */
function numeroDe(k: NonNullable<Dado['key']>) {
  let jid = k.remoteJid ?? '';
  if (jid.endsWith('@lid')) jid = k.remoteJidAlt ?? k.senderPn ?? '';
  if (!jid.endsWith('@s.whatsapp.net')) return null;
  const n = soDigitos(jid.split('@')[0].split(':')[0]);
  return n.length >= 10 ? n : null;
}

function conteudo(m: Msg | undefined): { tipo: string; texto: string | null; mime: string | null; nome: string | null } {
  if (!m) return { tipo: 'outro', texto: null, mime: null, nome: null };
  const g = (o: unknown, k: string) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined) as Record<string, unknown> | string | undefined;
  if (typeof m.conversation === 'string') return { tipo: 'texto', texto: m.conversation, mime: null, nome: null };
  const ext = g(m, 'extendedTextMessage');
  if (ext && typeof g(ext, 'text') === 'string') return { tipo: 'texto', texto: g(ext, 'text') as string, mime: null, nome: null };
  const docComLegenda = g(g(m, 'documentWithCaptionMessage'), 'message');
  const pares: [string, unknown][] = [['imagem', g(m, 'imageMessage')], ['audio', g(m, 'audioMessage')], ['video', g(m, 'videoMessage')], ['documento', g(m, 'documentMessage') ?? g(docComLegenda, 'documentMessage')], ['figurinha', g(m, 'stickerMessage')]];
  for (const [tipo, o] of pares) {
    if (o) return { tipo, texto: (g(o, 'caption') as string) || null, mime: ((g(o, 'mimetype') as string) || '').split(';')[0] || null, nome: (g(o, 'fileName') as string) || null };
  }
  return { tipo: 'outro', texto: '[mensagem não suportada: abra no celular]', mime: null, nome: null };
}

export async function processarEvento(corpo: { event?: string; data?: Dado | Dado[] }) {
  const evento = (corpo.event ?? '').toLowerCase().replace(/_/g, '.');
  const itens = Array.isArray(corpo.data) ? corpo.data : corpo.data ? [corpo.data] : [];
  if (evento === 'messages.upsert') {
    for (const d of itens) {
      if (!d.key?.id) continue;
      const numero = numeroDe(d.key);
      if (!numero) continue;
      const c = conteudo(d.message);
      const ts = Number(d.messageTimestamp);
      await registrarMensagem({
        externoId: d.key.id, numero, nome: d.pushName ?? null, deMim: !!d.key.fromMe, tipo: c.tipo, texto: c.texto,
        midiaBase64: typeof d.message?.base64 === 'string' ? d.message.base64 : null, midiaMime: c.mime, arquivoNome: c.nome,
        quando: ts > 1e9 ? new Date(ts * 1000) : new Date(),
      });
    }
  } else if (evento === 'messages.update') {
    for (const d of itens) {
      const id = d.keyId ?? d.key?.id;
      if (id && d.status) await atualizarStatus(id, d.status);
    }
  }
}
