import 'server-only';
import { db } from './db';

/** Encargos e provisões estimados sobre o salário (CLT no Simples): FGTS 8% + 13º 8,33% + férias com 1/3 11,11% + FGTS das provisões ≈ 29%. */
export const ENCARGOS_ESTIMADOS = 0.29;

export const TIPOS_OCORRENCIA: Record<string, { rotulo: string; sinal: 1 | -1 | 0; temValor: boolean }> = {
  FERIAS: { rotulo: 'Férias', sinal: 0, temValor: false }, FALTA: { rotulo: 'Falta', sinal: -1, temValor: true }, ATESTADO: { rotulo: 'Atestado médico', sinal: 0, temValor: false },
  ADVERTENCIA: { rotulo: 'Advertência', sinal: 0, temValor: false }, AFASTAMENTO: { rotulo: 'Afastamento', sinal: 0, temValor: false },
  HORA_EXTRA: { rotulo: 'Hora extra', sinal: 1, temValor: true }, BONUS: { rotulo: 'Bônus / comissão', sinal: 1, temValor: true },
  DESCONTO: { rotulo: 'Desconto', sinal: -1, temValor: true }, ADIANTAMENTO: { rotulo: 'Adiantamento (vale)', sinal: -1, temValor: true },
};

const meses = (de: Date, ate: Date) => (ate.getFullYear() - de.getFullYear()) * 12 + ate.getMonth() - de.getMonth() - (ate.getDate() < de.getDate() ? 1 : 0);
const dias = (a: Date, b: Date) => Math.round((+b - +a) / 86_400_000) + 1;

/** Situação de férias: períodos aquisitivos completos x dias já tirados. */
export function situacaoFerias(admissao: Date, ferias: { inicio: Date; fim: Date | null }[], hoje = new Date()) {
  const m = Math.max(0, meses(admissao, hoje));
  const periodos = Math.floor(m / 12);
  const direito = periodos * 30;
  const tiradas = ferias.reduce((s, f) => s + dias(f.inicio, f.fim ?? f.inicio), 0);
  const saldo = Math.max(0, direito - tiradas);
  // o período mais antigo ainda não gozado vence 12 meses depois de completado (período concessivo)
  const periodoPendente = Math.floor(tiradas / 30) + 1;
  const limite = new Date(admissao); limite.setMonth(limite.getMonth() + 12 * (periodoPendente + 1));
  const proximaAquisicao = new Date(admissao); proximaAquisicao.setMonth(proximaAquisicao.getMonth() + 12 * (periodos + 1));
  return { mesesDeCasa: m, direito, tiradas, saldo, limite: saldo > 0 ? limite : null, vencendo: saldo > 0 && +limite - +hoje < 60 * 86_400_000, proximaAquisicao };
}

/** Alertas de RH: fim de experiência (45/90 dias), férias vencendo, aniversários do mês. */
export async function alertasRh(hoje = new Date()) {
  const fs = await db.funcionario.findMany({ where: { ativo: true }, include: { ocorrencias: { where: { tipo: 'FERIAS' }, select: { inicio: true, fim: true } } } });
  const alertas: { funcionarioId: string; nome: string; texto: string; tom: 'amber' | 'red' | 'sky' }[] = [];
  for (const f of fs) {
    const d = dias(f.admissao, hoje) - 1;
    if (f.tipoContrato === 'CLT' && d <= 90) {
      for (const marco of [45, 90]) if (d <= marco && marco - d <= 10) alertas.push({ funcionarioId: f.id, nome: f.nome, texto: `Contrato de experiência: ${marco} dias em ${marco - d} dia(s)`, tom: 'amber' });
    }
    const fer = situacaoFerias(f.admissao, f.ocorrencias, hoje);
    if (fer.vencendo) alertas.push({ funcionarioId: f.id, nome: f.nome, texto: `Férias: ${fer.saldo} dias a tirar até ${fer.limite!.toLocaleDateString('pt-BR')}`, tom: 'red' });
    if (f.nascimento && f.nascimento.getUTCMonth() === hoje.getMonth()) alertas.push({ funcionarioId: f.id, nome: f.nome, texto: `Aniversário dia ${f.nascimento.getUTCDate()}`, tom: 'sky' });
  }
  return alertas;
}
