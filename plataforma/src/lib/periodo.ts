// Períodos de consulta (hoje, 7 dias, 30 dias, mês ou datas escolhidas) no fuso de Brasília.
const FUSO = -3 * 60; // minutos (America/Sao_Paulo, sem horário de verão)

/** Meia-noite (Brasília) do dia de `d`, em UTC. */
export function inicioDoDia(d: Date) {
  const local = new Date(d.getTime() + FUSO * 60_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - FUSO * 60_000);
}
const dataBR = (iso: string) => new Date(`${iso}T00:00:00-03:00`);
export const isoDia = (d: Date) => new Date(d.getTime() + FUSO * 60_000).toISOString().slice(0, 10);

export type ChavePeriodo = 'hoje' | '7d' | '30d' | 'mes' | 'datas';
export const PERIODOS: { chave: ChavePeriodo; rotulo: string }[] = [
  { chave: 'hoje', rotulo: 'Hoje' }, { chave: '7d', rotulo: '7 dias' }, { chave: '30d', rotulo: '30 dias' }, { chave: 'mes', rotulo: 'Este mês' },
];

export function lerPeriodo(sp: Record<string, string | string[] | undefined>, padrao: ChavePeriodo = 'hoje') {
  const s = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const agora = new Date();
  const hoje = inicioDoDia(agora);
  const de = /^\d{4}-\d{2}-\d{2}$/.test(s('de')) ? dataBR(s('de')) : null;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(s('ate')) ? dataBR(s('ate')) : null;
  const chave = (de ? 'datas' : (['hoje', '7d', '30d', 'mes'].includes(s('p')) ? s('p') : padrao)) as ChavePeriodo;
  let inicio = hoje;
  let fim = new Date(hoje.getTime() + 86_400_000);
  if (chave === '7d') inicio = new Date(hoje.getTime() - 6 * 86_400_000);
  if (chave === '30d') inicio = new Date(hoje.getTime() - 29 * 86_400_000);
  if (chave === 'mes') { const l = isoDia(agora); inicio = dataBR(`${l.slice(0, 8)}01`); }
  if (chave === 'datas' && de) { inicio = de; fim = new Date((ate && ate >= de ? ate : de).getTime() + 86_400_000); }
  const rotulo = chave === 'datas' ? `${isoDia(inicio).split('-').reverse().join('/')} a ${isoDia(new Date(fim.getTime() - 1)).split('-').reverse().join('/')}` : PERIODOS.find((p) => p.chave === chave)!.rotulo;
  return { chave, inicio, fim, rotulo, de: isoDia(inicio), ate: isoDia(new Date(fim.getTime() - 1)) };
}
