import 'server-only';

export type ResultadoEmissao = { status: 'PENDENTE' | 'ENVIADA' | 'AUTORIZADA' | 'REJEITADA'; protocolo?: string; xml?: string; motivo?: string };

/**
 * Contrato de um provedor de emissão (Focus NFe, PlugNotas, NFE.io ou SEFAZ direta com certificado A1).
 * Para ligar um provedor: implemente estas duas funções e registre em PROVEDORES.
 */
export interface ProvedorFiscal {
  nome: string;
  emitir(documento: Record<string, unknown>, ctx: { ambiente: string; chave: string }): Promise<ResultadoEmissao>;
  cancelar(chave: string, protocolo: string, justificativa: string, ctx: { ambiente: string }): Promise<{ ok: boolean; motivo?: string }>;
}

/** Sem provedor: a nota é montada e validada e fica pronta para transmissão. */
const nenhum: ProvedorFiscal = {
  nome: 'nenhum',
  async emitir() {
    return { status: 'PENDENTE', motivo: 'Nota gerada e validada. Aguardando a integração com a SEFAZ (configure o provedor em Configurações › Fiscal).' };
  },
  async cancelar() {
    return { ok: true };
  },
};

const naoIntegrado = (nome: string): ProvedorFiscal => ({
  nome,
  async emitir() {
    return { status: 'PENDENTE', motivo: `Provedor ${nome} selecionado, mas as credenciais ainda não foram ligadas. A nota está pronta para envio.` };
  },
  async cancelar() {
    return { ok: false, motivo: `Integração com ${nome} ainda não ligada.` };
  },
});

export const PROVEDORES: Record<string, ProvedorFiscal> = {
  nenhum,
  focusnfe: naoIntegrado('Focus NFe'),
  plugnotas: naoIntegrado('PlugNotas'),
  nfeio: naoIntegrado('NFE.io'),
};
