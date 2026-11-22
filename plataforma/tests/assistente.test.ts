import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { detectarEmergencia, verificarResposta, RESPOSTA_SEGURA } from '@/server/assistente/regras';
import { usuario } from './ajuda';

// A IA real não é chamada nos testes: simulamos as respostas do modelo
const consultarIA = vi.fn();
vi.mock('@/server/assistente/ia', async (original) => {
  const mod = await original<typeof import('@/server/assistente/ia')>();
  return { ...mod, consultarIA: (...a: unknown[]) => consultarIA(...a) };
});
const { perguntar, conversaAtiva, mensagensDa, responderComoFarmaceutico } = await import('@/server/assistente/conversas');
const { AssistenteIndisponivel } = await import('@/server/assistente/ia');

const base = { tipo_entrada: 'pergunta', emergencia: false, medicamentos: [], encaminhar_farmaceutico: false, motivo_encaminhamento: null };
const CLIENTE = 'cliente3@exemplo.com';

beforeEach(async () => {
  consultarIA.mockReset();
  const u = await usuario(CLIENTE);
  await db.conversa.deleteMany({ where: { usuarioId: u.id } });
  await db.usuario.update({ where: { id: u.id }, data: { consentimentoAssistenteEm: new Date() } });
});

describe('regras do assistente (sem IA)', () => {
  it('detecta emergências comuns, inclusive sem acento', () => {
    expect(detectarEmergencia('estou com dor no peito forte')).toBe('medica');
    expect(detectarEmergencia('meu filho engoliu remedio da avo')).toBe('intoxicacao');
    expect(detectarEmergencia('Tomei a cartela inteira')).toBe('intoxicacao');
    expect(detectarEmergencia('não quero mais viver')).toBe('emocional');
    expect(detectarEmergencia('para que serve a dipirona?')).toBeNull();
  });

  it('bloqueia posologia, liberação de uso, recomendação e mudança de tratamento', () => {
    expect(verificarResposta('Tome 1 comprimido de 500 mg a cada 6 horas.').ok).toBe(false);
    expect(verificarResposta('Pode tomar junto com o anticoncepcional, sem problema.').ok).toBe(false);
    expect(verificarResposta('Eu recomendo usar o genérico.').ok).toBe(false);
    expect(verificarResposta('Pare de tomar a losartana.').ok).toBe(false);
    expect(verificarResposta('Esse remédio vai resolver o seu problema.').ok).toBe(false);
  });

  it('permite informação geral de bula', () => {
    expect(verificarResposta('Segundo a bula, a dipirona é indicada para dor e febre. Confirme com o farmacêutico.').ok).toBe(true);
    expect(verificarResposta('É um antibiótico: a venda exige receita retida, válida por 10 dias.').ok).toBe(true);
  });
});

describe('fluxo do assistente', () => {
  it('exige consentimento específico para dados de saúde', async () => {
    const u = await usuario(CLIENTE);
    await db.usuario.update({ where: { id: u.id }, data: { consentimentoAssistenteEm: null } });
    await expect(perguntar(u, 'oi', null, 'ip')).rejects.toThrow(/termo/);
  });

  it('emergência responde na hora, sem chamar a IA, e vai para a fila do farmacêutico', async () => {
    const u = await usuario(CLIENTE);
    await perguntar(u, 'minha filha bebeu o vidro de xarope', null, 'ip');
    expect(consultarIA).not.toHaveBeenCalled();
    const c = (await conversaAtiva(u.id))!;
    expect(c).toMatchObject({ status: 'AGUARDANDO_FARMACEUTICO', emergencia: true });
    const ms = await mensagensDa(c.id);
    expect(ms.at(-1)!.texto).toMatch(/0800 722 6001/);
  });

  it('resposta com dose é substituída pela mensagem segura e encaminhada', async () => {
    const u = await usuario(CLIENTE);
    consultarIA.mockResolvedValue({ ...base, resposta: 'Você pode tomar 2 comprimidos de 500 mg a cada 8 horas.' });
    await perguntar(u, 'quanto tomo de dipirona?', null, 'ip');
    const c = (await conversaAtiva(u.id))!;
    const ultima = (await mensagensDa(c.id)).at(-1)!;
    expect(ultima.texto).toBe(RESPOSTA_SEGURA);
    expect(ultima.bloqueadaPorRegra).toBe('posologia');
    expect(c.status).toBe('AGUARDANDO_FARMACEUTICO');
  });

  it('informação permitida chega ao cliente, com produtos do catálogo, e as mensagens ficam cifradas', async () => {
    const u = await usuario(CLIENTE);
    consultarIA.mockResolvedValue({
      ...base, tipo_entrada: 'foto_medicamento', resposta: 'Este é um medicamento à base de dipirona. Segundo a bula, é indicado para dor e febre.',
      medicamentos: [{ nome: 'Dipirona', principio_ativo: 'dipirona monoidratada', concentracao: '500mg', para_que_serve_segundo_a_bula: 'dor e febre', venda: 'isento_de_prescricao', confianca: 'alta' }],
    });
    await perguntar(u, 'o que é isso?', null, 'ip');
    const c = (await conversaAtiva(u.id))!;
    expect(c.status).toBe('ASSISTENTE');
    const ultima = (await mensagensDa(c.id)).at(-1)!;
    expect(ultima.dados?.produtos?.length).toBeGreaterThan(0);
    const bruto = await db.mensagem.findFirstOrThrow({ where: { conversaId: c.id, autor: 'ASSISTENTE' } });
    expect(bruto.textoCifrado).not.toMatch(/dipirona/i);
  });

  it('IA indisponível encaminha ao farmacêutico; depois disso a IA não responde mais', async () => {
    const u = await usuario(CLIENTE);
    consultarIA.mockRejectedValue(new AssistenteIndisponivel('sem chave'));
    await perguntar(u, 'posso misturar com álcool?', null, 'ip');
    const c = (await conversaAtiva(u.id))!;
    expect(c.status).toBe('AGUARDANDO_FARMACEUTICO');
    consultarIA.mockReset();
    await perguntar(u, 'alguém aí?', null, 'ip');
    expect(consultarIA).not.toHaveBeenCalled();
    await expect(responderComoFarmaceutico(await usuario('atendente@farmacia.local'), c.id, 'Olá', 'ip')).rejects.toThrow(/farmacêuticos/);
    await responderComoFarmaceutico(await usuario('farmaceutico@farmacia.local'), c.id, 'Olá! Não misture com álcool sem falar com seu médico.', 'ip');
    expect((await conversaAtiva(u.id))!.status).toBe('EM_ATENDIMENTO');
  });

  it('rejeita arquivo que não é imagem', async () => {
    const u = await usuario(CLIENTE);
    const falso = new File([new TextEncoder().encode('não sou imagem'.repeat(10))], 'x.png', { type: 'image/png' });
    await expect(perguntar(u, 'oi', falso, 'ip')).rejects.toThrow(/imagem válida/);
  });
});
