import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';
import { config } from './config';
import { hashSenha, verificarSenha, sha256, tokenAleatorio } from './cripto';
import { ErroNegocio } from './erros';
import { auditar } from './auditoria';
import { pode, EQUIPE, type Permissao } from '@/lib/dominio';
import type { Papel } from '@/generated/prisma/enums';

export const COOKIE_SESSAO = 'fx_sessao';
const SENHA_FALSA = hashSenha('senha-falsa-para-tempo-constante');

export async function ipAtual() {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || '127.0.0.1').trim();
}

// ── Limite de tentativas em memória (por IP) — complementa o bloqueio por conta no banco
const janelas = new Map<string, { n: number; ate: number }>();
export function limitarTaxa(chave: string, max: number, janelaMs: number) {
  const agora = Date.now();
  const j = janelas.get(chave);
  if (!j || j.ate < agora) { janelas.set(chave, { n: 1, ate: agora + janelaMs }); return; }
  j.n++;
  if (j.n > max) throw new ErroNegocio('Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
}

export function validarSenhaForte(senha: string) {
  if (senha.length < 10 || !/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) {
    throw new ErroNegocio('A senha deve ter ao menos 10 caracteres, com letras e números.');
  }
}

async function criarSessao(usuarioId: string) {
  const token = tokenAleatorio();
  const expiraEm = new Date(Date.now() + config.sessaoDias * 86_400_000);
  const h = await headers();
  await db.sessao.create({ data: { tokenHash: sha256(token), usuarioId, expiraEm, ip: await ipAtual(), userAgent: h.get('user-agent')?.slice(0, 200) } });
  (await cookies()).set(COOKIE_SESSAO, token, { httpOnly: true, secure: config.producao, sameSite: 'lax', path: '/', expires: expiraEm });
}

export async function entrar(email: string, senha: string) {
  const ip = await ipAtual();
  limitarTaxa(`login:${ip}`, 20, 10 * 60_000);
  const u = await db.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!u || !u.ativo) {
    verificarSenha(senha, SENHA_FALSA); // tempo constante: não revela se o e-mail existe
    throw new ErroNegocio('E-mail ou senha inválidos.', 401);
  }
  if (u.bloqueadoAte && u.bloqueadoAte > new Date()) throw new ErroNegocio('Conta temporariamente bloqueada por tentativas inválidas. Tente em 15 minutos.', 423);
  if (!verificarSenha(senha, u.senhaHash)) {
    const n = u.tentativasFalhas + 1;
    await db.usuario.update({ where: { id: u.id }, data: { tentativasFalhas: n, bloqueadoAte: n >= 5 ? new Date(Date.now() + 15 * 60_000) : null } });
    await auditar('login.falha', { usuarioId: u.id, ip });
    throw new ErroNegocio('E-mail ou senha inválidos.', 401);
  }
  await db.usuario.update({ where: { id: u.id }, data: { tentativasFalhas: 0, bloqueadoAte: null } });
  await criarSessao(u.id);
  await auditar('login.sucesso', { usuarioId: u.id, ip });
  return u;
}

export async function iniciarSessao(usuarioId: string) {
  await criarSessao(usuarioId);
}

export async function sair() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await db.sessao.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(COOKIE_SESSAO);
}

/** Usuário da sessão atual (memorizado por requisição). */
export const usuarioAtual = cache(async () => {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  const s = await db.sessao.findUnique({
    where: { tokenHash: sha256(token) },
    include: { usuario: { select: { id: true, nome: true, email: true, papel: true, lojaId: true, crf: true, pontos: true, ativo: true, telefone: true } } },
  });
  if (!s || s.expiraEm < new Date() || !s.usuario.ativo) return null;
  return s.usuario;
});

export type UsuarioSessao = NonNullable<Awaited<ReturnType<typeof usuarioAtual>>>;

/** Exige login (para páginas). Redireciona para /entrar. */
export async function exigirLogin(voltar = '/conta') {
  const u = await usuarioAtual();
  if (!u) redirect(`/entrar?voltar=${encodeURIComponent(voltar)}`);
  return u;
}

/** Exige permissão de backoffice (para páginas e ações). */
export async function exigirPermissao(p: Permissao) {
  const u = await usuarioAtual();
  if (!u) redirect('/entrar?voltar=/admin');
  if (!pode(u.papel, p)) throw new ErroNegocio('Você não tem permissão para esta operação.', 403);
  return u;
}

/** Para ações: exige login sem redirecionar. */
export async function exigirUsuario() {
  const u = await usuarioAtual();
  if (!u) throw new ErroNegocio('Faça login para continuar.', 401);
  return u;
}

export const ehEquipe = (papel: Papel) => EQUIPE.includes(papel);

/** Para páginas do painel: visitante → login; cliente → loja; equipe sem permissão → painel. */
export async function paginaAdmin(p: Permissao) {
  const u = await usuarioAtual();
  if (!u) redirect('/entrar?voltar=/admin');
  if (!EQUIPE.includes(u.papel)) redirect('/');
  if (!pode(u.papel, p)) redirect('/admin?negado=1');
  return u;
}

/** Loja que o usuário da equipe enxerga (admin vê todas; demais, a própria). */
export const lojaDoUsuario = (u: UsuarioSessao) => (u.papel === 'ADMIN' || !u.lojaId ? null : u.lojaId);
