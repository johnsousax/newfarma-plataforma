import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import { adicionarItem, carrinhoAtual } from '@/server/carrinho';
import { criarPedido, confirmarPix, avancarStatus, confirmarEntregaMotoboy } from '@/server/pedidos';
import { despachar, novoToken, registrarPosicao } from '@/server/entregas';
import { temPermissao, salvarMatriz, restaurarPadrao } from '@/server/permissoes';
import { gerarNfce } from '@/server/fiscal/nfce';
import { chaveAcesso, dvModulo11 } from '@/server/fiscal/chave';
import { limparSvg, dimensoes } from '@/server/design/imagem';
import { logar, usuario, produto, lojaPaulista, definirEstoque, enderecoPrincipal } from './ajuda';

const CLIENTE = 'cliente@farmacia.local';
const ATEND = 'atendente@farmacia.local';
const ADMIN = 'admin@farmacia.local';

describe('permissões editáveis', () => {
  it('dono tira e devolve uma permissão; Administrador sempre pode', async () => {
    const admin = await usuario(ADMIN);
    expect(await temPermissao('ATENDENTE', 'pdv')).toBe(true);
    await salvarMatriz({ pdv: ['GERENTE'], equipe: ['ATENDENTE', 'ADMIN'] }, admin.id);
    expect(await temPermissao('ATENDENTE', 'pdv')).toBe(false);
    expect(await temPermissao('ATENDENTE', 'equipe')).toBe(true);
    expect(await temPermissao('ADMIN', 'pdv')).toBe(true);
    await restaurarPadrao(admin.id);
    expect(await temPermissao('ATENDENTE', 'pdv')).toBe(true);
    expect(await temPermissao('ATENDENTE', 'equipe')).toBe(false);
  });
});

describe('entregas com motoboy', () => {
  it('despacha para o motoboy, registra posição e o motoboy confirma a entrega', async () => {
    const cliente = await logar(CLIENTE);
    const loja = await lojaPaulista();
    const end = await enderecoPrincipal(cliente.id);
    await db.zonaEntrega.upsert({ where: { lojaId_bairroBusca: { lojaId: loja.id, bairroBusca: end.bairro.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') } }, create: { lojaId: loja.id, bairro: end.bairro, bairroBusca: end.bairro.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), taxa: 500, prazoMinutos: 45 }, update: { ativo: true, taxa: 500 } });
    const p = await produto({ principioAtivo: 'loratadina' });
    await definirEstoque(p.id, loja.id, 20);
    await adicionarItem(p.id, 2);
    const { pedido, pagamento } = await criarPedido(cliente, (await carrinhoAtual())!, { modalidade: 'ENTREGA_PADRAO', enderecoId: end.id, pagamento: { metodo: 'PIX' } }, 'ip');
    expect(pedido.frete).toBe(500);
    await confirmarPix(pagamento!.id, 'teste');
    const atendente = await usuario(ATEND);
    await avancarStatus(atendente, pedido.id, 'EM_SEPARACAO', 'ip');
    const m = await db.motoboy.create({ data: { nome: 'Teste Moto', telefone: '11999990000', taxaPorEntrega: 400, token: novoToken() } });
    await despachar(atendente, pedido.id, m.id, 'ip');
    const emRota = await db.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(emRota).toMatchObject({ status: 'SAIU_PARA_ENTREGA', motoboyId: m.id, taxaMotoboy: 400 });
    await registrarPosicao(m.token, -23.56, -46.65);
    expect((await db.motoboy.findUniqueOrThrow({ where: { id: m.id } })).latitude).toBe(-23.56);
    const outro = await db.motoboy.create({ data: { nome: 'Outro', telefone: '11999990001', token: novoToken() } });
    await expect(confirmarEntregaMotoboy(pedido.id, outro.id)).rejects.toThrow(/não está com você/);
    await confirmarEntregaMotoboy(pedido.id, m.id);
    const final = await db.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(final.status).toBe('ENTREGUE');
    expect(final.entregueEm).not.toBeNull();
    expect(final.pontosGanhos).toBeGreaterThan(0);
  });
});

describe('nota fiscal', () => {
  it('chave de acesso tem 44 dígitos e dígito verificador módulo 11', () => {
    expect(dvModulo11('1234')).toBe(3);
    const c = chaveAcesso({ uf: 'SP', emissao: new Date('2026-11-05T12:00:00Z'), cnpj: '12.345.678/0001-90', modelo: '65', serie: 1, numero: 42, codigo: 12345678 });
    expect(c).toHaveLength(44);
    expect(c.startsWith('352611123456780001906500100000004211234567')).toBe(true);
    expect(Number(c[43])).toBe(dvModulo11(c.slice(0, 43)));
  });

  it('exige NCM nos produtos e gera a NFC-e de pedido pago', async () => {
    const cliente = await logar(CLIENTE);
    const loja = await lojaPaulista();
    const p = await produto({ principioAtivo: 'dipirona monoidratada' });
    await definirEstoque(p.id, loja.id, 10);
    await db.produto.update({ where: { id: p.id }, data: { ncm: null } });
    await adicionarItem(p.id, 1);
    const { pedido, pagamento } = await criarPedido(cliente, (await carrinhoAtual())!, { modalidade: 'RETIRADA', lojaId: loja.id, pagamento: { metodo: 'PIX' } }, 'ip');
    await expect(gerarNfce(pedido.id, null)).rejects.toThrow(/pago/);
    await confirmarPix(pagamento!.id, 'teste');
    await db.configuracao.upsert({ where: { chave: 'fiscal' }, create: { chave: 'fiscal', valor: { inscricaoEstadual: '123456789110' } }, update: { valor: { inscricaoEstadual: '123456789110' } } });
    await expect(gerarNfce(pedido.id, null)).rejects.toThrow(/NCM/);
    await db.produto.update({ where: { id: p.id }, data: { ncm: '30049069', cfop: '5405' } });
    const n = await gerarNfce(pedido.id, null);
    expect(n.status).toBe('PENDENTE');
    expect(n.chave).toHaveLength(44);
    await expect(gerarNfce(pedido.id, null)).rejects.toThrow(/já tem nota/);
    const nota = await db.notaFiscal.findUniqueOrThrow({ where: { id: n.id } });
    expect((nota.conteudo as { det: { prod: { NCM: string } }[] }).det[0].prod.NCM).toBe('30049069');
  });
});

describe('banners', () => {
  it('limpa SVG perigoso e lê o tamanho de PNG', () => {
    const s = limparSvg('<svg width="1600" height="500"><script>alert(1)</script><rect onclick="x()" width="10"/><image href="https://mal.com/a.png"/><text>Oi</text></svg>');
    expect(s).not.toMatch(/script|onclick|mal\.com/);
    expect(s).toMatch(/viewBox="0 0 1600 500"/);
    const png = Buffer.alloc(32); png.set([0x89, 0x50, 0x4e, 0x47], 0); png.writeUInt32BE(1600, 16); png.writeUInt32BE(500, 20);
    expect(dimensoes(png)).toEqual({ largura: 1600, altura: 500 });
  });
});
