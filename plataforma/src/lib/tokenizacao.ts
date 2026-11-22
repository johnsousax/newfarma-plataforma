// Simula o SDK de tokenização do gateway (no navegador). Em produção, substitua pelo SDK
// oficial (Mercado Pago, Pagar.me, Stripe…): o número do cartão nunca vai ao nosso servidor.
import { bandeiraCartao, luhn } from './texto';

export type CartaoDigitado = { numero: string; nome: string; validade: string; cvv: string; parcelas: number };

export function tokenizar(c: CartaoDigitado) {
  const numero = c.numero.replace(/\D/g, '');
  if (!luhn(numero)) throw new Error('Número do cartão inválido.');
  const [mm, aa] = c.validade.split('/').map((x) => Number(x));
  const fim = new Date(2000 + (aa || 0), mm || 0, 1);
  if (!mm || mm > 12 || fim <= new Date()) throw new Error('Validade inválida ou cartão vencido.');
  if (!/^\d{3,4}$/.test(c.cvv)) throw new Error('CVV inválido.');
  if (c.nome.trim().split(' ').length < 2) throw new Error('Digite o nome como está no cartão.');
  const recusado = numero === '4000000000000002';
  const aleatorio = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  return { metodo: 'CARTAO_CREDITO' as const, token: `tok_${recusado ? 'recusado_' : ''}${aleatorio}`, bandeira: bandeiraCartao(numero), final: numero.slice(-4), parcelas: c.parcelas };
}
