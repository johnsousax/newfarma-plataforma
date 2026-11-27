import 'server-only';
import crypto from 'node:crypto';

/**
 * Verificação em duas etapas por código de 6 dígitos (TOTP, RFC 6238) — compatível com
 * Google Authenticator, Microsoft Authenticator, Authy etc. Sem dependências externas.
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PASSO_SEGUNDOS = 30;

export function base32(buf: Buffer) {
  let bits = 0, valor = 0, saida = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte; bits += 8;
    while (bits >= 5) { saida += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

function deBase32(s: string) {
  const limpo = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, valor = 0;
  const out: number[] = [];
  for (const c of limpo) {
    valor = (valor << 5) | ALFABETO.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const gerarSegredo = () => base32(crypto.randomBytes(20));

export function codigoNoPasso(segredo: string, passo: number) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const h = crypto.createHmac('sha1', deBase32(segredo)).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export const passoAtual = (agora = Date.now()) => Math.floor(agora / 1000 / PASSO_SEGUNDOS);

/**
 * Confere o código aceitando 1 passo de folga (relógio do celular adiantado/atrasado).
 * Devolve o passo usado — gravado para o mesmo código não valer duas vezes — ou null.
 */
export function verificarTotp(segredo: string, codigo: string, ultimoPasso?: number | null, agora = Date.now()) {
  const c = codigo.replace(/\D/g, '');
  if (c.length !== 6) return null;
  const p = passoAtual(agora);
  for (const d of [0, -1, 1]) {
    const passo = p + d;
    if (ultimoPasso != null && passo <= ultimoPasso) continue;
    const esperado = codigoNoPasso(segredo, passo);
    if (crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(c))) return passo;
  }
  return null;
}

/** Link que abre o app autenticador no celular já com a conta configurada. */
export const linkOtpauth = (segredo: string, email: string, emissor = 'New Farma Popular') =>
  `otpauth://totp/${encodeURIComponent(`${emissor}:${email}`)}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=${PASSO_SEGUNDOS}`;

/** 8 códigos de recuperação (uso único) — mostrados uma vez; no banco ficam só os hashes. */
export function gerarCodigosRecuperacao() {
  const codigos = Array.from({ length: 8 }, () => {
    const s = base32(crypto.randomBytes(6)).slice(0, 8);
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  return { codigos, hashes: codigos.map(hashRecuperacao) };
}

export const hashRecuperacao = (c: string) => crypto.createHash('sha256').update(c.toUpperCase().replace(/[^A-Z2-7]/g, '')).digest('hex');

/** Minutos em que uma confirmação do 2º fator libera ações críticas (backup, permissões, cancelar nota). */
export const JANELA_REAUTENTICACAO_MIN = 15;
