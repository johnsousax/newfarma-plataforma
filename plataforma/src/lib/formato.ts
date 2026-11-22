const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (centavos: number) => brlFmt.format((centavos || 0) / 100);

const dataFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const dataHoraFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const data = (d: Date | string | null | undefined) => (d ? dataFmt.format(new Date(d)) : '—');
export const dataHora = (d: Date | string | null | undefined) => (d ? dataHoraFmt.format(new Date(d)) : '—');

export const cep = (c: string) => c.replace(/\D/g, '').replace(/^(\d{5})(\d{3}).*/, '$1-$2');
export const mascararCpf = (c: string | null) => (c ? `***.${c.replace(/\D/g, '').slice(3, 6)}.${c.replace(/\D/g, '').slice(6, 9)}-**` : '—');
export const telefone = (t: string | null | undefined) => {
  const d = (t || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || '—';
};
export const percentual = (de: number, por: number) => (de > por ? Math.round((1 - por / de) * 100) : 0);
export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
