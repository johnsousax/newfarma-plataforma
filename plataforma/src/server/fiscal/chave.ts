/** Códigos IBGE das UFs (cUF). */
export const CODIGO_UF: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
  MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};

/** Dígito verificador módulo 11 (pesos 2 a 9 da direita para a esquerda), como no Manual da NF-e. */
export function dvModulo11(base: string) {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

/** Chave de acesso de 44 dígitos: cUF AAMM CNPJ mod serie nNF tpEmis cNF cDV. */
export function chaveAcesso(p: { uf: string; emissao: Date; cnpj: string; modelo: '55' | '65'; serie: number; numero: number; tpEmis?: number; codigo: number }) {
  const cuf = CODIGO_UF[p.uf.toUpperCase()];
  if (!cuf) throw new Error(`UF inválida: ${p.uf}`);
  const aamm = `${String(p.emissao.getFullYear()).slice(2)}${String(p.emissao.getMonth() + 1).padStart(2, '0')}`;
  const base = [cuf, aamm, p.cnpj.replace(/\D/g, '').padStart(14, '0'), p.modelo, String(p.serie).padStart(3, '0'), String(p.numero).padStart(9, '0'), String(p.tpEmis ?? 1), String(p.codigo).padStart(8, '0')].join('');
  if (base.length !== 43) throw new Error('Chave com tamanho inválido');
  return base + dvModulo11(base);
}
