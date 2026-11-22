import { connection } from 'next/server';
import { usuarioAtual } from '@/server/auth';
import { temPermissao } from '@/server/permissoes';
import { listarConversas, mensagensDe, marcarLida } from '@/server/whatsapp/conversas';

/** Atualização da tela do WhatsApp (lista e mensagens novas), consultada a cada poucos segundos. */
export async function GET(req: Request) {
  await connection();
  const u = await usuarioAtual();
  if (!u || !(await temPermissao(u.papel, 'atendimento'))) return Response.json({ erro: 'Sem permissão' }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const conversa = q.get('conversa');
  const desde = q.get('desde');
  const [conversas, mensagens] = await Promise.all([
    listarConversas(q.get('busca') ?? undefined),
    conversa && /^[0-9a-f-]{36}$/.test(conversa) ? mensagensDe(conversa, desde ? new Date(desde) : undefined) : Promise.resolve(null),
  ]);
  if (conversa && mensagens?.length) await marcarLida(conversa).catch(() => {});
  return Response.json({ conversas, mensagens }, { headers: { 'cache-control': 'no-store' } });
}
