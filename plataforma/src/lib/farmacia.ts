// Dados da farmácia exibidos publicamente (RDC 44/2009 exige CNPJ, AFE e RT/CRF visíveis).
// Os valores padrão são da New Farma Popular; o que estiver vazio deve ser preenchido no .env.
export const FARMACIA = {
  nome: process.env.NEXT_PUBLIC_FARMACIA_NOME || 'New Farma Popular',
  slogan: 'Farmácia com preço popular',
  site: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.newpopularfarma.com.br',
  razaoSocial: process.env.FARMACIA_RAZAO_SOCIAL || 'LUANA S DOS SANTOS LTDA',
  cnpj: process.env.FARMACIA_CNPJ || '49.500.230/0001-09',
  afe: process.env.FARMACIA_AFE || '',
  rtNome: process.env.FARMACIA_RT_NOME || '',
  rtCrf: process.env.FARMACIA_RT_CRF || '',
  sac: process.env.NEXT_PUBLIC_FARMACIA_TELEFONE || '',
  /** Somente dígitos com DDI, ex.: 5511999990000 */
  whatsapp: (process.env.NEXT_PUBLIC_FARMACIA_WHATSAPP || '').replace(/\D/g, ''),
  email: process.env.NEXT_PUBLIC_FARMACIA_EMAIL || '',
  /** Parcelamento sem juros no cartão (o site atual oferece até 3x) */
  maxParcelas: Number(process.env.NEXT_PUBLIC_MAX_PARCELAS || 3),
  parcelaMinima: 3000,
};

export const linkWhatsApp = (texto: string) =>
  FARMACIA.whatsapp ? `https://wa.me/${FARMACIA.whatsapp}?text=${encodeURIComponent(texto)}` : null;

export const telefoneFormatado = (d: string) =>
  d.length === 13 ? `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}` : d.length === 12 ? `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}` : d;

/** Quantidade máxima de parcelas sem juros para um valor. */
export const parcelasPara = (total: number) => Math.max(1, Math.min(FARMACIA.maxParcelas, Math.floor(total / FARMACIA.parcelaMinima)));
