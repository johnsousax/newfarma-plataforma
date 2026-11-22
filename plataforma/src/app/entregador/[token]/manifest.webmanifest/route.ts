import { FARMACIA } from '@/lib/farmacia';

/** Manifesto do app do entregador: instala na tela do celular abrindo direto no link pessoal. */
export async function GET(_: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[\w-]{20,40}$/.test(token)) return new Response('Não encontrado', { status: 404 });
  return Response.json({
    name: `Entregas · ${FARMACIA.nome}`, short_name: 'Entregas', start_url: `/entregador/${token}`, scope: `/entregador/${token}`, id: `/entregador/${token}`,
    display: 'standalone', orientation: 'portrait', background_color: '#FFFFFF', theme_color: '#1B2A72', lang: 'pt-BR',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }, { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'private, max-age=3600' } });
}
