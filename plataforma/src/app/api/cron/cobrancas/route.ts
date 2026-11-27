import { connection } from 'next/server';
import { compararSeguro } from '@/server/cripto';
import { enviarCobrancas } from '@/server/crediario';

/** Chamado pela Vercel Cron todo dia (vercel.json). Protegido por CRON_SECRET. */
export async function GET(req: Request) {
  await connection();
  const segredo = process.env.CRON_SECRET;
  const recebido = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!segredo || !compararSeguro(recebido, segredo)) return new Response('Acesso negado', { status: 401 });
  try {
    const r = await enviarCobrancas(null);
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message });
  }
}
