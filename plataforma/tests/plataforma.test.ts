import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { cifrar, decifrar, hashSenha, verificarSenha, indiceCpf } from '@/server/cripto';
import { adicionarItem, carrinhoAtual, resumir, avaliarCupom } from '@/server/carrinho';
import { criarPedido, confirmarPix, avancarStatus, cancelarPedido, pagarPedido } from '@/server/pedidos';
import { avaliarReceita } from '@/server/receitas';
import { reservar } from '@/server/estoque';
import { validarDadosPagamento } from '@/server/pagamentos';
import { cotar } from '@/server/frete';
import { calcularOferta, descontoLevePague } from '@/server/precos';
import { auditar, verificarCadeia } from '@/server/auditoria';
import { abrirCaixa, venderBalcao, fecharCaixa } from '@/server/admin/operacoes';
import { cpfValido, luhn } from '@/lib/texto';
import { logar, usuario, produto, lojaPaulista, definirEstoque, esvaziarCarrinho, deslogar } from './ajuda';

const CLIENTE = 'cliente@farmacia.local';
const FARM = 'farmaceutico@farmacia.local';
const ATEND = 'atendente@farmacia.local';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(200).fill(1)]);

beforeEach(async () => {
  const u = await usuario(CLIENTE);
  await esvaziarCarrinho(u.id);
  deslogar();
});

