import 'server-only';
import { db, type Tx } from './db';
import { sha256 } from './cripto';
import type { Prisma } from '@/generated/prisma/client';

type Entrada = { usuarioId?: string | null; alvo?: string | null; ip?: string | null; detalhes?: Prisma.InputJsonValue };

/**
 * Registra um evento na trilha encadeada por hash. Um advisory lock serializa as
 * inserções, garantindo que cada registro aponte para o anterior mesmo sob concorrência.
 */
export async function auditar(acao: string, e: Entrada = {}, tx?: Tx) {
  const run = async (t: Tx) => {
    await t.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
    const ultimo = await t.auditoria.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });
    const hashAnterior = ultimo?.hash ?? 'GENESIS';
    const criadoEm = new Date();
    const base = { acao, usuarioId: e.usuarioId ?? null, alvo: e.alvo ?? null, ip: e.ip ?? null, detalhes: e.detalhes ?? null, criadoEm: criadoEm.toISOString(), hashAnterior };
    const hash = sha256(JSON.stringify(base));
    await t.auditoria.create({ data: { acao, usuarioId: base.usuarioId, alvo: base.alvo, ip: base.ip, detalhes: e.detalhes, hashAnterior, hash, criadoEm } });
  };
  if (tx) return run(tx);
  return db.$transaction(run);
}

/** Recalcula a cadeia inteira e aponta o primeiro registro adulterado, se houver. */
export async function verificarCadeia() {
  const registros = await db.auditoria.findMany({ orderBy: { seq: 'asc' } });
  let anterior = 'GENESIS';
  for (const r of registros) {
    const base = { acao: r.acao, usuarioId: r.usuarioId, alvo: r.alvo, ip: r.ip, detalhes: r.detalhes ?? null, criadoEm: r.criadoEm.toISOString(), hashAnterior: r.hashAnterior };
    if (r.hashAnterior !== anterior || sha256(JSON.stringify(base)) !== r.hash) return { integra: false, total: registros.length, falhaEm: r.seq };
    anterior = r.hash;
  }
  return { integra: true, total: registros.length, falhaEm: null };
}
