import { dvModulo11, CODIGO_UF } from '../fiscal/chave';

/**
 * Leitura do XML da NF-e (modelo 55) de compra, sem bibliotecas: só extrai texto de tags
 * conhecidas — não interpreta DTD/entidades externas, então não há risco de XXE.
 * Valores em CENTAVOS e quantidades como número decimal da nota.
 */

export type LoteNota = { codigo: string; quantidade: number; validade: string | null; fabricacao: string | null };
export type ItemXml = {
  n: number; cProd: string; ean: string | null; nome: string; ncm: string | null; cfop: string | null;
  unidade: string; qCom: number; unidadeTrib: string | null; qTrib: number | null;
  /** Valor total do item já com desconto, frete, IPI e ST rateados (custo real) */
  custoTotal: number; registroAnvisa: string | null; pmc: number | null; lotes: LoteNota[];
};
export type Duplicata = { numero: string; vencimento: string; valor: number };
export type NotaXml = {
  chave: string; modelo: string; numero: number; serie: number; emitidaEm: Date;
  emitente: { cnpj: string; nome: string; fantasia: string | null; telefone: string | null; uf: string | null };
  destCnpj: string | null; valorTotal: number; autorizada: boolean; protocolo: string | null;
  itens: ItemXml[]; duplicatas: Duplicata[];
};

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const texto = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m)).trim();
const blocos = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
const bloco = (xml: string, tag: string) => blocos(xml, tag)[0] ?? null;
const valor = (xml: string | null, tag: string) => { if (!xml) return null; const b = bloco(xml, tag); return b == null ? null : texto(b); };
const num = (s: string | null) => (s == null || s === '' ? 0 : Number(s));
const centavos = (s: string | null) => Math.round(num(s) * 100);
const gtin = (s: string | null) => (s && /^\d{8,14}$/.test(s) && !/^0+$/.test(s) ? s : null);

export function validarChave(chave: string) {
  const c = chave.replace(/\D/g, '');
  if (c.length !== 44) return { ok: false as const, erro: 'A chave de acesso tem 44 dígitos. Bipe o código de barras do DANFE (a nota em papel).' };
  if (dvModulo11(c.slice(0, 43)) !== Number(c[43])) return { ok: false as const, erro: 'Chave com dígito verificador inválido. Bipe de novo.' };
  const uf = Object.entries(CODIGO_UF).find(([, v]) => v === c.slice(0, 2))?.[0] ?? null;
  return { ok: true as const, chave: c, uf, anoMes: `20${c.slice(2, 4)}-${c.slice(4, 6)}`, cnpj: c.slice(6, 20), modelo: c.slice(20, 22), serie: Number(c.slice(22, 25)), numero: Number(c.slice(25, 34)) };
}

export function lerNfe(bruto: string): NotaXml {
  if (bruto.length > 3_000_000) throw new Error('Arquivo grande demais para uma NF-e.');
  // remove declaração, comentários, DOCTYPE (não usamos) e prefixos de namespace (nfe:det → det)
  const xml = bruto.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1');
  const inf = xml.match(/<infNFe\b([^>]*)>([\s\S]*?)<\/infNFe>/);
  if (!inf) throw new Error('Este arquivo não é o XML de uma NF-e (falta o bloco infNFe).');
  const id = inf[1].match(/Id="(?:NFe)?(\d{44})"/)?.[1];
  const corpo = inf[2];
  const ide = bloco(corpo, 'ide');
  const emit = bloco(corpo, 'emit');
  const dest = bloco(corpo, 'dest');
  const chave = id ?? valor(xml, 'chNFe') ?? '';
  const v = validarChave(chave);
  if (!v.ok) throw new Error('Chave de acesso ausente ou inválida no XML.');
  const modelo = valor(ide, 'mod') ?? '';
  if (modelo !== '55') throw new Error(modelo === '65' ? 'Esse XML é de uma NFC-e (cupom), não de nota de compra.' : 'O XML não é de uma NF-e modelo 55.');
  const prot = bloco(xml, 'infProt');
  const itens: ItemXml[] = [...corpo.matchAll(/<det\b[^>]*nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/g)].map((m) => {
    const det = m[2];
    const prod = bloco(det, 'prod') ?? '';
    const imp = bloco(det, 'imposto') ?? '';
    const med = bloco(prod, 'med');
    const custo = centavos(valor(prod, 'vProd')) - centavos(valor(prod, 'vDesc')) + centavos(valor(prod, 'vFrete')) + centavos(valor(prod, 'vSeg')) + centavos(valor(prod, 'vOutro'))
      + centavos(valor(bloco(imp, 'IPI'), 'vIPI')) + centavos(valor(imp, 'vICMSST'));
    const registro = valor(med, 'cProdANVISA')?.replace(/\D/g, '') || null;
    return {
      n: Number(m[1]), cProd: valor(prod, 'cProd') ?? String(m[1]), ean: gtin(valor(prod, 'cEAN')) ?? gtin(valor(prod, 'cEANTrib')), nome: valor(prod, 'xProd') ?? '—',
      ncm: valor(prod, 'NCM'), cfop: valor(prod, 'CFOP'), unidade: (valor(prod, 'uCom') ?? 'UN').toUpperCase(), qCom: num(valor(prod, 'qCom')),
      unidadeTrib: valor(prod, 'uTrib')?.toUpperCase() ?? null, qTrib: valor(prod, 'qTrib') ? num(valor(prod, 'qTrib')) : null,
      custoTotal: Math.max(0, custo), registroAnvisa: registro && registro.length === 13 ? registro : null, pmc: med ? centavos(valor(med, 'vPMC')) || null : null,
      lotes: blocos(prod, 'rastro').map((r) => ({ codigo: (valor(r, 'nLote') ?? '').toUpperCase(), quantidade: num(valor(r, 'qLote')), validade: valor(r, 'dVal'), fabricacao: valor(r, 'dFab') })).filter((l) => l.codigo),
    };
  });
  if (!itens.length) throw new Error('A nota não tem itens.');
  const duplicatas = blocos(bloco(corpo, 'cobr') ?? '', 'dup').map((d) => ({ numero: valor(d, 'nDup') ?? '', vencimento: valor(d, 'dVenc') ?? '', valor: centavos(valor(d, 'vDup')) })).filter((d) => d.vencimento && d.valor > 0);
  return {
    chave: v.chave, modelo, numero: Number(valor(ide, 'nNF')), serie: Number(valor(ide, 'serie') ?? 0), emitidaEm: new Date(valor(ide, 'dhEmi') ?? valor(ide, 'dEmi') ?? Date.now()),
    emitente: { cnpj: (valor(emit, 'CNPJ') ?? valor(emit, 'CPF') ?? '').replace(/\D/g, ''), nome: valor(emit, 'xNome') ?? '—', fantasia: valor(emit, 'xFant'), telefone: valor(bloco(emit ?? '', 'enderEmit'), 'fone'), uf: valor(bloco(emit ?? '', 'enderEmit'), 'UF') },
    destCnpj: (valor(dest, 'CNPJ') ?? '').replace(/\D/g, '') || null,
    valorTotal: centavos(valor(bloco(corpo, 'ICMSTot'), 'vNF')),
    autorizada: valor(prot, 'cStat') === '100' || valor(prot, 'cStat') === '150', protocolo: valor(prot, 'nProt'),
    itens, duplicatas,
  };
}
