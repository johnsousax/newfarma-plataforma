import { connection } from 'next/server';
import { usuarioAtual } from '@/server/auth';
import { temPermissao } from '@/server/permissoes';
import { midiaDa } from '@/server/whatsapp/conversas';

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const u = await usuarioAtual();
  if (!u || !(await temPermissao(u.papel, 'atendimento'))) return new Response('Sem permissão', { status: 403 });
  const { id } = await ctx.params;
  const m = /^[0-9a-f-]{36}$/.test(id) ? await midiaDa(id) : null;
  if (!m) return new Response('Não encontrado', { status: 404 });
  const seguro = /^(image\/(jpeg|png|webp|gif)|audio\/|video\/mp4)/.test(m.mime) ? m.mime : 'application/octet-stream';
  return new Response(new Uint8Array(m.bytes), {
    headers: {
      'content-type': seguro, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'",
      ...(seguro === 'application/octet-stream' ? { 'content-disposition': `attachment; filename="${(m.nome ?? 'arquivo').replace(/[^\w.-]/g, '_')}"` } : {}),
    },
  });
}
