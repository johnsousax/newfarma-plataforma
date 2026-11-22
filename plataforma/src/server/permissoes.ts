import 'server-only';
import { cache } from 'react';
import { db } from './db';
import { auditar } from './auditoria';
import { PERMISSOES, CARGOS_EDITAVEIS, pode, type MatrizPermissoes, type Permissao } from '@/lib/dominio';
import type { Papel } from '@/generated/prisma/enums';

const CHAVE = 'permissoes';

/** Matriz em vigor: padrão + ajustes do dono (memorizado por requisição). O Administrador sempre tem tudo. */
export const matrizPermissoes = cache(async (): Promise<MatrizPermissoes> => {
  const base = Object.fromEntries(Object.entries(PERMISSOES).map(([k, v]) => [k, [...v]])) as MatrizPermissoes;
  const salvo = await db.configuracao.findUnique({ where: { chave: CHAVE } }).catch(() => null);
  if (salvo && typeof salvo.valor === 'object' && salvo.valor) {
    for (const [k, papeis] of Object.entries(salvo.valor as Record<string, string[]>)) {
      if (k in base && Array.isArray(papeis)) base[k as Permissao] = [...papeis.filter((p): p is Papel => CARGOS_EDITAVEIS.includes(p as Papel)), 'ADMIN'];
    }
  }
  return base;
});

export async function temPermissao(papel: Papel | null | undefined, p: Permissao) {
  if (papel === 'ADMIN') return true;
  return pode(papel, p, await matrizPermissoes());
}

export async function salvarMatriz(matriz: Record<string, string[]>, usuarioId: string) {
  const limpa = Object.fromEntries(Object.keys(PERMISSOES).map((k) => [k, (matriz[k] ?? []).filter((p) => CARGOS_EDITAVEIS.includes(p as Papel))]));
  await db.configuracao.upsert({ where: { chave: CHAVE }, create: { chave: CHAVE, valor: limpa, atualizadoPor: usuarioId }, update: { valor: limpa, atualizadoPor: usuarioId } });
  await auditar('permissoes.atualizadas', { usuarioId, detalhes: limpa });
}

export async function restaurarPadrao(usuarioId: string) {
  await db.configuracao.deleteMany({ where: { chave: CHAVE } });
  await auditar('permissoes.restauradas', { usuarioId });
}
