import { connection } from 'next/server';
import { db } from '@/server/db';
import { usuarioAtual, lojaDoUsuario } from '@/server/auth';
import { auditar } from '@/server/auditoria';
import { temPermissao } from '@/server/permissoes';

const csv = (v: unknown) => { const s = String(v ?? ''); return /[";\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');

/** Exporta pedidos do período em CSV (padrão brasileiro: ; e vírgula decimal). */
export async function GET(req: Request) {
  await connection();
  const u = await usuarioAtual();
  if (!u || !(await temPermissao(u.papel, 'relatorios'))) return new Response('Acesso negado', { status: 403 });
  const p = new URL(req.url).searchParams;
  const de = new Date(`${p.get('de') ?? '2000-01-01'}T00:00:00-03:00`);
  const ate = new Date(`${p.get('ate') ?? '2100-01-01'}T23:59:59-03:00`);
  if (Number.isNaN(+de) || Number.isNaN(+ate)) return new Response('Período inválido', { status: 400 });
  const loja = lojaDoUsuario(u) ?? p.get('loja') ?? undefined;
  const pedidos = await db.pedido.findMany({ where: { criadoEm: { gte: de, lte: ate }, ...(loja ? { lojaId: loja } : {}) }, orderBy: { criadoEm: 'asc' }, include: { loja: { select: { nome: true } } }, take: 50_000 });
  const linhas = [['numero', 'data', 'loja', 'canal', 'modalidade', 'status', 'pagamento', 'subtotal', 'descontos', 'frete', 'total', 'pontos_usados', 'pontos_ganhos'].join(';')];
  for (const x of pedidos) linhas.push([x.numero, x.criadoEm.toISOString(), x.loja.nome, x.canal, x.modalidade, x.status, x.metodoPagamento ?? '', reais(x.subtotal), reais(x.descontoPromocoes + x.descontoCupom + x.descontoPontos), reais(x.frete), reais(x.total), x.pontosUsados, x.pontosGanhos].map(csv).join(';'));
  await auditar('relatorio.exportado', { usuarioId: u.id, detalhes: { de: de.toISOString(), ate: ate.toISOString(), linhas: pedidos.length } });
  return new Response('﻿' + linhas.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="vendas-${p.get('de')}-a-${p.get('ate')}.csv"`, 'cache-control': 'no-store' } });
}
