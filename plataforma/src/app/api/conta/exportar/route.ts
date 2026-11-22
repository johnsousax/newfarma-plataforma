import { connection } from 'next/server';
import { db } from '@/server/db';
import { usuarioAtual } from '@/server/auth';
import { decifrar } from '@/server/cripto';
import { auditar } from '@/server/auditoria';

/** Exportação dos dados do titular (LGPD art. 18, V — portabilidade). */
export async function GET() {
  await connection();
  const u = await usuarioAtual();
  if (!u) return new Response('Não autenticado', { status: 401 });
  const c = await db.usuario.findUniqueOrThrow({
    where: { id: u.id },
    include: {
      enderecos: true, favoritos: { include: { produto: { select: { nome: true } } } }, assinaturas: true, lembretes: true, movPontos: true,
      pedidos: { include: { itens: { select: { nome: true, quantidade: true, total: true } } } }, avaliacoes: true,
      conversas: { include: { mensagens: { orderBy: { criadoEm: 'asc' } } } },
    },
  });
  const { senhaHash: _s, cpfCifrado, cpfHash: _h, tentativasFalhas: _t, bloqueadoAte: _b, conversas, ...resto } = c;
  const atendimentos = conversas.map((cv) => ({ id: cv.id, status: cv.status, criadoEm: cv.criadoEm, mensagens: cv.mensagens.map((m) => ({ autor: m.autor, em: m.criadoEm, texto: decifrar(m.textoCifrado), teveImagem: m.teveImagem })) }));
  await auditar('conta.exportacao_lgpd', { usuarioId: u.id });
  return new Response(JSON.stringify({ geradoEm: new Date().toISOString(), ...resto, cpf: decifrar(cpfCifrado), atendimentos }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="meus-dados.json"', 'cache-control': 'no-store' },
  });
}
