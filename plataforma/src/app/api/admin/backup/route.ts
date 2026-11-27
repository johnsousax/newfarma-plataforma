import { connection } from 'next/server';
import { gzipSync } from 'node:zlib';
import { db } from '@/server/db';
import { usuarioAtual, exigirSegundoFatorRecente } from '@/server/auth';
import { auditar } from '@/server/auditoria';
import { temPermissao } from '@/server/permissoes';
import { ErroNegocio } from '@/server/erros';

/**
 * Cópia de segurança dos dados da farmácia (JSON compactado). Ficam de fora só os arquivos
 * binários (fotos, receitas, mídias do WhatsApp) e os segredos de login — dados pessoais
 * sensíveis já estão cifrados no banco e seguem cifrados no arquivo.
 */
const FORA = new Set(['_prisma_migrations', 'Sessao', 'TokenSenha', 'LimiteTaxa']);
const COLUNAS_SECRETAS = new Set(['senhaHash', 'totpSegredoCifrado', 'codigosRecuperacao', 'token', 'tokenHash', 'valorCifrado']);

export async function GET() {
  await connection();
  const u = await usuarioAtual();
  if (!u || !(await temPermissao(u.papel, 'backup'))) return new Response('Acesso negado', { status: 403 });
  try { await exigirSegundoFatorRecente(u); } catch (e) { return new Response((e as ErroNegocio).message, { status: 403 }); }

  const colunas = await db.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position`;
  const tabelas = new Map<string, string[]>();
  for (const c of colunas) {
    if (FORA.has(c.table_name) || c.data_type === 'bytea' || COLUNAS_SECRETAS.has(c.column_name)) continue;
    tabelas.set(c.table_name, [...(tabelas.get(c.table_name) ?? []), c.column_name]);
  }
  const dados: Record<string, unknown[]> = {};
  for (const [t, cols] of tabelas) {
    if (!/^[A-Za-z_]+$/.test(t) || cols.some((c) => !/^[A-Za-z_]+$/.test(c))) continue;
    dados[t] = await db.$queryRawUnsafe(`SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM "${t}"`);
  }
  const conteudo = JSON.stringify({ geradoEm: new Date().toISOString(), por: u.email, versao: 1, tabelas: dados }, (_, v) => (typeof v === 'bigint' ? Number(v) : v));
  const gz = gzipSync(Buffer.from(conteudo));
  const registros = Object.values(dados).reduce((s, l) => s + l.length, 0);
  await auditar('backup.baixado', { usuarioId: u.id, detalhes: { tabelas: Object.keys(dados).length, registros, bytes: gz.length } });
  const nome = `newfarma-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json.gz`;
  return new Response(new Uint8Array(gz), { headers: { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${nome}"`, 'cache-control': 'no-store' } });
}
