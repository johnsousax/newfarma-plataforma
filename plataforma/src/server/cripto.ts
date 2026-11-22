import 'server-only';
import crypto from 'node:crypto';
import { config } from './config';

// AES-256-GCM: confidencialidade + integridade. Formato: v1.iv.tag.dados (base64url)
export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', config.chaves.dados, iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), dados.toString('base64url')].join('.');
}

export function decifrar(cifrado: string | null | undefined): string | null {
  if (!cifrado) return null;
  const [v, iv, tag, dados] = cifrado.split('.');
  if (v !== 'v1') throw new Error('Formato de cifra desconhecido');
  const d = crypto.createDecipheriv('aes-256-gcm', config.chaves.dados, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64url')), d.final()]).toString('utf8');
}

export function cifrarBytes(bytes: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', config.chaves.dados, iv);
  const dados = Buffer.concat([c.update(bytes), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]);
}

export function decifrarBytes(buf: Buffer | Uint8Array): Buffer {
  const b = Buffer.from(buf);
  const d = crypto.createDecipheriv('aes-256-gcm', config.chaves.dados, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]);
}

/** Hash determinístico com chave (permite busca por CPF sem guardá-lo em claro). */
export const indiceCpf = (cpf: string) => crypto.createHmac('sha256', config.chaves.indice).update(cpf.replace(/\D/g, '')).digest('hex');

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const tokenAleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

// scrypt (memory-hard) para senhas
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function hashSenha(senha: string): string {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, sal, 64, SCRYPT);
  return `scrypt$${sal.toString('base64url')}$${h.toString('base64url')}`;
}
export function verificarSenha(senha: string, armazenado: string): boolean {
  const [alg, sal, h] = armazenado.split('$');
  if (alg !== 'scrypt' || !sal || !h) return false;
  const esperado = Buffer.from(h, 'base64url');
  const calc = crypto.scryptSync(senha, Buffer.from(sal, 'base64url'), esperado.length, SCRYPT);
  return crypto.timingSafeEqual(esperado, calc);
}

export const hmacHex = (chave: Buffer, corpo: string | Buffer) => crypto.createHmac('sha256', chave).update(corpo).digest('hex');
export function compararSeguro(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
