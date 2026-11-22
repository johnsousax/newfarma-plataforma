import { connection } from 'next/server';
import { db } from '@/server/db';

/** Fotos de produto (públicas, com cache longo: o id muda quando a foto muda). */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Não encontrado', { status: 404 });
  const img = await db.imagemProduto.findUnique({ where: { id }, select: { mime: true, dados: true } });
  if (!img) return new Response('Não encontrado', { status: 404 });
  return new Response(new Uint8Array(img.dados), {
    headers: { 'content-type': img.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" },
  });
}
