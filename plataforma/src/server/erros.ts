/** Erro de regra de negócio: a mensagem é segura para mostrar ao usuário. */
export class ErroNegocio extends Error {
  constructor(mensagem: string, public status = 400) {
    super(mensagem);
    this.name = 'ErroNegocio';
  }
}

export type Resultado<T = undefined> = { ok: true; dados?: T; mensagem?: string } | { ok: false; erro: string; campos?: Record<string, string> };

/** Executa uma ação e converte erros de negócio em resultado; erros inesperados viram mensagem genérica. */
export async function executar<T>(fn: () => Promise<T>, mensagem?: string): Promise<Resultado<T>> {
  try {
    const dados = await fn();
    return { ok: true, dados, mensagem };
  } catch (e) {
    if (e instanceof ErroNegocio) return { ok: false, erro: e.message };
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_')) throw e; // redirect/notFound
    console.error('[erro inesperado]', e);
    return { ok: false, erro: 'Não foi possível concluir a operação. Tente novamente.' };
  }
}
