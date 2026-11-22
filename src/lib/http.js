import fs from 'node:fs';
import path from 'node:path';

export class HttpError extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

export const erro = (status, mensagem, detalhes) => new HttpError(status, mensagem, detalhes);

// ---- Cabeçalhos de segurança ----------------------------------------------
export function cabecalhosSeguranca(res, isProd) {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; " +
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
}

// ---- Limitador de requisições (janela fixa por IP + chave) -----------------
export class RateLimiter {
  constructor() { this.janelas = new Map(); }
  permitir(chave, limite, janelaMs) {
    const agora = Date.now();
    const j = this.janelas.get(chave);
    if (!j || j.reinicia <= agora) {
      this.janelas.set(chave, { contagem: 1, reinicia: agora + janelaMs });
      if (this.janelas.size > 50_000) this.limpar(agora);
      return true;
    }
    j.contagem += 1;
    return j.contagem <= limite;
  }
  limpar(agora = Date.now()) { for (const [k, v] of this.janelas) if (v.reinicia <= agora) this.janelas.delete(k); }
}

// ---- Leitura de corpo com limite ------------------------------------------
export function lerCorpo(req, limite) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', (c) => {
      tamanho += c.length;
      if (tamanho > limite) { reject(erro(413, 'Corpo da requisição muito grande')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

// ---- Roteador simples -------------------------------------------------------
export class Router {
  constructor() { this.rotas = []; }
  add(metodo, caminho, opcoes, handler) {
    if (typeof opcoes === 'function') { handler = opcoes; opcoes = {}; }
    const nomes = [];
    const regex = new RegExp('^' + caminho.replace(/:([a-zA-Z]+)/g, (_, n) => { nomes.push(n); return '([^/]+)'; }) + '/?$');
    this.rotas.push({ metodo, regex, nomes, opcoes, handler });
  }
  get(...a) { this.add('GET', ...a); }
  post(...a) { this.add('POST', ...a); }
  patch(...a) { this.add('PATCH', ...a); }
  encontrar(metodo, caminho) {
    let caminhoExiste = false;
    for (const r of this.rotas) {
      const m = caminho.match(r.regex);
      if (!m) continue;
      caminhoExiste = true;
      if (r.metodo !== metodo) continue;
      const params = Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      return { rota: r, params };
    }
    return caminhoExiste ? { metodoInvalido: true } : null;
  }
}

export function enviarJson(res, status, dados) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(corpo);
}

// ---- Arquivos estáticos (com proteção contra path traversal) ----------------
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

export function servirEstatico(res, pastaPublica, caminhoUrl) {
  const relativo = caminhoUrl === '/' ? 'index.html' : caminhoUrl.replace(/^\/+/, '');
  const alvo = path.resolve(pastaPublica, relativo);
  if (!alvo.startsWith(pastaPublica + path.sep)) return false;
  let arquivo = alvo;
  if (!fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
    if (path.extname(relativo)) return false;
    arquivo = path.join(pastaPublica, 'index.html'); // fallback SPA
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(arquivo).pipe(res);
  return true;
}

// ---- Validação ------------------------------------------------------------------
export function exigirCampos(obj, campos) {
  const faltando = campos.filter((c) => obj?.[c] === undefined || obj?.[c] === null || obj?.[c] === '');
  if (faltando.length) throw erro(400, `Campos obrigatórios: ${faltando.join(', ')}`);
}

export const texto = (v, max = 500) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export function inteiroPositivo(v, nome) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 1_000_000) throw erro(400, `${nome} deve ser um inteiro positivo`);
  return n;
}
