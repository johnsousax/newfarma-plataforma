import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import { lerNfe, validarChave } from '@/server/compras/nfe-xml';
import { importarXml, conferir, ajustarItem, lancarNota } from '@/server/compras/entrada-nota';
import { dvModulo11 } from '@/server/fiscal/chave';
import { usuario, produto, lojaPaulista } from './ajuda';

const GERENTE = 'gerente@farmacia.local';
/** Chave válida: MA (21), nov/2026, CNPJ do emitente, modelo 55, série 1. */
const chave = (numero: number, cnpj = '11222333000181') => { const base = `212611${cnpj}55001${String(numero).padStart(9, '0')}112345678`; return base + dvModulo11(base); };

function xmlNota(o: { numero: number; dest?: string; ean: string; ean2?: string; validade?: string }) {
  const ch = chave(o.numero);
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${ch}" versao="4.00">
<ide><cUF>21</cUF><mod>55</mod><serie>1</serie><nNF>${o.numero}</nNF><dhEmi>2026-11-20T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>DISTRIBUIDORA TESTE &amp; CIA LTDA</xNome><xFant>Distrib Teste</xFant><enderEmit><UF>MA</UF><fone>9833334444</fone></enderEmit></emit>
<dest><CNPJ>${o.dest ?? '49500230000109'}</CNPJ></dest>
<det nItem="1"><prod><cProd>A100</cProd><cEAN>${o.ean}</cEAN><xProd>REMEDIO X CX C/10</xProd><NCM>30049099</NCM><CFOP>5405</CFOP><uCom>CX</uCom><qCom>3.0000</qCom><vUnCom>50.00</vUnCom><vProd>150.00</vProd><cEANTrib>${o.ean}</cEANTrib><uTrib>UN</uTrib><qTrib>30.0000</qTrib><vDesc>6.00</vDesc>
<rastro><nLote>l-abc</nLote><qLote>2</qLote><dFab>2026-01-01</dFab><dVal>${o.validade ?? '2028-06-30'}</dVal></rastro><rastro><nLote>L-DEF</nLote><qLote>1</qLote><dFab>2026-02-01</dFab><dVal>2028-08-31</dVal></rastro>
<med><cProdANVISA>1234567890123</cProdANVISA><vPMC>29.90</vPMC></med></prod>
<imposto><ICMS><ICMS60><vICMSST>3.00</vICMSST></ICMS60></ICMS><IPI><IPITrib><vIPI>3.00</vIPI></IPITrib></IPI></imposto></det>
<det nItem="2"><prod><cProd>B200</cProd><cEAN>SEM GTIN</cEAN><xProd>BRINDE CANETA</xProd><uCom>UN</uCom><qCom>5</qCom><vProd>0.50</vProd></prod><imposto></imposto></det>
<total><ICMSTot><vNF>150.50</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>2026-12-20</dVenc><vDup>75.25</vDup></dup><dup><nDup>002</nDup><dVenc>2027-01-20</dVenc><vDup>75.25</vDup></dup></cobr>
</infNFe></NFe><protNFe><infProt><chNFe>${ch}</chNFe><cStat>100</cStat><nProt>121260000000001</nProt></infProt></protNFe></nfeProc>`;
}

describe('leitura do XML da NF-e', () => {
  it('lê itens, custo real (desconto, IPI, ST), lotes, duplicatas e protocolo', () => {
    const n = lerNfe(xmlNota({ numero: 501, ean: '7890000000017' }));
    expect(n.numero).toBe(501);
    expect(n.emitente.nome).toBe('DISTRIBUIDORA TESTE & CIA LTDA');
    expect(n.autorizada).toBe(true);
    expect(n.itens[0].custoTotal).toBe(15000 - 600 + 300 + 300);
    expect(n.itens[0].lotes.map((l) => l.codigo)).toEqual(['L-ABC', 'L-DEF']);
    expect(n.itens[0].registroAnvisa).toBe('1234567890123');
    expect(n.itens[1].ean).toBeNull();
    expect(n.duplicatas).toHaveLength(2);
    expect(n.valorTotal).toBe(15050);
  });
  it('valida a chave bipada e recusa NFC-e', () => {
    expect(validarChave(chave(10)).ok).toBe(true);
    expect(validarChave(chave(10).slice(0, 43) + '0').ok).toBe(chave(10).endsWith('0'));
    expect(() => lerNfe(xmlNota({ numero: 1, ean: '7890000000017' }).replace('<mod>55</mod>', '<mod>65</mod>'))).toThrow(/NFC-e/);
    expect(() => lerNfe('<html>oi</html>')).toThrow(/não é o XML/);
  });
});

describe('entrada da nota no estoque', () => {
  it('importa, liga pelo EAN, dá entrada por lote com o fator e cria as contas a pagar', async () => {
    const g = await usuario(GERENTE);
    const loja = await lojaPaulista();
    const p = await produto({ classificacao: 'MIP' });
    const ean = p.ean ?? '7890000000017';
    if (!p.ean) await db.produto.update({ where: { id: p.id }, data: { ean } });
    const antes = await db.lote.aggregate({ where: { produtoId: p.id, lojaId: loja.id }, _sum: { quantidade: true } });

    const imp = await importarXml({ ...g, lojaId: loja.id }, xmlNota({ numero: 777, ean }));
    expect(imp.repetida).toBe(false);
    const nota = await db.notaEntrada.findUniqueOrThrow({ where: { id: imp.id } });
    const itens = nota.itens as { produtoId: string | null; fator: number; como: string }[];
    expect(itens[0].produtoId).toBe(p.id);
    expect(itens[0].fator).toBe(10); // CX com 30 UN tributáveis em 3 caixas
    expect((await conferir(nota)).bloqueios.join()).toMatch(/sem produto/);
    await ajustarItem(nota.id, 2, { ignorar: true });

    const r = await lancarNota({ ...g, lojaId: loja.id }, nota.id);
    expect(r.unidades).toBe(30);
    const depois = await db.lote.aggregate({ where: { produtoId: p.id, lojaId: loja.id }, _sum: { quantidade: true } });
    expect((depois._sum.quantidade ?? 0) - (antes._sum.quantidade ?? 0)).toBe(30);
    expect(await db.lote.count({ where: { produtoId: p.id, lojaId: loja.id, codigo: { in: ['L-ABC', 'L-DEF'] } } })).toBe(2);
    const contas = await db.lancamento.findMany({ where: { origem: 'nota_entrada', documento: { startsWith: 'NF 777' } } });
    expect(contas.map((c) => c.valor).sort()).toEqual([7525, 7525]);
    expect(await db.codigoFornecedor.count({ where: { codigo: 'A100' } })).toBe(1);

    // a mesma nota não entra duas vezes
    expect((await importarXml({ ...g, lojaId: loja.id }, xmlNota({ numero: 777, ean }))).repetida).toBe(true);
    await expect(lancarNota({ ...g, lojaId: loja.id }, nota.id)).rejects.toThrow(/já foi lançada/);

    // próxima nota do mesmo fornecedor: lembra o código mesmo sem EAN
    const imp2 = await importarXml({ ...g, lojaId: loja.id }, xmlNota({ numero: 778, ean: 'SEM GTIN' }));
    const it2 = (await db.notaEntrada.findUniqueOrThrow({ where: { id: imp2.id } })).itens as { produtoId: string | null; como: string }[];
    expect(it2[0]).toMatchObject({ produtoId: p.id, como: 'memoria' });
  });

  it('bloqueia nota de outro CNPJ e lote vencido', async () => {
    const g = await usuario(GERENTE);
    const loja = await lojaPaulista();
    const imp = await importarXml({ ...g, lojaId: loja.id }, xmlNota({ numero: 779, ean: '7890000000017', dest: '99888777000166', validade: '2020-01-01' }));
    const n = await db.notaEntrada.findUniqueOrThrow({ where: { id: imp.id } });
    const c = await conferir(n);
    expect(c.bloqueios.join(' ')).toMatch(/emitida para o CNPJ/);
    expect(c.bloqueios.join(' ')).toMatch(/vencido/);
  });
});
