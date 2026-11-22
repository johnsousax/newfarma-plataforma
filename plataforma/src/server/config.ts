import 'server-only';
import crypto from 'node:crypto';

function chaveMestra(): Buffer {
  const b64 = process.env.APP_MASTER_KEY;
  if (b64) {
    const k = Buffer.from(b64, 'base64');
    if (k.length !== 32) throw new Error('APP_MASTER_KEY deve ter 32 bytes em base64 (npm run gerar-chave)');
    return k;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('APP_MASTER_KEY obrigatória em produção');
  console.warn('⚠️  APP_MASTER_KEY não definida: usando chave de desenvolvimento fixa (NÃO use em produção).');
  return crypto.createHash('sha256').update('chave-dev-farmacia').digest();
}

const mestra = chaveMestra();
const derivar = (finalidade: string) => Buffer.from(crypto.hkdfSync('sha256', mestra, Buffer.alloc(0), finalidade, 32));

export const config = {
  producao: process.env.NODE_ENV === 'production',
  chaves: {
    dados: derivar('cifra-dados-pessoais'),
    indice: derivar('indice-cpf'),
    webhook: derivar('webhook-pagamento'),
  },
  sessaoDias: 30,
  fidelidade: {
    pontosPorReal: 1,
    /** 100 pontos = R$ 5,00 */
    centavosPorPonto: 5,
    validadeMeses: 12,
    resgateMinimo: 100,
  },
  frete: {
    gratisAcimaDe: 9900,
  },
  anvisa: {
    validadeReceitaComumDias: 30,
    validadeReceitaAntimicrobianoDias: 10,
  },
};
