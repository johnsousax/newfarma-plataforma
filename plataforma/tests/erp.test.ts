import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import { codigoNoPasso, passoAtual, verificarTotp, gerarSegredo, gerarCodigosRecuperacao, hashRecuperacao } from '@/server/dois-fatores';
import { vencimentoCrediario, vencimentoConvenio, situacaoContas } from '@/server/crediario';
import { abrirCaixa, venderBalcao, caixaAberto, fecharCaixa } from '@/server/admin/operacoes';
import { salvarOrcamento, abrirInventario, salvarContagem, fecharInventario, comissoes } from '@/server/admin/gestao';
import { receberPagamento } from '@/server/crediario';
import { logar, usuario, produto, lojaPaulista, definirEstoque } from './ajuda';

const ATEND = 'atendente@farmacia.local';
const GERENTE = 'gerente@farmacia.local';

describe('verificação em duas etapas (TOTP)', () => {
  it('bate com o vetor oficial da RFC 6238 (SHA-1)', () => {
    // segredo "12345678901234567890" em base32; T = 59 s → passo 1 → 94287082 (8 dígitos) → 287082
    expect(codigoNoPasso('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082');
  });
  it('aceita o código atual, recusa reuso e código errado', () => {
    const s = gerarSegredo();
    const agora = Date.now();
    const c = codigoNoPasso(s, passoAtual(agora));
    const passo = verificarTotp(s, c, null, agora);
    expect(passo).toBe(passoAtual(agora));
    expect(verificarTotp(s, c, passo, agora)).toBeNull();
    expect(verificarTotp(s, '000000' === c ? '111111' : '000000', null, agora)).toBeNull();
  });
  it('códigos de recuperação são guardados só como hash', () => {
    const { codigos, hashes } = gerarCodigosRecuperacao();
    expect(codigos).toHaveLength(8);
    expect(hashRecuperacao(codigos[0].toLowerCase())).toBe(hashes[0]);
  });
});

describe('vencimentos', () => {
  it('crediário vence no dia escolhido com pelo menos 10 dias de prazo', () => {
    const v = vencimentoCrediario(10, new Date('2026-03-05T12:00:00Z'));
    expect(v.toISOString().slice(0, 10)).toBe('2026-04-10');
    expect(vencimentoCrediario(25, new Date('2026-03-05T12:00:00Z')).toISOString().slice(0, 10)).toBe('2026-03-25');
  });
  it('convênio: compra após o fechamento vai para a fatura do mês seguinte', () => {
    expect(vencimentoConvenio(25, 10, new Date('2026-03-20T12:00:00Z')).toISOString().slice(0, 10)).toBe('2026-04-04');
    expect(vencimentoConvenio(25, 10, new Date('2026-03-27T12:00:00Z')).toISOString().slice(0, 10)).toBe('2026-05-05');
  });
});

describe('crediário, convênio, pré-venda e comissão no caixa', () => {
  it('vende no fiado dentro do limite, bloqueia acima e recebe o pagamento', async () => {
    const u = await logar(ATEND);
    const loja = await lojaPaulista();
    const p = await produto({ classificacao: 'NAO_MEDICAMENTO' });
    await definirEstoque(p.id, loja.id, 50);
    if (!(await caixaAberto(u.id))) await abrirCaixa(u, 10000);
    const conta = await db.contaCrediario.create({ data: { nome: 'Cliente Fiado Teste', limite: p.preco * 3, diaVencimento: 10, telefone: '5598999990000' } });

    const v = await venderBalcao(u, { itens: [{ produtoId: p.id, quantidade: 2 }], metodo: 'CREDIARIO', contaCrediarioId: conta.id });
    const s1 = (await situacaoContas([conta.id])).get(conta.id)!;
    expect(s1.saldo).toBe(v.total);
    await expect(venderBalcao(u, { itens: [{ produtoId: p.id, quantidade: 2 }], metodo: 'CREDIARIO', contaCrediarioId: conta.id })).rejects.toThrow(/Limite insuficiente/);

    const pedido = await db.pedido.findUniqueOrThrow({ where: { id: v.id } });
    expect(pedido.metodoPagamento).toBe('CREDIARIO');
    expect(pedido.vendedorId).toBe(u.id);

    await receberPagamento(u, { contaId: conta.id, valor: v.total, forma: 'DINHEIRO' });
    expect((await situacaoContas([conta.id])).get(conta.id)!.saldo).toBe(0);
    const caixa = await caixaAberto(u.id);
    expect(caixa!.movimentos.some((m) => m.tipo === 'SUPRIMENTO' && m.valor === v.total)).toBe(true);
  });

  it('convênio aplica o desconto da empresa', async () => {
    const u = await logar(ATEND);
    const loja = await lojaPaulista();
    const p = await produto({ classificacao: 'NAO_MEDICAMENTO' });
    await definirEstoque(p.id, loja.id, 50);
    if (!(await caixaAberto(u.id))) await abrirCaixa(u, 10000);
    const conv = await db.convenio.create({ data: { nome: 'Empresa Teste', descontoBp: 1000 } });
    const conta = await db.contaCrediario.create({ data: { nome: 'Conveniado Teste', limite: 1_000_00, convenioId: conv.id } });
    const v = await venderBalcao(u, { itens: [{ produtoId: p.id, quantidade: 1 }], metodo: 'CONVENIO', contaCrediarioId: conta.id });
    expect(v.descontoConvenio).toBeGreaterThan(0);
    const ped = await db.pedido.findUniqueOrThrow({ where: { id: v.id } });
    expect(ped.convenioId).toBe(conv.id);
    expect(ped.total).toBe(ped.subtotal - ped.descontoPromocoes);
  });

  it('pré-venda vira venda uma única vez e a comissão vai para quem montou', async () => {
    const gerente = await usuario(GERENTE);
    await db.usuario.update({ where: { id: gerente.id }, data: { comissaoBp: 200 } });
    const loja = await lojaPaulista();
    const p = await produto({ classificacao: 'NAO_MEDICAMENTO' });
    await definirEstoque(p.id, loja.id, 50);
    const pre = await salvarOrcamento({ ...gerente, lojaId: loja.id }, { tipo: 'PRE_VENDA', itens: [{ produtoId: p.id, quantidade: 1 }] });
    const u = await logar(ATEND);
    if (!(await caixaAberto(u.id))) await abrirCaixa(u, 10000);
    const v = await venderBalcao(u, { itens: [{ produtoId: p.id, quantidade: 1 }], metodo: 'PIX', vendedorId: gerente.id, orcamentoId: pre.id });
    expect((await db.orcamento.findUniqueOrThrow({ where: { id: pre.id } })).status).toBe('CONVERTIDO');
    await expect(venderBalcao(u, { itens: [{ produtoId: p.id, quantidade: 1 }], metodo: 'PIX', orcamentoId: pre.id })).rejects.toThrow(/já foi finalizada/);
    const c = (await comissoes(new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000))).find((x) => x.id === gerente.id)!;
    expect(c.total).toBeGreaterThanOrEqual(v.total);
    expect(c.comissao).toBe(Math.round((c.total * 200) / 10_000));
    await fecharCaixa(u, 0).catch(() => {});
  });
});

describe('inventário', () => {
  it('ajusta só a diferença contada e registra o movimento', async () => {
    const g = await usuario(GERENTE);
    const loja = await lojaPaulista();
    await db.inventario.updateMany({ where: { lojaId: loja.id, status: 'ABERTO' }, data: { status: 'CANCELADO' } });
    const p = await produto({ classificacao: 'MIP' });
    await definirEstoque(p.id, loja.id, 12);
    const inv = await abrirInventario(g, { lojaId: loja.id, descricao: 'Teste' });
    const itens = await db.inventarioItem.findMany({ where: { inventarioId: inv.id, produtoId: p.id } });
    expect(itens).toHaveLength(1);
    await salvarContagem(g, inv.id, [{ itemId: itens[0].id, contado: 9 }]);
    const r = await fecharInventario(g, inv.id, false);
    expect(r.falta).toBeGreaterThanOrEqual(3);
    const lote = await db.lote.findUniqueOrThrow({ where: { id: itens[0].loteId } });
    expect(lote.quantidade).toBe(9);
    expect(await db.movimentoEstoque.count({ where: { loteId: lote.id, tipo: 'AJUSTE_NEGATIVO', motivo: `Inventário #${inv.numero}` } })).toBe(1);
  });
});
