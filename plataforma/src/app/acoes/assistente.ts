'use server';
import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/server/db';
import { executar, ErroNegocio } from '@/server/erros';
import { exigirUsuario, exigirPermissao, ipAtual, limitarTaxa } from '@/server/auth';
import { auditar } from '@/server/auditoria';
import { perguntar, responderComoFarmaceutico, finalizarAtendimento, assumirAtendimento } from '@/server/assistente/conversas';
import { VERSAO_REGRAS } from '@/server/assistente/regras';

export async function aceitarTermoAssistente() {
  return executar(async () => {
    const u = await exigirUsuario();
    await db.usuario.update({ where: { id: u.id }, data: { consentimentoAssistenteEm: new Date() } });
    await auditar('assistente.consentimento', { usuarioId: u.id, ip: await ipAtual(), detalhes: { versaoRegras: VERSAO_REGRAS } });
    refresh();
  });
}

export async function revogarTermoAssistente() {
  return executar(async () => {
    const u = await exigirUsuario();
    await db.usuario.update({ where: { id: u.id }, data: { consentimentoAssistenteEm: null } });
    await auditar('assistente.consentimento_revogado', { usuarioId: u.id });
    refresh();
  });
}

/** Envia a pergunta na conversa única do cliente; devolve o id dessa conversa. */
export async function perguntarAcao(form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    limitarTaxa(`assistente:${u.id}`, 6, 60_000);
    const arquivo = form.get('foto');
    return perguntar(u, { texto: String(form.get('texto') ?? ''), arquivo: arquivo instanceof File && arquivo.size ? arquivo : null }, await ipAtual());
  });
}

// ── Painel ──

export async function responderAtendimentoAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('atendimento');
    await responderComoFarmaceutico(u, z.string().uuid().parse(form.get('conversaId')), String(form.get('texto') ?? ''), await ipAtual());
    refresh();
  }, 'Resposta enviada');
}

export async function assumirAtendimentoAcao(conversaId: string) {
  return executar(async () => {
    const u = await exigirPermissao('atendimento');
    await assumirAtendimento(u, z.string().uuid().parse(conversaId));
    refresh();
  });
}

export async function encerrarAtendimentoAcao(conversaId: string) {
  return executar(async () => {
    const u = await exigirPermissao('atendimento');
    if (!(await db.conversa.findUnique({ where: { id: z.string().uuid().parse(conversaId) } }))) throw new ErroNegocio('Conversa não encontrada.');
    await finalizarAtendimento(u, conversaId);
    refresh();
  });
}
