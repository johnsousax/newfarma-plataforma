import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { obterSegredo } from '../integracoes';
import { ErroNegocio } from '../erros';
import { FARMACIA } from '@/lib/farmacia';
import { limparSvg } from './imagem';

const MODELO = process.env.DESIGN_MODELO || 'claude-opus-5-5';

const INSTRUCOES = `Você é diretor de arte sênior especializado em varejo farmacêutico nacional: cria banners de e-commerce no nível das grandes redes de farmácia do Brasil. Você entrega um banner em SVG puro, pronto para o site da ${FARMACIA.nome}.

FORMATO
- SVG com width="1600" height="500" viewBox="0 0 1600 500". Nada de imagens externas, scripts, foreignObject ou fontes externas.
- Fontes: font-family "Roboto Slab, Georgia, serif" para títulos (peso 800) e "Nunito Sans, Arial, sans-serif" para textos. Escreva os textos em <text> (podem usar <tspan>).
- Área segura: todo texto entre x=80 e x=1100 e entre y=60 e y=440 (o lado direito pode ter ilustração; no celular o banner é cortado nas laterais).

IDENTIDADE DA MARCA
- Amarelo #FFC20E, vermelho #D71920, azul #1B2A72, branco #FFFFFF. Fundos limpos, contraste alto (texto escuro sobre claro ou branco sobre azul/vermelho).
- Estilo: minimalista, profissional, varejo popular de confiança. Hierarquia clara: chamada curta (no máximo 6 palavras, fonte 72 a 96 px), apoio de 1 linha (28 a 36 px), selo de oferta quando houver (círculo ou etiqueta com o desconto) e botão (retângulo arredondado com o texto do CTA).
- Ilustração vetorial simples e elegante à direita: formas geométricas, embalagens estilizadas, cruz da farmácia, gotas, folhas, sol, conforme o tema. Nunca desenhe pessoas realistas, logotipos de terceiros ou marcas de medicamentos.
- Sem emojis.

REGRAS LEGAIS (ANVISA RDC 96/2008 e CDC)
- Nada de "cura", "milagroso", "sem efeitos colaterais", "100% seguro", nem promessa de resultado.
- Se o banner falar de medicamento, inclua no rodapé, em 16 px: "SE PERSISTIREM OS SINTOMAS, O MÉDICO DEVERÁ SER CONSULTADO."
- Preço ou desconto só se estiverem no briefing. Inclua "Ofertas válidas enquanto durarem os estoques." em 14 px quando houver oferta.

Responda no formato estruturado: o SVG completo e uma descrição curta (alt) do banner.`;

const Saida = z.object({ svg: z.string(), descricao: z.string() });

export type Briefing = { titulo: string; subtitulo?: string; cta: string; oferta?: string; tema?: string; estilo?: string; ajustes?: string; svgAnterior?: string };

export async function criarBanner(b: Briefing) {
  const chave = await obterSegredo('ANTHROPIC_API_KEY');
  if (!chave) throw new ErroNegocio('Configure a chave da Anthropic em Integrações para usar o agente de design.');
  const cliente = new Anthropic({ apiKey: chave, timeout: 180_000, maxRetries: 1 });
  const pedido = [
    `Chamada principal: ${b.titulo}`,
    b.subtitulo && `Texto de apoio: ${b.subtitulo}`,
    `Botão: ${b.cta}`,
    b.oferta && `Oferta/selo: ${b.oferta}`,
    b.tema && `Tema/produto: ${b.tema}`,
    b.estilo && `Direção de estilo: ${b.estilo}`,
  ].filter(Boolean).join('\n');
  const mensagens: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: `Crie o banner com este briefing:\n${pedido}` }];
  if (b.svgAnterior && b.ajustes) {
    mensagens.push({ role: 'assistant', content: `Versão anterior do SVG:\n${b.svgAnterior.slice(0, 60_000)}` });
    mensagens.push({ role: 'user', content: `Refaça aplicando estes ajustes, mantendo o que estava bom: ${b.ajustes}` });
  }
  let r;
  try {
    r = await cliente.beta.messages.parse({
      model: MODELO,
      max_tokens: 16000,
      system: INSTRUCOES,
      messages: mensagens,
      output_config: { effort: 'high', format: betaZodOutputFormat(Saida) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ErroNegocio('A chave da Anthropic foi recusada. Confira em Integrações.');
    if (e instanceof Anthropic.RateLimitError) throw new ErroNegocio('Limite de uso da IA atingido. Tente em alguns minutos.');
    if (e instanceof Anthropic.APIError) throw new ErroNegocio(`A IA não conseguiu criar o banner agora (erro ${e.status}).`);
    throw e;
  }
  if (r.stop_reason === 'refusal' || !r.parsed_output) throw new ErroNegocio('A IA não conseguiu criar esse banner. Ajuste o briefing e tente de novo.');
  return { svg: limparSvg(r.parsed_output.svg), descricao: r.parsed_output.descricao.slice(0, 200) };
}
