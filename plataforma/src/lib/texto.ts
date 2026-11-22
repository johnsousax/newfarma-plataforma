export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const slugificar = (s: string) => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

export function cpfValido(cpf: string): boolean {
  const n = cpf.replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  const dv = (base: string) => {
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * (base.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(n.slice(0, 9)) === Number(n[9]) && dv(n.slice(0, 10)) === Number(n[10]);
}

export function luhn(numero: string): boolean {
  const d = numero.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let soma = 0;
  for (let i = 0; i < d.length; i++) {
    let x = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9; }
    soma += x;
  }
  return soma % 10 === 0;
}

export function bandeiraCartao(numero: string): string {
  const d = numero.replace(/\D/g, '');
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'Amex';
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(d)) return 'Elo';
  if (/^(606282|3841)/.test(d)) return 'Hipercard';
  return 'Cartão';
}
