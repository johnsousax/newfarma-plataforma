import { connection } from 'next/server';
import { db } from '@/server/db';

/** Arte do banner (imagem enviada ou SVG do agente de design). */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Não encontrado', { status: 404 });
  const b = await db.banner.findUnique({ where: { id }, select: { imagem: true, imagemMime: true, svg: true } });
  const seguro = { 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:", 'cache-control': 'public, max-age=300' };
  if (b?.imagem && b.imagemMime) return new Response(new Uint8Array(b.imagem), { headers: { 'content-type': b.imagemMime, ...seguro } });
  if (b?.svg) return new Response(b.svg, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', ...seguro } });
  return new Response('Não encontrado', { status: 404 });
}
