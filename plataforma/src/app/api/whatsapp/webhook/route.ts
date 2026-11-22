import { connection } from 'next/server';
import { obterSegredo } from '@/server/integracoes';
import { compararSeguro } from '@/server/cripto';
import { processarEvento } from '@/server/whatsapp/webhook';

/** Recebe os eventos da Evolution API (mensagens novas e confirmações de leitura). */
export async function POST(req: Request) {
  await connection();
  const esperado = await obterSegredo('WHATSAPP_WEBHOOK_TOKEN');
  const recebido = new URL(req.url).searchParams.get('token') ?? '';
  if (!esperado || !compararSeguro(recebido, esperado)) return new Response('Não autorizado', { status: 401 });
  const tamanho = Number(req.headers.get('content-length') ?? 0);
  if (tamanho > 12 * 1024 * 1024) return new Response('Grande demais', { status: 413 });
  try {
    await processarEvento(await req.json());
  } catch (e) {
    console.error('[whatsapp] webhook', e);
    return new Response('erro', { status: 500 });
  }
  return new Response('ok');
}
