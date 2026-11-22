import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';
import { ErroNegocio } from './erros';
import { auditar } from './auditoria';
import { avancarStatus } from './pedidos';
import { normalizar } from '@/lib/texto';
import type { UsuarioSessao } from './auth';

export const novoToken = () => crypto.randomBytes(18).toString('base64url');

export async function salvarZona(d: { id?: string | null; lojaId: string; bairro: string; taxa: number; prazoMinutos: number; ativo: boolean }, usuarioId: string) {
  const dados = { lojaId: d.lojaId, bairro: d.bairro.trim(), bairroBusca: normalizar(d.bairro), taxa: d.taxa, prazoMinutos: d.prazoMinutos, ativo: d.ativo };
  try {
    const z = d.id ? await db.zonaEntrega.update({ where: { id: d.id }, data: dados }) : await db.zonaEntrega.create({ data: dados });
    await auditar(d.id ? 'zona.editada' : 'zona.criada', { usuarioId, alvo: z.id, detalhes: { bairro: z.bairro, taxa: z.taxa } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new ErroNegocio('Esse bairro já está cadastrado.');
    throw e;
  }
}

/** Despacha: pedido em separação → saiu para entrega, com o motoboy e o repasse dele. */
export async function despachar(operador: UsuarioSessao, pedidoId: string, motoboyId: string, ip: string) {
  const m = await db.motoboy.findUnique({ where: { id: motoboyId } });
  if (!m?.ativo) throw new ErroNegocio('Motoboy inativo ou não encontrado.');
  const p = await db.pedido.findUnique({ where: { id: pedidoId }, select: { status: true, modalidade: true } });
  if (!p) throw new ErroNegocio('Pedido não encontrado.', 404);
  if (p.modalidade === 'RETIRADA') throw new ErroNegocio('Pedido de retirada não vai para entrega.');
  if (p.status === 'SAIU_PARA_ENTREGA') {
    // troca de motoboy em rota
    await db.pedido.update({ where: { id: pedidoId }, data: { motoboyId, taxaMotoboy: m.taxaPorEntrega } });
  } else {
    await avancarStatus(operador, pedidoId, 'SAIU_PARA_ENTREGA', ip);
    await db.pedido.update({ where: { id: pedidoId }, data: { motoboyId, despachadoEm: new Date(), taxaMotoboy: m.taxaPorEntrega } });
  }
  await auditar('pedido.despachado', { usuarioId: operador.id, alvo: pedidoId, ip, detalhes: { motoboy: m.nome } });
  return m;
}

export const motoboyPorToken = (token: string) =>
  /^[\w-]{20,40}$/.test(token) ? db.motoboy.findUnique({ where: { token } }) : Promise.resolve(null);

export async function registrarPosicao(token: string, lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ErroNegocio('Posição inválida.');
  const m = await motoboyPorToken(token);
  if (!m?.ativo) throw new ErroNegocio('Link inválido.', 404);
  await db.motoboy.update({ where: { id: m.id }, data: { latitude: lat, longitude: lng, posicaoEm: new Date() } });
}

/** Repasse por motoboy num período (entregas concluídas). */
export async function repasses(inicio: Date, fim: Date) {
  const g = await db.pedido.groupBy({ by: ['motoboyId'], where: { motoboyId: { not: null }, status: 'ENTREGUE', entregueEm: { gte: inicio, lt: fim } }, _count: true, _sum: { taxaMotoboy: true, frete: true } });
  return new Map(g.map((x) => [x.motoboyId!, { entregas: x._count, repasse: x._sum.taxaMotoboy ?? 0, fretes: x._sum.frete ?? 0 }]));
}
