import { connection } from 'next/server';
import { usuarioAtual } from '@/server/auth';
import { arquivoReceita } from '@/server/receitas';
import { auditar } from '@/server/auditoria';
import { temPermissao } from '@/server/permissoes';

/** Entrega a receita decifrada somente para farmacêutico/gestão, registrando cada acesso. */
export async function GET(_: Request, ctx: RouteContext<'/api/admin/receitas/[id]'>) {
  await connection();
  const u = await usuarioAtual();
  if (!u || !(await temPermissao(u.papel, 'verReceitas'))) return new Response('Acesso negado', { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Não encontrado', { status: 404 });
  const a = await arquivoReceita(id);
  if (!a) return new Response('Não encontrado', { status: 404 });
  await auditar('receita.visualizada', { usuarioId: u.id, alvo: id });
  return new Response(new Uint8Array(a.bytes), {
    headers: { 'content-type': a.mime, 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", 'content-disposition': 'inline' },
  });
}
