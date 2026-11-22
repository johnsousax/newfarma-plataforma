import { connection } from 'next/server';
import { db } from '@/server/db';
import { usuarioAtual } from '@/server/auth';
import { temPermissao } from '@/server/permissoes';

/** Pedidos que ficaram pagos desde o instante informado (impressão automática). */
export async function GET(req: Request) {
  await connection();
  const u = await usuarioAtual();
  if (!u || !(await temPermissao(u.papel, 'pedidos'))) return Response.json({ erro: 'Sem permissão' }, { status: 403 });
  const desde = new Date(Math.max(Number(new URL(req.url).searchParams.get('desde')) || 0, Date.now() - 3_600_000));
  const agora = Date.now();
  const pedidos = await db.pedido.findMany({
    where: { canal: { not: 'PDV' }, ...(u.lojaId && u.papel !== 'ADMIN' ? { lojaId: u.lojaId } : {}), eventos: { some: { status: 'PAGO', criadoEm: { gt: desde } } } },
    select: { id: true, numero: true }, take: 20,
  });
  return Response.json({ pedidos, agora }, { headers: { 'cache-control': 'no-store' } });
}
