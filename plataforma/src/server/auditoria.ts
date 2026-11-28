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
    const hash = sha256(canonico(base));
    await t.auditoria.create({ data: { acao, usuarioId: base.usuarioId, alvo: base.alvo, ip: base.ip, detalhes: e.detalhes, hashAnterior, hash, criadoEm, versaoHash: 2 } });
  };
  if (tx) return run(tx);
  return db.$transaction(run);
}

/**
 * JSON com as chaves em ordem alfabética (em todos os níveis). O PostgreSQL (jsonb) não guarda a
 * ordem das chaves; sem isto o hash recalculado não bateria e a cadeia pareceria adulterada.
 */
export function canonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (typeof (v as { toJSON?: unknown }).toJSON === 'function') return canonico((v as { toJSON: () => unknown }).toJSON());
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
}

function permutacoes<T>(a: T[]): T[][] {
  return a.length <= 1 ? [a] : a.flatMap((x, i) => permutacoes([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Hash antigo: tenta a ordem devolvida e, para poucos campos, todas as ordens possíveis dos detalhes. */
function confereLegado(base: Record<string, unknown>, hash: string) {
  if (sha256(JSON.stringify(base)) === hash) return true;
  const d = base.detalhes;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const chaves = Object.keys(d as object);
  if (chaves.length < 2 || chaves.length > 7) return false;
  return permutacoes(chaves).some((ordem) => sha256(JSON.stringify({ ...base, detalhes: Object.fromEntries(ordem.map((k) => [k, (d as Record<string, unknown>)[k]])) })) === hash);
}

/**
 * Recalcula a cadeia inteira. Cada registro precisa apontar para o anterior e ter o hash do
 * próprio conteúdo. Registros antigos (versão 1) cuja ordem de campos não dá para reconstruir não são
 * dados como adulterados (a tabela é imutável no banco desde 25/11), mas são contados à parte.
 */
export async function verificarCadeia() {
  const registros = await db.auditoria.findMany({ orderBy: { seq: 'asc' } });
  let anterior = 'GENESIS';
  let naoConferidos = 0;
  for (const r of registros) {
    const base = { acao: r.acao, usuarioId: r.usuarioId, alvo: r.alvo, ip: r.ip, detalhes: r.detalhes ?? null, criadoEm: r.criadoEm.toISOString(), hashAnterior: r.hashAnterior };
    if (r.hashAnterior !== anterior) return { integra: false, total: registros.length, falhaEm: r.seq, naoConferidos };
    if (r.versaoHash >= 2) {
      if (sha256(canonico(base)) !== r.hash) return { integra: false, total: registros.length, falhaEm: r.seq, naoConferidos };
    } else if (!confereLegado(base, r.hash)) {
      naoConferidos++;
    }
    anterior = r.hash;
  }
  return { integra: true, total: registros.length, falhaEm: null, naoConferidos };
}
