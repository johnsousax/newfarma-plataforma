import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import { criarLancamento, baixarLancamento, gerarFolha, resumoFinanceiro, garantirPlanoPadrao } from '@/server/financeiro';
import { processarEvento } from '@/server/whatsapp/webhook';
import { mensagensDe } from '@/server/whatsapp/conversas';
import { situacaoFerias } from '@/server/funcionarios';
import { lerPeriodo, inicioDoDia } from '@/lib/periodo';
import { usuario } from './ajuda';

describe('financeiro', () => {
  it('parcela dividindo o valor, baixa e aparece no fluxo do período', async () => {
    const admin = await usuario('admin@farmacia.local');
    await garantirPlanoPadrao();
    const cat = await db.categoriaFinanceira.findFirstOrThrow({ where: { nome: 'Aluguel' } });
    const desc = `Teste parcela ${Date.now()}`;
    await criarLancamento({ tipo: 'DESPESA', descricao: desc, valor: 1000, vencimento: new Date(), categoriaId: cat.id, parcelas: 3 }, admin.id);
    const ls = await db.lancamento.findMany({ where: { descricao: { startsWith: desc } }, orderBy: { vencimento: 'asc' } });
    expect(ls.map((l) => l.valor)).toEqual([333, 333, 334]);
    expect(ls[2].descricao).toMatch(/\(3\/3\)$/);
    await baixarLancamento(ls[0].id, { pagoEm: new Date(), valorPago: 350 }, admin.id);
    await expect(baixarLancamento(ls[0].id, { pagoEm: new Date(), valorPago: 350 }, admin.id)).rejects.toThrow(/não está em aberto/);
    const hoje = inicioDoDia(new Date());
    const r = await resumoFinanceiro(hoje, new Date(hoje.getTime() + 86_400_000));
    expect(r.fluxo.reduce((s, d) => s + d.saidas, 0)).toBeGreaterThanOrEqual(350);
    expect(r.dre.linhas.some((l) => l.categoria === 'Aluguel')).toBe(true);
  });

  it('folha soma hora extra, desconta falta e não duplica no mesmo mês', async () => {
    const admin = await usuario('admin@farmacia.local');
    const f = await db.funcionario.create({ data: { nome: `Func ${Date.now()}`, cargo: 'Balconista', admissao: new Date('2025-01-10'), salario: 200000, valeTransporte: 20000 } });
    const mes = '2026-10';
    await db.ocorrenciaFuncionario.createMany({ data: [
      { funcionarioId: f.id, tipo: 'HORA_EXTRA', inicio: new Date('2026-10-05T12:00:00Z'), valor: 15000 },
      { funcionarioId: f.id, tipo: 'FALTA', inicio: new Date('2026-10-07T12:00:00Z'), valor: 6000 },
    ] });
    await gerarFolha(mes, admin.id);
    await gerarFolha(mes, admin.id);
    const ls = await db.lancamento.findMany({ where: { funcionarioId: f.id, origem: 'folha' }, orderBy: { valor: 'desc' } });
    expect(ls.map((l) => l.valor)).toEqual([209000, 20000]);
  });
});

describe('WhatsApp', () => {
  it('grava mensagem recebida (inclusive número LID), ignora grupo e repetição e atualiza leitura', async () => {
    const id = `TESTE${Date.now()}`;
    const evento = { event: 'messages.upsert', data: { key: { remoteJid: '123456@lid', remoteJidAlt: '5511988887777@s.whatsapp.net', fromMe: false, id }, pushName: 'Maria Teste', message: { conversation: 'Tem dipirona?' }, messageTimestamp: Math.floor(Date.now() / 1000) } };
    await processarEvento(evento);
    await processarEvento(evento);
    await processarEvento({ event: 'messages.upsert', data: { key: { remoteJid: '1203@g.us', fromMe: false, id: `${id}G` }, message: { conversation: 'grupo' } } });
    const c = await db.whatsappConversa.findUniqueOrThrow({ where: { telefone: '5511988887777' } });
    expect(c.nome).toBe('Maria Teste');
    const ms = await mensagensDe(c.id);
    expect(ms.filter((m) => m.texto === 'Tem dipirona?')).toHaveLength(1);
    expect(await db.whatsappMensagem.count({ where: { externoId: `${id}G` } })).toBe(0);
    // texto fica cifrado no banco
    expect((await db.whatsappMensagem.findUniqueOrThrow({ where: { externoId: id } })).textoCifrado).not.toContain('dipirona');
    await processarEvento({ event: 'MESSAGES_UPDATE', data: { keyId: id, status: 'READ' } });
    expect((await db.whatsappMensagem.findUniqueOrThrow({ where: { externoId: id } })).status).toBe('LIDA');
  });
});

describe('períodos e férias', () => {
  it('lê hoje, 7 dias e datas escolhidas no fuso de Brasília', () => {
    const h = lerPeriodo({ p: 'hoje' });
    expect(+h.fim - +h.inicio).toBe(86_400_000);
    expect(lerPeriodo({ p: '7d' }).inicio.getTime()).toBe(h.inicio.getTime() - 6 * 86_400_000);
    const d = lerPeriodo({ de: '2026-11-01', ate: '2026-11-10' });
    expect(d.chave).toBe('datas');
    expect(d.inicio.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(d.fim.toISOString()).toBe('2026-11-11T03:00:00.000Z');
  });

  it('calcula saldo de férias por período aquisitivo', () => {
    const s = situacaoFerias(new Date('2024-01-15'), [{ inicio: new Date('2025-03-01'), fim: new Date('2025-03-30') }], new Date('2026-02-01'));
    expect(s).toMatchObject({ direito: 60, tiradas: 30, saldo: 30 });
  });
});
