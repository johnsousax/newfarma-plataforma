import crypto from 'node:crypto';
import { config } from '../config.js';

// ---- Senhas: scrypt com sal aleatório -----------------------------------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export function verificarSenha(senha, armazenado) {
  try {
    const [alg, n, salB64, hashB64] = String(armazenado).split('$');
    if (alg !== 'scrypt') return false;
    const esperado = Buffer.from(hashB64, 'base64');
    const hash = crypto.scryptSync(senha, Buffer.from(salB64, 'base64'), esperado.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
    return crypto.timingSafeEqual(hash, esperado);
  } catch {
    return false;
  }
}

// ---- Criptografia de dados sensíveis: AES-256-GCM -----------------------
export function cifrar(texto) {
  if (texto === null || texto === undefined) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', config.chaves.criptografia, iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${dados.toString('base64')}`;
}

export function decifrar(cifrado) {
  if (!cifrado) return null;
  const [versao, iv, tag, dados] = String(cifrado).split(':');
  if (versao !== 'v1') throw new Error('Formato de cifra desconhecido');
  const d = crypto.createDecipheriv('aes-256-gcm', config.chaves.criptografia, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8');
}

// Índice cego: permite buscar por e-mail/CPF/telefone sem guardá-los em claro.
export function indiceCego(valor) {
  return crypto.createHmac('sha256', config.chaves.indice).update(String(valor).trim().toLowerCase()).digest('hex');
}

// ---- Tokens (JWT HS256) ---------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function assinarToken(payload, ttlSegundos = config.tokenTtlSegundos) {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { ...payload, iat: agora, exp: agora + ttlSegundos, jti: crypto.randomUUID() };
  const cabecalho = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const conteudo = b64url(JSON.stringify(corpo));
  const assinatura = crypto.createHmac('sha256', config.chaves.jwt).update(`${cabecalho}.${conteudo}`).digest('base64url');
  return `${cabecalho}.${conteudo}.${assinatura}`;
}

export function verificarToken(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) return null;
  const [cabecalho, conteudo, assinatura] = partes;
  let header;
  try { header = JSON.parse(Buffer.from(cabecalho, 'base64url')); } catch { return null; }
  if (header.alg !== 'HS256') return null; // impede "alg: none" e confusão de algoritmo
  const esperada = crypto.createHmac('sha256', config.chaves.jwt).update(`${cabecalho}.${conteudo}`).digest();
  const recebida = Buffer.from(assinatura, 'base64url');
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) return null;
  try {
    const corpo = JSON.parse(Buffer.from(conteudo, 'base64url'));
    if (!corpo.exp || corpo.exp < Math.floor(Date.now() / 1000)) return null;
    return corpo;
  } catch {
    return null;
  }
}

// ---- Assinatura de webhooks (HMAC-SHA256) -------------------------------
export function hmacHex(segredo, conteudo) {
  return crypto.createHmac('sha256', segredo).update(conteudo).digest('hex');
}

export function compararSeguro(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function verificarAssinaturaWebhook(segredo, corpoBruto, assinaturaRecebida) {
  const limpa = String(assinaturaRecebida || '').replace(/^sha256=/, '');
  return compararSeguro(hmacHex(segredo, corpoBruto), limpa);
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const uuid = () => crypto.randomUUID();
