import { connection } from 'next/server';
import { db } from '@/server/db';
import { usuarioAtual, lojaDoUsuario } from '@/server/auth';
import { auditar } from '@/server/auditoria';
import { alocacoesDe } from '@/server/pedidos';
import { temPermissao } from '@/server/permissoes';

export async function GET() {
  await connection();
  const u = await usuarioAtual();
  if (!u || !(await temPermissao(u.papel, 'anvisa'))) return new Response('Acesso negado', { status: 403 });
  const loja = lojaDoUsuario(u);
  const lista = await db.escrituracao.findMany({ where: { transmitidoSngpc: false, ...(loja ? { lojaId: loja } : {}) }, orderBy: { criadoEm: 'asc' }, include: { pedido: { select: { numero: true } } } });
  const linhas = ['data;pedido;registro_ms;principio_ativo;lote;validade;quantidade;prescritor;crf_farmaceutico'];
  for (const e of lista) for (const l of alocacoesDe(e.lotes)) linhas.push([e.criadoEm.toISOString(), e.pedido.numero, e.registroAnvisa, e.principioAtivo, l.codigo, l.validade.slice(0, 10), l.quantidade, e.registroPrescritor ?? '', e.crfFarmaceutico].join(';'));
  await auditar('sngpc.exportado', { usuarioId: u.id, detalhes: { registros: lista.length } });
  return new Response('﻿' + linhas.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="sngpc-pendentes.csv"', 'cache-control': 'no-store' } });
}
