import 'server-only';
import { db } from './db';
import { config } from './config';
import { disponibilidadePorLoja } from './estoque';
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

const cep5 = (cep: string) => Number(cep.replace(/\D/g, '').slice(0, 5));
export const cepValido = (cep: string) => /^\d{8}$/.test(cep.replace(/\D/g, ''));

function atende(faixas: string[], cep: string) {
  const c = cep5(cep);
  return faixas.some((f) => {
    const [ini, fim] = f.split('-').map(Number);
    return c >= ini && c <= (fim || ini);
  });
}

/** Tabela por região (1º dígito do CEP) para entregas a partir do centro de distribuição. */
function tabelaRegional(cep: string) {
  const d = cep.replace(/\D/g, '')[0];
  if (d === '0' || d === '1') return { preco: 1290, dias: [2, 4], gratisAcima: config.frete.gratisAcimaDe };
  if (d === '2' || d === '3') return { preco: 1690, dias: [3, 5], gratisAcima: 19900 };
  if (d === '7' || d === '8' || d === '9') return { preco: 1990, dias: [4, 7], gratisAcima: 19900 };
  return { preco: 2490, dias: [5, 9], gratisAcima: 24900 };
}

function diasUteis(n: number) {
  const d = new Date();
  let restam = n;
  while (restam > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) restam--;
  }
  return d;
}

const temTudo = (estoque: Map<string, number> | undefined, itens: { produtoId: string; quantidade: number }[]) =>
  !!estoque && itens.every((i) => (estoque.get(i.produtoId) ?? 0) >= i.quantidade);

/** Cota todas as formas de receber: expressa, padrão e retirada em cada loja. */
export async function cotar(cep: string | null, subtotal: number, itens: { produtoId: string; quantidade: number }[]) {
  const lojas = await db.loja.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' } });
  const estoque = await disponibilidadePorLoja(itens.map((i) => i.produtoId));
  const entregas: OpcaoEntrega[] = [];

  if (cep && cepValido(cep)) {
    const locais = lojas.filter((l) => !l.centroDistribuicao && atende(l.faixasCep, cep));
    const localComEstoque = locais.find((l) => temTudo(estoque.get(l.id), itens));
    const cd = lojas.find((l) => l.centroDistribuicao && temTudo(estoque.get(l.id), itens));

    if (localComEstoque?.aceitaExpressa) {
      const agora = new Date();
      entregas.push({ modalidade: 'ENTREGA_EXPRESSA', rotulo: 'Expressa', prazo: 'Em até 2 horas', preco: 1490, lojaId: localComEstoque.id, lojaNome: localComEstoque.nome, previsao: new Date(agora.getTime() + 2 * 3_600_000), disponivel: true });
    } else if (locais.length) {
      entregas.push({ modalidade: 'ENTREGA_EXPRESSA', rotulo: 'Expressa', prazo: 'Em até 2 horas', preco: 1490, lojaId: locais[0].id, lojaNome: locais[0].nome, previsao: new Date(), disponivel: false, motivo: 'Itens indisponíveis na loja mais próxima' });
    }

    const origem = localComEstoque ?? cd;
    if (origem) {
      const local = origem === localComEstoque;
      const t = local ? { preco: 790, dias: [1, 1], gratisAcima: config.frete.gratisAcimaDe } : tabelaRegional(cep);
      const preco = subtotal >= t.gratisAcima ? 0 : t.preco;
      entregas.push({
        modalidade: 'ENTREGA_PADRAO', rotulo: 'Padrão', preco, lojaId: origem.id, lojaNome: origem.nome,
        prazo: t.dias[0] === t.dias[1] ? `${t.dias[0]} dia útil` : `${t.dias[0]} a ${t.dias[1]} dias úteis`,
        previsao: diasUteis(t.dias[1]), disponivel: true,
      });
    } else {
      const motivo = !locais.length && !lojas.some((l) => l.centroDistribuicao)
        ? 'Ainda não entregamos neste CEP. Você pode retirar na loja.'
        : 'Sem estoque suficiente para entrega neste momento';
      entregas.push({ modalidade: 'ENTREGA_PADRAO', rotulo: 'Padrão', preco: 0, lojaId: '', lojaNome: '', prazo: '—', previsao: new Date(), disponivel: false, motivo });
    }
  }

  const retiradas: OpcaoEntrega[] = lojas
    .filter((l) => !l.centroDistribuicao)
    .map((l) => {
      const ok = temTudo(estoque.get(l.id), itens);
      return {
        modalidade: 'RETIRADA' as const, rotulo: `Retirar em ${l.nome}`, prazo: ok ? 'Pronto em até 1 hora' : 'Indisponível nesta loja', preco: 0,
        lojaId: l.id, lojaNome: l.nome, previsao: new Date(Date.now() + 3_600_000), disponivel: ok, motivo: ok ? undefined : 'Falta estoque de algum item',
      };
    })
    .sort((a, b) => Number(b.disponivel) - Number(a.disponivel));

  return { entregas, retiradas, lojas };
}
