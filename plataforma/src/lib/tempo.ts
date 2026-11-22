// Utilitários de tempo usados no servidor (fora do corpo dos componentes).
export const diasAtras = (dias: number) => new Date(Date.now() - dias * 86_400_000);
export const minutosDesde = (d: Date) => Math.max(1, Math.round((Date.now() - d.getTime()) / 60_000));
