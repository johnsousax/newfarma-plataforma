'use server';
import { refresh } from 'next/cache';
import { z } from 'zod';
import { executar, ErroNegocio } from '@/server/erros';
import { limitarTaxa, ipAtual } from '@/server/auth';
import { motoboyPorToken, registrarPosicao } from '@/server/entregas';
import { confirmarEntregaMotoboy } from '@/server/pedidos';

export async function enviarPosicaoAcao(token: string, lat: number, lng: number) {
  return executar(async () => {
    limitarTaxa(`pos:${token}`, 120, 60 * 60_000);
    await registrarPosicao(z.string().parse(token), z.number().parse(lat), z.number().parse(lng));
  });
}

export async function confirmarEntregaAcao(token: string, pedidoId: string) {
  return executar(async () => {
    limitarTaxa(`entrega:${await ipAtual()}`, 60, 60 * 60_000);
    const m = await motoboyPorToken(z.string().parse(token));
    if (!m?.ativo) throw new ErroNegocio('Link inválido.', 404);
    await confirmarEntregaMotoboy(z.string().uuid().parse(pedidoId), m.id);
    refresh();
  }, 'Entrega confirmada');
}
