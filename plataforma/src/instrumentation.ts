// Rotinas em segundo plano do servidor (somente no runtime Node).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.VITEST) return;
  const { expirarPagamentosPendentes } = await import('./server/pedidos');
  const g = globalThis as unknown as { __rotinas?: NodeJS.Timeout };
  if (g.__rotinas) return;
  g.__rotinas = setInterval(() => {
    expirarPagamentosPendentes().catch((e) => console.error('[rotina pix]', e));
  }, 60_000);
}