describe('segurança e criptografia', () => {
  it('cifra dados pessoais com AES-GCM e detecta adulteração', () => {
    const c = cifrar('123.456.789-09');
    expect(c).not.toContain('123');
    expect(decifrar(c)).toBe('123.456.789-09');
    const partes = c.split('.');
    partes[3] = partes[3].slice(0, -2) + (partes[3].endsWith('A') ? 'BB' : 'AA');
    expect(() => decifrar(partes.join('.'))).toThrow();
  });

  it('senhas com scrypt e índice de CPF determinístico', () => {
    const h = hashSenha('SenhaForte123');
    expect(verificarSenha('SenhaForte123', h)).toBe(true);
    expect(verificarSenha('errada', h)).toBe(false);
    expect(indiceCpf('529.982.247-25')).toBe(indiceCpf('52998224725'));
  });

  it('valida CPF e cartão (Luhn)', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(luhn('4111 1111 1111 1111')).toBe(true);
    expect(luhn('4111 1111 1111 1112')).toBe(false);
  });

  it('servidor recusa número de cartão em claro (escopo PCI)', () => {
    expect(() => validarDadosPagamento({ metodo: 'CARTAO_CREDITO', numero: '4111111111111111' })).toThrow(/não devem ser enviados/);
    expect(validarDadosPagamento({ metodo: 'CARTAO_CREDITO', token: 'tok_abcdefgh1234', bandeira: 'Visa', final: '1111', parcelas: 2 }).metodo).toBe('CARTAO_CREDITO');
  });

  it('auditoria encadeada detecta adulteração direta no banco', async () => {
    await auditar('teste.evento', { detalhes: { x: 1 } });
    expect((await verificarCadeia()).integra).toBe(true);
    const ultimo = await db.auditoria.findFirstOrThrow({ orderBy: { seq: 'desc' } });
    // 1ª barreira: o banco recusa alterar ou apagar a trilha
    await expect(db.auditoria.update({ where: { seq: ultimo.seq }, data: { acao: 'teste.adulterado' } })).rejects.toThrow();
    await expect(db.auditoria.delete({ where: { seq: ultimo.seq } })).rejects.toThrow();
    // 2ª barreira: mesmo um superusuário que desligue as travas é pego pela cadeia de hashes
    const adulterar = (acao: string) => db.$transaction([
      db.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`),
      db.$executeRaw`UPDATE "Auditoria" SET acao = ${acao} WHERE seq = ${ultimo.seq}`,
    ]);
    await adulterar('teste.adulterado');
    const v = await verificarCadeia();
    expect(v.integra).toBe(false);
    expect(v.falhaEm).toBe(ultimo.seq);
    await adulterar('teste.evento');
  });
});

describe('ANVISA', () => {
  it('bloqueia venda online de controlado (Portaria 344/98 + RDC 44/2009)', async () => {
    await logar(CLIENTE);
    const p = await produto({ classificacao: 'CONTROLADO' });
    await expect(adicionarItem(p.id, 1)).rejects.toThrow(/internet é proibida/);
  });

  it('antimicrobiano: receita → farmacêutico aprova → pagamento → só farmacêutico dispensa → escrituração', async () => {
    const cliente = await logar(CLIENTE);
    const loja = await lojaPaulista();
    const amox = await produto({ principioAtivo: 'amoxicilina' });
    await definirEstoque(amox.id, loja.id, 5);
    await adicionarItem(amox.id, 1);
    const { pedido } = await criarPedido(cliente, (await carrinhoAtual())!, { modalidade: 'RETIRADA', lojaId: loja.id }, '10.0.0.1');
    expect(pedido.status).toBe('AGUARDANDO_RECEITA');

    // Receita enviada (direto no banco, cifrada) e avaliação
    const { enviarReceita } = await import('@/server/receitas');
    const arquivo = new File([PNG], 'receita.png', { type: 'image/png' });
    const r = await enviarReceita(cliente, pedido.id, arquivo, { prescritor: 'Dr. Teste', registro: 'CRM-SP 123456', dataEmissao: new Date().toISOString().slice(0, 10) }, '10.0.0.1');
    await expect(avaliarReceita(await usuario(ATEND), r.id, true, '', 'ip')).rejects.toThrow(/Somente farmacêutico/);
    await avaliarReceita(await usuario(FARM), r.id, true, '', 'ip');
    expect((await db.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).status).toBe('AGUARDANDO_PAGAMENTO');

    const pg = await pagarPedido(cliente, pedido.id, { metodo: 'CARTAO_CREDITO', token: 'tok_teste12345678', bandeira: 'Visa', final: '1111', parcelas: 1 }, 'ip');
    expect(pg.status).toBe('APROVADO');

    await expect(avancarStatus(await usuario(ATEND), pedido.id, 'EM_SEPARACAO', 'ip')).rejects.toThrow(/farmacêutico/);
    await avancarStatus(await usuario(FARM), pedido.id, 'EM_SEPARACAO', 'ip');
    const esc = await db.escrituracao.findMany({ where: { pedidoId: pedido.id } });
    expect(esc).toHaveLength(1);
    expect(esc[0].registroPrescritor).toBe('CRM-SP 123456');
    expect(esc[0].crfFarmaceutico).toBe('CRF-MA 12345');
  });

  it('recusa aprovar receita de antimicrobiano vencida (10 dias)', async () => {
    const cliente = await logar(CLIENTE);
    const loja = await lojaPaulista();
    const amox = await produto({ principioAtivo: 'amoxicilina' });
    await definirEstoque(amox.id, loja.id, 5);
    await adicionarItem(amox.id, 1);
    const { pedido } = await criarPedido(cliente, (await carrinhoAtual())!, { modalidade: 'RETIRADA', lojaId: loja.id }, 'ip');
    const { enviarReceita } = await import('@/server/receitas');
    const velha = new Date(Date.now() - 15 * 86_400_000).toISOString().slice(0, 10);
    const r = await enviarReceita(cliente, pedido.id, new File([PNG], 'r.png', { type: 'image/png' }), { prescritor: 'Dr. X', registro: 'CRM-SP 99999', dataEmissao: velha }, 'ip');
    await expect(avaliarReceita(await usuario(FARM), r.id, true, '', 'ip')).rejects.toThrow(/vencida/);
  });

  it('rejeita arquivo de receita com conteúdo falso', async () => {
    const cliente = await logar(CLIENTE);
    const loja = await lojaPaulista();
    const amox = await produto({ principioAtivo: 'amoxicilina' });
    await definirEstoque(amox.id, loja.id, 5);
    await adicionarItem(amox.id, 1);
    const { pedido } = await criarPedido(cliente, (await carrinhoAtual())!, { modalidade: 'RETIRADA', lojaId: loja.id }, 'ip');
    const { enviarReceita } = await import('@/server/receitas');
    const falso = new File([new TextEncoder().encode('<script>alert(1)</script>'.repeat(20))], 'r.png', { type: 'image/png' });
    await expect(enviarReceita(cliente, pedido.id, falso, { prescritor: 'Dr. X', registro: 'CRM-SP 99999', dataEmissao: '2026-01-01' }, 'ip')).rejects.toThrow(/não corresponde/);
  });
});

describe('pedido completo, estoque e fidelidade', () => {
  it('MIP com PIX: reserva FEFO → PIX confirmado → separação baixa estoque → entrega credita pontos', async () => {
    const cliente = await logar(CLIENTE);
    const loja = await lojaPaulista();
    const dip = await produto({ principioAtivo: 'dipirona monoidratada' });
    await definirEstoque(dip.id, loja.id, 0);
    // dois lotes: o que vence antes deve sair primeiro
    await db.lote.create({ data: { produtoId: dip.id, lojaId: loja.id, codigo: 'VENCELONGE', validade: new Date(Date.now() + 400 * 86_400_000), quantidade: 10 } });
    await db.lote.create({ data: { produtoId: dip.id, lojaId: loja.id, codigo: 'VENCEPERTO', validade: new Date(Date.now() + 30 * 86_400_000), quantidade: 2 } });
    const pontosAntes = (await usuario(CLIENTE)).pontos;

    await adicionarItem(dip.id, 3);
    const { pedido, pagamento } = await criarPedido(cliente, (await carrinhoAtual())!, { modalidade: 'RETIRADA', lojaId: loja.id, pagamento: { metodo: 'PIX' } }, 'ip');
    expect(pedido.status).toBe('AGUARDANDO_PAGAMENTO');
    expect(pagamento?.status).toBe('PENDENTE');
    const itens = await db.pedidoItem.findMany({ where: { pedidoId: pedido.id } });
    const aloc = itens[0].alocacoes as { codigo: string; quantidade: number }[];
    expect(aloc[0]).toMatchObject({ codigo: 'VENCEPERTO', quantidade: 2 });
    expect(aloc[1]).toMatchObject({ codigo: 'VENCELONGE', quantidade: 1 });
    expect((await carrinhoAtual())?.itens ?? []).toHaveLength(0);

    await confirmarPix(pagamento!.id, 'teste');
    expect((await db.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).status).toBe('PAGO');

    const atendente = await usuario(ATEND);
    await avancarStatus(atendente, pedido.id, 'EM_SEPARACAO', 'ip');
    const perto = await db.lote.findFirstOrThrow({ where: { produtoId: dip.id, lojaId: loja.id, codigo: 'VENCEPERTO' } });
    expect(perto).toMatchObject({ quantidade: 0, reservado: 0 });
    await expect(avancarStatus(atendente, pedido.id, 'SAIU_PARA_ENTREGA', 'ip')).rejects.toThrow(/Não é possível/);
    await avancarStatus(atendente, pedido.id, 'PRONTO_PARA_RETIRADA', 'ip');
    await avancarStatus(atendente, pedido.id, 'ENTREGUE', 'ip');
    const final = await db.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(final.pontosGanhos).toBeGreaterThan(0);
    expect((await usuario(CLIENTE)).pontos).toBe(pontosAntes + final.pontosGanhos);
  });

  it('cartão recusado mantém o pedido aguardando pagamento e a reserva', async () => {
    const cliente = await logar(CLIENTE);
    const loja = await lojaPaulista();
    const lor = await produto({ principioAtivo: 'loratadina' });
    await definirEstoque(lor.id, loja.id, 3);
    await adicionarItem(lor.id, 1);
    const { pedido, pagamento } = await criarPedido(cliente, (await carrinhoAtual())!, { modalidade: 'RETIRADA', lojaId: loja.id, pagamento: { metodo: 'CARTAO_CREDITO', token: 'tok_recusado_12345678', bandeira: 'Visa', final: '0002', parcelas: 1 } }, 'ip');
    expect(pagamento?.status).toBe('RECUSADO');
    expect((await db.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).status).toBe('AGUARDANDO_PAGAMENTO');
    const lote = await db.lote.findFirstOrThrow({ where: { produtoId: lor.id, lojaId: loja.id, quantidade: 3 } });
    expect(lote.reservado).toBe(1);
  });

  it('cancelamento libera a reserva e devolve pontos usados', async () => {
    const cliente = await logar(CLIENTE);
    await db.usuario.update({ where: { id: cliente.id }, data: { pontos: { increment: 1000 } } });
    const loja = await lojaPaulista();
    const prot = await produto({ nome: 'Protetor Solar Corporal' });
    await definirEstoque(prot.id, loja.id, 4);
    await adicionarItem(prot.id, 2);
    const saldo = (await usuario(CLIENTE)).pontos;
    const { pedido } = await criarPedido(await usuario(CLIENTE), (await carrinhoAtual())!, { modalidade: 'RETIRADA', lojaId: loja.id, pontos: 300, pagamento: { metodo: 'PIX' } }, 'ip');
    expect(pedido.pontosUsados).toBe(300);
    expect((await usuario(CLIENTE)).pontos).toBe(saldo - 300);
    await cancelarPedido(pedido.id, 'teste', { usuario: await usuario(CLIENTE) });
    expect((await usuario(CLIENTE)).pontos).toBe(saldo);
    const lote = await db.lote.findFirstOrThrow({ where: { produtoId: prot.id, lojaId: loja.id, quantidade: 4 } });
    expect(lote.reservado).toBe(0);
  });

  it('IDOR: cliente não paga nem cancela pedido de outro cliente', async () => {
    const dono = await logar(CLIENTE);
    const loja = await lojaPaulista();
    const p = await produto({ nome: 'Álcool em Gel' });
    await definirEstoque(p.id, loja.id, 3);
    await adicionarItem(p.id, 1);
    const { pedido } = await criarPedido(dono, (await carrinhoAtual())!, { modalidade: 'RETIRADA', lojaId: loja.id, pagamento: { metodo: 'PIX' } }, 'ip');
    const outro = await usuario('cliente1@exemplo.com');
    await expect(pagarPedido(outro, pedido.id, { metodo: 'PIX' }, 'ip')).rejects.toThrow(/não encontrado/);
    await expect(cancelarPedido(pedido.id, 'x', { usuario: outro })).rejects.toThrow(/não encontrado/);
  });

  it('concorrência: duas reservas simultâneas da última unidade — só uma vence', async () => {
    const loja = await lojaPaulista();
    const p = await produto({ nome: 'Fio Dental' });
    await definirEstoque(p.id, loja.id, 1);
    const tentar = () => db.$transaction((tx) => reservar(tx, loja.id, [{ produtoId: p.id, quantidade: 1, nome: p.nome }], {}));
    const r = await Promise.allSettled([tentar(), tentar()]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.filter((x) => x.status === 'rejected')).toHaveLength(1);
  });
});

describe('preços, cupons e frete', () => {
  it('leve 3 pague 2 e melhor promoção percentual', () => {
    const promos = [
      { id: 'a', tipo: 'PERCENTUAL', percentual: 10, leve: null, pague: null, categoriaId: 'cat', marcaId: null, produtos: [] },
      { id: 'b', tipo: 'PERCENTUAL', percentual: 15, leve: null, pague: null, categoriaId: null, marcaId: 'm1', produtos: [] },
      { id: 'c', tipo: 'LEVE_PAGUE', percentual: null, leve: 3, pague: 2, categoriaId: null, marcaId: 'm1', produtos: [] },
    ] as unknown as Parameters<typeof calcularOferta>[1];
    const o = calcularOferta({ id: 'p', preco: 1000, precoDe: null, categoriaId: 'cat', marcaId: 'm1' }, promos);
    expect(o.preco).toBe(850);
    expect(o.precoDe).toBe(1000);
    expect(descontoLevePague(o, 3)).toBe(850);
    expect(descontoLevePague(o, 7)).toBe(1700);
  });

  it('cupom de primeira compra recusado para quem já comprou; mínimo de pedido respeitado', async () => {
    const c = await usuario(CLIENTE);
    expect(await avaliarCupom('BEMVINDO10', 10000, c.id)).toMatchObject({ erro: expect.stringMatching(/primeira compra/) });
    expect(await avaliarCupom('SAUDE20', 5000, c.id)).toMatchObject({ erro: expect.stringMatching(/acima de/) });
    expect(await avaliarCupom('SAUDE20', 20000, c.id)).toMatchObject({ desconto: 2000 });
    expect(await avaliarCupom('NAOEXISTE', 20000, c.id)).toMatchObject({ erro: expect.any(String) });
  });

  it('carrinho aplica promoção leve-pague no total', async () => {
    await logar(CLIENTE);
    const p = await produto({ nome: 'Protetor Solar Facial' });
    const loja = await lojaPaulista();
    await definirEstoque(p.id, loja.id, 10);
    await adicionarItem(p.id, 3);
    const r = await resumir(await carrinhoAtual(), {});
    expect(r.descontoPromocoes).toBe(r.linhas[0].oferta.preco);
    expect(r.total).toBe(r.subtotal - r.descontoPromocoes);
  });

  it('frete por bairro: taxa da zona, teto, frete grátis, pedido mínimo e bairro não atendido', async () => {
    const loja = await lojaPaulista();
    const p = await produto({ nome: 'Creme Dental Branqueador' });
    await definirEstoque(p.id, loja.id, 10);
    await db.zonaEntrega.upsert({ where: { lojaId_bairroBusca: { lojaId: loja.id, bairroBusca: 'bela vista' } }, create: { lojaId: loja.id, bairro: 'Bela Vista', bairroBusca: 'bela vista', taxa: 600, prazoMinutos: 40 }, update: { taxa: 600, prazoMinutos: 40, ativo: true } });
    const itens = [{ produtoId: p.id, quantidade: 1 }];
    const ok = await cotar({ bairro: 'BELA VISTA' }, 2000, itens);
    expect(ok.entregas[0]).toMatchObject({ disponivel: true, preco: 600, prazo: 'em até 40 min' });
    expect((await cotar({ bairro: 'Bela Vista' }, 15000, itens)).entregas[0].preco).toBe(0);
    expect((await cotar({ bairro: 'Bela Vista' }, 500, itens)).entregas[0]).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/mínimo/) });
    expect((await cotar({ bairro: 'Bairro Distante' }, 2000, itens)).entregas[0]).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/não entregamos/) });
    expect(ok.retiradas.some((r) => r.disponivel)).toBe(true);
  });
});

describe('PDV e caixa', () => {
  it('venda no balcão baixa estoque, credita pontos por CPF e fecha caixa com troco correto', async () => {
    const atendente = await usuario(ATEND);
    const loja = await lojaPaulista();
    const p = await produto({ nome: 'Curativo Adesivo' });
    await definirEstoque(p.id, loja.id, 5);
    await db.caixaSessao.updateMany({ where: { operadorId: atendente.id, status: 'ABERTO' }, data: { status: 'FECHADO' } });
    await abrirCaixa(atendente, 10000);
    const cpf = '52998224725';
    const c = await usuario('cliente2@exemplo.com');
    await db.usuario.update({ where: { id: c.id }, data: { cpfHash: indiceCpf(cpf) } });
    const pontosAntes = c.pontos;
    const r = await venderBalcao(atendente, { itens: [{ produtoId: p.id, quantidade: 2 }], metodo: 'DINHEIRO', valorRecebido: 5000, cpf });
    expect(r.troco).toBe(5000 - r.total);
    expect(r.cliente).toBe(c.nome);
    expect((await usuario('cliente2@exemplo.com')).pontos).toBeGreaterThanOrEqual(pontosAntes);
    const disp = await db.lote.aggregate({ where: { produtoId: p.id, lojaId: loja.id }, _sum: { quantidade: true } });
    expect(disp._sum.quantidade).toBe(3);
    const f = await fecharCaixa(atendente, 10000 + r.total);
    expect(f.diferenca).toBe(0);
  });

  it('atendente não dispensa antimicrobiano no balcão', async () => {
    const atendente = await usuario(ATEND);
    const loja = await lojaPaulista();
    const amox = await produto({ principioAtivo: 'amoxicilina' });
    await definirEstoque(amox.id, loja.id, 5);
    await abrirCaixa(atendente, 0);
    await expect(venderBalcao(atendente, { itens: [{ produtoId: amox.id, quantidade: 1 }], metodo: 'PIX', receitaConferida: true })).rejects.toThrow(/farmacêutico/);
    await fecharCaixa(atendente, 0);
  });

  it('dono (Administrador) tem acesso total ao PDV: abre caixa sem loja fixa e vende até antimicrobiano', async () => {
    const admin = await usuario('admin@farmacia.local');
    expect(admin.lojaId).toBeNull();
    const loja = await lojaPaulista();
    const amox = await produto({ principioAtivo: 'amoxicilina' });
    await definirEstoque(amox.id, loja.id, 5);
    await db.caixaSessao.updateMany({ where: { operadorId: admin.id, status: 'ABERTO' }, data: { status: 'FECHADO' } });
    const caixa = await abrirCaixa(admin, 0);
    expect(caixa.lojaId).toBe(loja.id);
    const r = await venderBalcao(admin, { itens: [{ produtoId: amox.id, quantidade: 1 }], metodo: 'PIX', receitaConferida: true, registroPrescritor: 'CRM-MA 123456' });
    expect(r.total).toBeGreaterThan(0);
    await fecharCaixa(admin, 0);
  });
});
