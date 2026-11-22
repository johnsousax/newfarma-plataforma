import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProd = env.NODE_ENV === 'production';

// ---- Chave mestra -------------------------------------------------------
// Todas as chaves (criptografia de dados, assinatura de tokens, índices cegos)
// são derivadas de UMA chave mestra via HKDF. A chave vem SEMPRE de variável
// de ambiente / cofre de segredos — nunca de arquivo versionado.
let chaveMestra;
let chaveEfemera = false;
if (env.APP_MASTER_KEY) {
  chaveMestra = Buffer.from(env.APP_MASTER_KEY, 'base64');
  if (chaveMestra.length < 32) throw new Error('APP_MASTER_KEY deve ter ao menos 32 bytes (base64).');
} else {
  if (isProd) throw new Error('APP_MASTER_KEY é obrigatória em produção.');
  chaveMestra = crypto.randomBytes(32);
  chaveEfemera = true;
}
const derivar = (rotulo) => Buffer.from(crypto.hkdfSync('sha256', chaveMestra, Buffer.alloc(0), rotulo, 32));

const segredoOuDerivado = (valor, rotulo) => (valor ? Buffer.from(valor) : derivar(rotulo));

export const config = {
  raiz,
  isProd,
  porta: Number(env.PORT || 3000),
  chaveEfemera,
  persistir: !chaveEfemera && env.APP_PERSISTIR !== 'false',
  arquivoDados: env.APP_DATA_FILE || path.join(raiz, 'data', 'db.json'),
  chaves: {
    criptografia: derivar('farmacia:aes-256-gcm:v1'),
    jwt: derivar('farmacia:jwt-hs256:v1'),
    indice: derivar('farmacia:blind-index:v1'),
  },
  tokenTtlSegundos: 2 * 60 * 60,
  seguranca: {
    maxTentativasLogin: 5,
    bloqueioMinutos: 15,
    limiteBodyBytes: 1_000_000,
    limiteReceitaBytes: 4_000_000,
  },
  demoSenha: env.DEMO_PASSWORD || null,
  farmacia: {
    nome: env.FARMACIA_NOME || 'Farmácia Exemplo',
    cnpj: env.FARMACIA_CNPJ || '00.000.000/0001-00',
    afe: env.FARMACIA_AFE || '0.00000-0',
    responsavelTecnico: env.FARMACIA_RT_NOME || 'Farmacêutico Responsável',
    crf: env.FARMACIA_RT_CRF || 'CRF-SP 00000',
    horario: env.FARMACIA_HORARIO || 'Seg a Sáb, 8h às 22h — Dom, 9h às 18h',
  },
  anvisa: {
    validadeReceitaComumDias: Number(env.ANVISA_VALIDADE_RECEITA_DIAS || 30),
    validadeReceitaAntimicrobianoDias: 10, // RDC 471/2021
    diasAlertaValidadeLote: Number(env.ANVISA_DIAS_ALERTA_VALIDADE || 30),
  },
  pagamento: {
    modo: env.PAGAMENTO_MODO || 'mock',
    segredoWebhook: segredoOuDerivado(env.PAGAMENTO_WEBHOOK_SECRET, 'farmacia:pagamento-webhook:v1'),
  },
  ifood: {
    modo: env.IFOOD_MODO || 'mock',
    baseUrl: env.IFOOD_BASE_URL || 'https://merchant-api.ifood.com.br',
    clientId: env.IFOOD_CLIENT_ID || '',
    clientSecret: env.IFOOD_CLIENT_SECRET || '',
    merchantId: env.IFOOD_MERCHANT_ID || '',
    segredoWebhook: segredoOuDerivado(env.IFOOD_CLIENT_SECRET, 'farmacia:ifood-webhook:v1'),
  },
  whatsapp: {
    modo: env.WHATSAPP_MODO || 'mock',
    versaoApi: env.WHATSAPP_API_VERSION || 'v21.0',
    token: env.WHATSAPP_TOKEN || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: segredoOuDerivado(env.WHATSAPP_APP_SECRET, 'farmacia:whatsapp-app-secret:v1'),
  },
};
