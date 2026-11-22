import { db } from '@/server/db';
import { sha256, tokenAleatorio } from '@/server/cripto';
import type { UsuarioSessao } from '@/server/auth';

const jar = () => (globalThis as unknown as { __jar: Map<string, string> }).__jar;

/** Usuário do seed no formato da sessão. */
export async function usuario(email: string): Promise<UsuarioSessao> {
  return db.usuario.findUniqueOrThrow({ where: { email }, select: { id: true, nome: true, email: true, papel: true, lojaId: true, crf: true, pontos: true, ativo: true, telefone: true } });
}

/** "Loga" o usuário no cookie simulado (para funções que leem a sessão). */
export async function logar(email: string) {
  const u = await usuario(email);
  const t = tokenAleatorio();
  await db.sessao.create({ data: { tokenHash: sha256(t), usuarioId: u.id, expiraEm: new Date(Date.now() + 3_600_000) } });
  jar().clear();
  jar().set('fx_sessao', t);
  return u;
}

export function deslogar() { jar().clear(); }

export async function produto(where: { principioAtivo?: string; classificacao?: 'MIP' | 'ANTIMICROBIANO' | 'CONTROLADO' | 'NAO_MEDICAMENTO' | 'TARJA_VERMELHA'; nome?: string }) {
  return db.produto.findFirstOrThrow({ where: { ativo: true, ...(where.nome ? { nome: { startsWith: where.nome } } : {}), ...(where.principioAtivo ? { principioAtivo: where.principioAtivo } : {}), ...(where.classificacao ? { classificacao: where.classificacao } : {}) }, orderBy: { sku: 'asc' } });
}

export const lojaPaulista = () => db.loja.findUniqueOrThrow({ where: { slug: 'matriz' } });

/** Garante estoque controlado de um produto numa loja (zera os demais lotes dela). */
export async function definirEstoque(produtoId: string, lojaId: string, quantidade: number) {
  await db.lote.updateMany({ where: { produtoId, lojaId }, data: { quantidade: 0, reservado: 0 } });
  await db.lote.create({ data: { produtoId, lojaId, codigo: `T${Date.now()}${Math.random().toString(36).slice(2, 6)}`, validade: new Date(Date.now() + 300 * 86_400_000), quantidade } });
}

export async function enderecoPrincipal(usuarioId: string) {
  return db.endereco.findFirstOrThrow({ where: { usuarioId, principal: true } });
}

export async function esvaziarCarrinho(usuarioId: string) {
  await db.carrinho.deleteMany({ where: { usuarioId } });
}
