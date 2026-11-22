import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { db } from './db';
import { auditar } from './auditoria';
import { FARMACIA } from '@/lib/farmacia';

/**
 * Configurações da loja editáveis pelo dono (Painel › Configurações). Cada grupo é validado
 * por um schema; o que não estiver salvo usa o padrão (e, para contato, as variáveis de ambiente).
 */
export const SCHEMAS = {
  contato: z.object({
    whatsapp: z.string().transform((s) => s.replace(/\D/g, '')).refine((s) => s === '' || (s.length >= 12 && s.length <= 13), 'WhatsApp com DDI e DDD, ex.: 5511999990000'),
    telefone: z.string().max(20),
    email: z.string().max(120),
    afe: z.string().max(30),
    rtNome: z.string().max(120),
    rtCrf: z.string().max(30),
  }),
  assistente: z.object({
    nome: z.string().trim().min(2).max(30),
    limiteDiario: z.coerce.number().int().min(1).max(100),
    ativo: z.boolean(),
  }),
  entrega: z.object({
    ativa: z.boolean(),
    /** Bairro não cadastrado: recusar (true) ou cobrar a taxa padrão (false) */
    somenteBairrosCadastrados: z.boolean(),
    taxaPadrao: z.coerce.number().int().min(0),
    pedidoMinimo: z.coerce.number().int().min(0),
    freteGratisAcima: z.coerce.number().int().min(0),
    prazoPadraoMinutos: z.coerce.number().int().min(10).max(1440),
    /** Valor máximo cobrado por uma entrega (teto) */
    taxaMaxima: z.coerce.number().int().min(0),
    retiradaAtiva: z.boolean(),
  }),
  impressao: z.object({
    larguraMm: z.union([z.literal(58), z.literal(80)]),
    automatica: z.boolean(),
    cabecalho: z.string().max(200),
    rodape: z.string().max(300),
    mostrarCpf: z.boolean(),
    vias: z.coerce.number().int().min(1).max(3),
  }),
  fiscal: z.object({
    ambiente: z.enum(['homologacao', 'producao']),
    regime: z.enum(['simples_nacional', 'simples_excesso', 'normal']),
    inscricaoEstadual: z.string().max(20),
    inscricaoMunicipal: z.string().max(20),
    serieNfce: z.coerce.number().int().min(1).max(999),
    proximoNumeroNfce: z.coerce.number().int().min(1),
    cscId: z.string().max(10),
    provedor: z.enum(['nenhum', 'focusnfe', 'plugnotas', 'nfeio']),
    emitirAutomaticamente: z.boolean(),
  }),
} as const;

export type Configuracoes = { [K in keyof typeof SCHEMAS]: z.infer<(typeof SCHEMAS)[K]> };

export const PADRAO: Configuracoes = {
  contato: { whatsapp: FARMACIA.whatsapp, telefone: FARMACIA.sac, email: FARMACIA.email, afe: FARMACIA.afe, rtNome: FARMACIA.rtNome, rtCrf: FARMACIA.rtCrf },
  assistente: { nome: 'Clara', limiteDiario: 5, ativo: true },
  entrega: { ativa: true, somenteBairrosCadastrados: true, taxaPadrao: 700, pedidoMinimo: 1500, freteGratisAcima: 9900, prazoPadraoMinutos: 60, taxaMaxima: 1500, retiradaAtiva: true },
  impressao: { larguraMm: 80, automatica: false, cabecalho: '', rodape: 'Obrigado pela preferência! Guarde este comprovante.', mostrarCpf: false, vias: 1 },
  fiscal: { ambiente: 'homologacao', regime: 'simples_nacional', inscricaoEstadual: '', inscricaoMunicipal: '', serieNfce: 1, proximoNumeroNfce: 1, cscId: '', provedor: 'nenhum', emitirAutomaticamente: false },
};

/** Todas as configurações (memorizado por requisição). */
export const configuracoes = cache(async (): Promise<Configuracoes> => {
  const linhas = await db.configuracao.findMany().catch(() => []);
  const out = structuredClone(PADRAO) as Configuracoes;
  for (const l of linhas) {
    const k = l.chave as keyof Configuracoes;
    if (!(k in SCHEMAS)) continue;
    const r = SCHEMAS[k].partial().safeParse(l.valor);
    if (r.success) Object.assign(out[k], Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined)));
  }
  return out;
});

export async function salvarConfiguracao<K extends keyof Configuracoes>(grupo: K, valor: unknown, usuarioId: string) {
  const dados = SCHEMAS[grupo].parse(valor);
  await db.configuracao.upsert({ where: { chave: grupo }, create: { chave: grupo, valor: dados, atualizadoPor: usuarioId }, update: { valor: dados, atualizadoPor: usuarioId } });
  await auditar('configuracao.atualizada', { usuarioId, detalhes: { grupo } });
  return dados;
}

/** Link do WhatsApp da loja com mensagem pronta (null se não houver número). */
export async function linkWhatsLoja(texto: string) {
  const { contato } = await configuracoes();
  return contato.whatsapp ? `https://wa.me/${contato.whatsapp}?text=${encodeURIComponent(texto)}` : null;
}

export const linkWhatsPara = (telefone: string | null | undefined, texto: string) => {
  const d = (telefone ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}?text=${encodeURIComponent(texto)}`;
};
