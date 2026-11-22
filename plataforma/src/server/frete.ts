import 'server-only';
import { db } from './db';
import { configuracoes } from './configuracoes';
import { disponibilidadePorLoja } from './estoque';
import { normalizar } from '@/lib/texto';
import { brl } from '@/lib/formato';
import type { Modalidade } from '@/generated/prisma/enums';

export type OpcaoEntrega = {
  modalidade: Modalidade;
  rotulo: string;
  prazo: string;
  preco: number;
  lojaId: string;
  lojaNome: string;
  previsao: Date;
  disponivel: boolean;
  motivo?: string;
};

export const cepValido = (cep: string) => /^\d{8}$/.test(cep.replace(/\D/g, ''));

// Bairro a partir do CEP (ViaCEP), com cache em memória de 1 dia
const cacheCep = new Map<string, { bairro: string | null; ate: number }>();
export async function bairroDoCep(cep: string): Promise<string | null> {
  const c = cep.replace(/\D/g, '');
  if (!cepValido(c)) return null;
  const k = cacheCep.get(c);
  if (k && k.ate > Date.now()) return k.bairro;
  let bairro: string | null = null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${c}/json/`, { signal: AbortSignal.timeout(3500) });
    if (r.ok) { const j = (await r.json()) as { bairro?: string; erro?: boolean }; bairro = j.erro ? null : j.bairro || null; }
  } catch { /* sem bairro: cai na regra de bairro não cadastrado */ }
  cacheCep.set(c, { bairro, ate: Date.now() + 86_400_000 });
  return bairro;
}

const temTudo = (estoque: Map<string, number> | undefined, itens: { produtoId: string; quantidade: number }[]) =>
  !!estoque && itens.every((i) => (estoque.get(i.produtoId) ?? 0) >= i.quantidade);

const textoPrazo = (min: number) => (min < 60 ? `em até ${min} min` : min % 60 === 0 ? `em até ${min / 60} h` : `em até ${Math.floor(min / 60)} h ${min % 60} min`);

/**
 * Entrega no bairro (taxa e prazo da tabela de bairros) e retirada na loja.
 * O bairro vem do endereço do cliente; sem endereço, é descoberto pelo CEP.
 */
export async function cotar(destino: { cep?: string | null; bairro?: string | null }, subtotal: number, itens: { produtoId: string; quantidade: number }[]) {
  const { entrega: cfg } = await configuracoes();
  const lojas = await db.loja.findMany({ where: { ativa: true, centroDistribuicao: false }, orderBy: { nome: 'asc' } });
  const estoque = await disponibilidadePorLoja(itens.map((i) => i.produtoId));
  const entregas: OpcaoEntrega[] = [];
  const bairro = destino.bairro?.trim() || (destino.cep ? await bairroDoCep(destino.cep) : null);

  if (cfg.ativa && (bairro || destino.cep)) {
    const origem = lojas.find((l) => temTudo(estoque.get(l.id), itens)) ?? null;
    const base = { modalidade: 'ENTREGA_PADRAO' as const, rotulo: 'Entrega no bairro', lojaId: origem?.id ?? '', lojaNome: origem?.nome ?? '' };
    const zona = bairro && origem ? await db.zonaEntrega.findUnique({ where: { lojaId_bairroBusca: { lojaId: origem.id, bairroBusca: normalizar(bairro) } } }) : null;
    let taxa: number | null = zona?.ativo ? zona.taxa : cfg.somenteBairrosCadastrados ? null : cfg.taxaPadrao;
    const prazoMin = zona?.ativo ? zona.prazoMinutos : cfg.prazoPadraoMinutos;
    if (!origem) {
      entregas.push({ ...base, prazo: '—', preco: 0, previsao: new Date(), disponivel: false, motivo: 'Sem estoque suficiente para entrega agora' });
    } else if (taxa === null) {
      entregas.push({ ...base, prazo: '—', preco: 0, previsao: new Date(), disponivel: false, motivo: bairro ? `Ainda não entregamos no bairro ${bairro}. Você pode retirar na loja.` : 'Não identificamos o bairro desse CEP. Cadastre o endereço completo.' });
    } else if (subtotal < cfg.pedidoMinimo) {
      entregas.push({ ...base, prazo: textoPrazo(prazoMin), preco: taxa, previsao: new Date(), disponivel: false, motivo: `Pedido mínimo para entrega: ${brl(cfg.pedidoMinimo)}` });
    } else {
      if (cfg.taxaMaxima > 0) taxa = Math.min(taxa, cfg.taxaMaxima);
      if (cfg.freteGratisAcima > 0 && subtotal >= cfg.freteGratisAcima) taxa = 0;
      entregas.push({ ...base, rotulo: bairro ? `Entrega em ${bairro}` : base.rotulo, prazo: textoPrazo(prazoMin), preco: taxa, previsao: new Date(Date.now() + prazoMin * 60_000), disponivel: true });
    }
  }

  const retiradas: OpcaoEntrega[] = cfg.retiradaAtiva
    ? lojas
        .map((l) => {
          const ok = temTudo(estoque.get(l.id), itens);
          return {
            modalidade: 'RETIRADA' as const, rotulo: `Retirar em ${l.nome}`, prazo: ok ? 'Pronto em até 1 hora' : 'Indisponível nesta loja', preco: 0,
            lojaId: l.id, lojaNome: l.nome, previsao: new Date(Date.now() + 3_600_000), disponivel: ok, motivo: ok ? undefined : 'Falta estoque de algum item',
          };
        })
        .sort((a, b) => Number(b.disponivel) - Number(a.disponivel))
    : [];

  return { entregas, retiradas, lojas, bairro };
}
