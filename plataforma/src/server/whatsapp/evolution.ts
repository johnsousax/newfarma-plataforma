import 'server-only';
import crypto from 'node:crypto';
import { obterSegredo, salvarSegredo } from '../integracoes';
import { ErroNegocio } from '../erros';
import { FARMACIA } from '@/lib/farmacia';

/** Integração com a Evolution API (WhatsApp por QR Code), a mesma usada no Katalogu. */
export const INSTANCIA = process.env.EVOLUTION_INSTANCIA || 'newfarma-popular';
export const EVENTOS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'];

async function credenciais() {
  const [url, chave] = await Promise.all([obterSegredo('EVOLUTION_URL'), obterSegredo('EVOLUTION_API_KEY')]);
  if (!url || !chave) throw new ErroNegocio('Configure o servidor da Evolution API (endereço e chave) para ligar o WhatsApp.');
  return { url: url.replace(/\/+$/, ''), chave };
}

export async function evolution<T = unknown>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; dados: T }> {
  const { url, chave } = await credenciais();
  const r = await fetch(`${url}${caminho}`, {
    method: init.method ?? 'GET',
    headers: { apikey: chave, 'content-type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  }).catch((e: Error) => { throw new ErroNegocio(`Servidor do WhatsApp não respondeu (${e.message}).`); });
  const texto = await r.text();
  let dados: unknown = texto;
  try { dados = JSON.parse(texto); } catch { /* resposta sem JSON */ }
  return { ok: r.ok, status: r.status, dados: dados as T };
}

export async function tokenWebhook(usuarioId: string) {
  let t = await obterSegredo('WHATSAPP_WEBHOOK_TOKEN');
  if (!t) { t = crypto.randomBytes(24).toString('base64url'); await salvarSegredo('WHATSAPP_WEBHOOK_TOKEN', t, usuarioId); }
  return t;
}

const urlWebhook = (token: string) => `${FARMACIA.site.replace(/\/+$/, '')}/api/whatsapp/webhook?token=${token}`;

export async function estadoConexao(): Promise<'aberta' | 'conectando' | 'fechada' | 'sem_instancia' | 'nao_configurado'> {
  try {
    const r = await evolution<{ instance?: { state?: string } }>(`/instance/connectionState/${INSTANCIA}`);
    if (r.status === 404) return 'sem_instancia';
    const st = r.dados?.instance?.state;
    return st === 'open' ? 'aberta' : st === 'connecting' ? 'conectando' : 'fechada';
  } catch (e) {
    if (e instanceof ErroNegocio && /Configure/.test(e.message)) return 'nao_configurado';
    return 'fechada';
  }
}

/** Cria a instância (se preciso), aponta o webhook para o site e devolve o QR Code para escanear. */
export async function conectar(usuarioId: string): Promise<{ qr: string | null; codigo: string | null; conectado: boolean }> {
  const token = await tokenWebhook(usuarioId);
  const webhook = { enabled: true, url: urlWebhook(token), byEvents: false, base64: true, events: EVENTOS };
  const criar = await evolution<{ qrcode?: { base64?: string; pairingCode?: string } }>('/instance/create', {
    method: 'POST',
    body: { instanceName: INSTANCIA, integration: 'WHATSAPP-BAILEYS', qrcode: true, webhook },
  });
  if (!criar.ok && criar.status !== 403 && criar.status !== 409) throw new ErroNegocio(`Não foi possível criar a conexão (erro ${criar.status}).`);
  await evolution(`/webhook/set/${INSTANCIA}`, { method: 'POST', body: { webhook } });
  if ((await estadoConexao()) === 'aberta') return { qr: null, codigo: null, conectado: true };
  const qr = criar.ok && criar.dados?.qrcode?.base64 ? criar.dados.qrcode : (await evolution<{ base64?: string; pairingCode?: string }>(`/instance/connect/${INSTANCIA}`)).dados;
  return { qr: qr?.base64 ?? null, codigo: qr?.pairingCode ?? null, conectado: false };
}

export async function desconectar() {
  await evolution(`/instance/logout/${INSTANCIA}`, { method: 'DELETE' });
}

export async function enviarTexto(numero: string, texto: string) {
  const r = await evolution<{ key?: { id?: string } }>(`/message/sendText/${INSTANCIA}`, { method: 'POST', body: { number: numero, text: texto } });
  if (!r.ok) throw new ErroNegocio(r.status === 400 ? 'Este número não tem WhatsApp ou está incorreto.' : `WhatsApp recusou o envio (erro ${r.status}). Verifique a conexão.`);
  return r.dados?.key?.id ?? null;
}
