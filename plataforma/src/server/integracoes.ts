import 'server-only';
import { db } from './db';
import { cifrar, decifrar } from './cripto';
import { auditar } from './auditoria';

/** Integrações configuráveis pelo painel. O valor fica cifrado no banco (AES-256-GCM). */
export const INTEGRACOES = {
  ANTHROPIC_API_KEY: { nome: 'Assistente virtual (Anthropic / Claude)', formato: /^sk-ant-[A-Za-z0-9_-]{20,}$/ },
  EVOLUTION_URL: { nome: 'WhatsApp · endereço do servidor Evolution API', formato: /^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/ },
  EVOLUTION_API_KEY: { nome: 'WhatsApp · chave da Evolution API', formato: /^\S{10,200}$/ },
  WHATSAPP_WEBHOOK_TOKEN: { nome: 'WhatsApp · token interno do webhook', formato: /^[\w-]{24,}$/ },
} as const;
export type ChaveIntegracao = keyof typeof INTEGRACOES;

const cache = new Map<string, { valor: string | null; ate: number }>();

/** Valor configurado no painel; se não houver, usa a variável de ambiente de mesmo nome. */
export async function obterSegredo(chave: ChaveIntegracao): Promise<string | null> {
  const c = cache.get(chave);
  if (c && c.ate > Date.now()) return c.valor;
  let valor: string | null = null;
  try {
    const r = await db.integracao.findUnique({ where: { chave } });
    valor = r ? decifrar(r.valorCifrado) : null;
  } catch (e) {
    console.error('[integracoes]', e);
  }
  valor ??= process.env[chave] || null;
  cache.set(chave, { valor, ate: Date.now() + 60_000 });
  return valor;
}

export async function salvarSegredo(chave: ChaveIntegracao, valor: string, usuarioId: string) {
  await db.integracao.upsert({
    where: { chave },
    create: { chave, valorCifrado: cifrar(valor), finalVisivel: valor.slice(-4), atualizadoPor: usuarioId },
    update: { valorCifrado: cifrar(valor), finalVisivel: valor.slice(-4), atualizadoPor: usuarioId },
  });
  cache.delete(chave);
  await auditar('integracao.atualizada', { usuarioId, detalhes: { chave } });
}

export async function removerSegredo(chave: ChaveIntegracao, usuarioId: string) {
  await db.integracao.deleteMany({ where: { chave } });
  cache.delete(chave);
  await auditar('integracao.removida', { usuarioId, detalhes: { chave } });
}

export async function situacaoIntegracoes() {
  const salvas = await db.integracao.findMany();
  return (Object.keys(INTEGRACOES) as ChaveIntegracao[]).map((k) => {
    const s = salvas.find((x) => x.chave === k);
    return { chave: k, nome: INTEGRACOES[k].nome, origem: s ? 'painel' : process.env[k] ? 'ambiente' : null, final: s?.finalVisivel ?? (process.env[k] ? process.env[k]!.slice(-4) : null), atualizadoEm: s?.atualizadoEm ?? null };
  });
}

/** Pagamentos simulados: ligados fora de produção, ou em produção só com PAGAMENTOS_SIMULADOS=1 (fase de testes). */
export const pagamentosSimulados = () => process.env.NODE_ENV !== 'production' || process.env.PAGAMENTOS_SIMULADOS === '1';
