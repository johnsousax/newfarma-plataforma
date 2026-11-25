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

const base = { tipo_entrada: 'pergunta', emergencia: false, medicamentos: [], sugestao_sintoma: null, informacoes: [], encaminhar_farmaceutico: false, motivo_encaminhamento: null };
const CLIENTE = 'cliente3@exemplo.com';

beforeEach(async () => {
  consultarIA.mockReset();
  const u = await usuario(CLIENTE);
  await db.conversa.deleteMany({ where: { usuarioId: u.id } });
  await db.configuracao.deleteMany({});
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
    await expect(perguntar(u, { texto: 'oi', arquivo: null }, 'ip')).rejects.toThrow(/termo/);
  });

  it('emergência responde na hora, sem chamar a IA, e vai para a fila do farmacêutico', async () => {
    const u = await usuario(CLIENTE);
    await perguntar(u, { texto: 'minha filha bebeu o vidro de xarope', arquivo: null }, 'ip');
    expect(consultarIA).not.toHaveBeenCalled();
    const c = (await conversaAtiva(u.id))!;
    expect(c).toMatchObject({ status: 'AGUARDANDO_FARMACEUTICO', emergencia: true });
    const ms = await mensagensDa(c.id);
    expect(ms.at(-1)!.texto).toMatch(/0800 722 6001/);
  });

  it('resposta com dose é substituída pela mensagem segura e encaminhada', async () => {
    const u = await usuario(CLIENTE);
    consultarIA.mockResolvedValue({ ...base, resposta: 'Você pode tomar 2 comprimidos de 500 mg a cada 8 horas.' });
    await perguntar(u, { texto: 'quanto tomo de dipirona?', arquivo: null }, 'ip');
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
      medicamentos: [{ nome: 'Dipirona', principio_ativo: 'dipirona monoidratada', concentracao: '500mg', indicacao: 'dor e febre', venda: 'isento_de_prescricao', confianca: 'alta' }],
    });
    await perguntar(u, { texto: 'o que é isso?', arquivo: null }, 'ip');
    const c = (await conversaAtiva(u.id))!;
    expect(c.status).toBe('ASSISTENTE');
    const ultima = (await mensagensDa(c.id)).at(-1)!;
    expect(ultima.dados?.produtos?.length).toBeGreaterThan(0);
    const bruto = await db.mensagem.findFirstOrThrow({ where: { conversaId: c.id, autor: 'ASSISTENTE' } });
    expect(bruto.textoCifrado).not.toMatch(/dipirona/i);
  });

  it('IA indisponível encaminha ao farmacêutico; com o farmacêutico atendendo, a IA não responde', async () => {
    const u = await usuario(CLIENTE);
    consultarIA.mockRejectedValue(new AssistenteIndisponivel('sem chave'));
    await perguntar(u, { texto: 'posso misturar com álcool?', arquivo: null }, 'ip');
    const c = (await conversaAtiva(u.id))!;
    expect(c.status).toBe('AGUARDANDO_FARMACEUTICO');
    await expect(responderComoFarmaceutico(await usuario('atendente@farmacia.local'), c.id, 'Olá', 'ip')).rejects.toThrow(/farmacêuticos/);
    await responderComoFarmaceutico(await usuario('farmaceutico@farmacia.local'), c.id, 'Olá! Não misture com álcool sem falar com seu médico.', 'ip');
    expect((await conversaAtiva(u.id))!.status).toBe('EM_ATENDIMENTO');
    consultarIA.mockReset();
    await perguntar(u, { texto: 'obrigado', arquivo: null }, 'ip');
    expect(consultarIA).not.toHaveBeenCalled();
  });

  it('sintoma leve: só mostra produtos SEM receita, mesmo se a IA sugerir um que exige receita', async () => {
    const u = await usuario(CLIENTE);
    consultarIA.mockResolvedValue({ ...base, tipo_entrada: 'sintoma', resposta: 'Para dor de cabeça leve, analgésicos como dipirona e paracetamol são indicados.', sugestao_sintoma: { sintoma: 'dor de cabeça', principios_ativos: ['dipirona', 'ibuprofeno'] } });
    const id = await perguntar(u, { texto: 'estou com dor de cabeça', arquivo: null }, 'ip');
    const ultima = (await mensagensDa(id)).at(-1)!;
    const sugeridos = ultima.dados?.sugestoes?.produtos ?? [];
    expect(sugeridos.length).toBeGreaterThan(0);
    expect(sugeridos.every((p) => p.classificacao === 'MIP' || p.classificacao === 'NAO_MEDICAMENTO')).toBe(true);
  });

  it('é uma conversa só, para sempre: todas as perguntas caem na mesma; limite diário é respeitado', async () => {
    const u = await usuario(CLIENTE);
    consultarIA.mockResolvedValue({ ...base, resposta: 'A loratadina é indicada para alergias.' });
    const a = await perguntar(u, { texto: 'para que serve loratadina?', arquivo: null }, 'ip');
    const b = await perguntar(u, { texto: 'e a dipirona?', arquivo: null }, 'ip');
    expect(b).toBe(a);
    expect(await db.conversa.count({ where: { usuarioId: u.id } })).toBe(1);
    const { historicoDoCliente, perguntasRestantes } = await import('@/server/assistente/conversas');
    expect((await historicoDoCliente(u.id)).filter((m) => m.autor === 'CLIENTE').map((m) => m.texto)).toEqual(['para que serve loratadina?', 'e a dipirona?']);
    const cota = await perguntasRestantes(u.id);
    expect(cota.limite).toBe(5);
    for (let i = cota.usadas; i < cota.limite; i++) await perguntar(u, { texto: `pergunta ${i}`, arquivo: null }, 'ip');
    await expect(perguntar(u, { texto: 'mais uma', arquivo: null }, 'ip')).rejects.toThrow(/consultas de hoje/);
  });

  it('depois que o farmacêutico encerra, a MESMA conversa volta para a assistente', async () => {
    const u = await usuario(CLIENTE);
    const { finalizarAtendimento } = await import('@/server/assistente/conversas');
    consultarIA.mockResolvedValue({ ...base, resposta: 'A loratadina é indicada para alergias.' });
    const a = await perguntar(u, { texto: 'para que serve loratadina?', arquivo: null }, 'ip');
    await finalizarAtendimento(await usuario('farmaceutico@farmacia.local'), a);
    const b = await perguntar(u, { texto: 'e a cetirizina?', arquivo: null }, 'ip');
    expect(b).toBe(a);
    expect((await conversaAtiva(u.id))!.status).toBe('ASSISTENTE');
    expect(consultarIA).toHaveBeenCalledTimes(2);
  });

  it('rejeita arquivo que não é imagem', async () => {
    const u = await usuario(CLIENTE);
    const falso = new File([new TextEncoder().encode('não sou imagem'.repeat(10))], 'x.png', { type: 'image/png' });
    await expect(perguntar(u, { texto: 'oi', arquivo: falso }, 'ip')).rejects.toThrow(/imagem válida/);
  });
});
