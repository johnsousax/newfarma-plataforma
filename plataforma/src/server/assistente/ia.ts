import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { FARMACIA } from '@/lib/farmacia';
import { instrucoesSistema } from './regras';

// Modelo e esforço do assistente. Opus 5.5 lê bem fotos de embalagens e letra de receita.
const MODELO = process.env.ASSISTENTE_MODELO || 'claude-opus-5-5';

export const RespostaAssistente = z.object({
  tipo_entrada: z.enum(['foto_medicamento', 'foto_receita', 'pergunta', 'fora_do_assunto', 'imagem_ilegivel']),
  emergencia: z.boolean(),
  resposta: z.string(),
  medicamentos: z.array(
    z.object({
      nome: z.string(),
      principio_ativo: z.string().nullable(),
      concentracao: z.string().nullable(),
      para_que_serve_segundo_a_bula: z.string().nullable(),
      venda: z.enum(['isento_de_prescricao', 'exige_receita', 'antibiotico_receita_retida', 'controlado_so_na_loja', 'nao_sei']),
      confianca: z.enum(['alta', 'media', 'baixa']),
    }),
  ),
  encaminhar_farmaceutico: z.boolean(),
  motivo_encaminhamento: z.string().nullable(),
});
export type RespostaAssistente = z.infer<typeof RespostaAssistente>;

export type Historico = { autor: 'CLIENTE' | 'ASSISTENTE'; texto: string }[];
export type Imagem = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string };

export class AssistenteIndisponivel extends Error {}

let cliente: Anthropic | null = null;
function api() {
  // Credenciais: ANTHROPIC_API_KEY (ou perfil do `ant auth login`) resolvidas pelo SDK
  cliente ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return cliente;
}

/** Uma chamada ao modelo, com resposta estruturada e validada pelo schema. */
export async function consultarIA(historico: Historico, pergunta: string, imagem?: Imagem): Promise<RespostaAssistente> {
  const mensagens: Anthropic.Beta.BetaMessageParam[] = historico.slice(-10).map((m) => ({
    role: m.autor === 'CLIENTE' ? 'user' : 'assistant',
    content: m.texto,
  }));
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (imagem) conteudo.push({ type: 'image', source: { type: 'base64', media_type: imagem.mime, data: imagem.base64 } });
  conteudo.push({ type: 'text', text: pergunta || 'O que é este medicamento e para que serve, segundo a bula?' });
  mensagens.push({ role: 'user', content: conteudo });

  let r;
  try {
    r = await api().beta.messages.parse({
      model: MODELO,
      max_tokens: 4000,
      system: [{ type: 'text', text: instrucoesSistema(FARMACIA.nome), cache_control: { type: 'ephemeral' } }],
      messages: mensagens,
      output_config: { effort: 'medium', format: betaZodOutputFormat(RespostaAssistente) },
      // Se um classificador de segurança recusar, o próprio servidor tenta o modelo de reserva
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AssistenteIndisponivel('Credencial da API inválida ou ausente');
    if (e instanceof Anthropic.RateLimitError) throw new AssistenteIndisponivel('Limite de uso da API atingido');
    if (e instanceof Anthropic.APIConnectionError) throw new AssistenteIndisponivel('Sem conexão com a API');
    if (e instanceof Anthropic.APIError) throw new AssistenteIndisponivel(`Erro da API (${e.status})`);
    if (e instanceof Error && /authentication|api key|credential/i.test(e.message)) throw new AssistenteIndisponivel('Assistente não configurado (ANTHROPIC_API_KEY)');
    throw e;
  }
  if (r.stop_reason === 'refusal') {
    // Toda a cadeia recusou: trata como caso para o farmacêutico
    return { tipo_entrada: 'pergunta', emergencia: false, resposta: '', medicamentos: [], encaminhar_farmaceutico: true, motivo_encaminhamento: 'Pergunta recusada pela política de segurança do modelo' };
  }
  if (!r.parsed_output) throw new AssistenteIndisponivel('Resposta fora do formato esperado');
  return r.parsed_output;
}
