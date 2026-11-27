'use server';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/server/db';
import { executar, ErroNegocio } from '@/server/erros';
import { exigirPermissao, exigirUsuario, lojaDoUsuario, conferirSegundoFator, marcarReautenticado, limitarTaxa } from '@/server/auth';
import { auditar } from '@/server/auditoria';
import { cifrar, decifrar, indiceCpf } from '@/server/cripto';
import { gerarSegredo, linkOtpauth, verificarTotp, gerarCodigosRecuperacao } from '@/server/dois-fatores';
import { buscarContas, receberPagamento, receberFaturaConvenio, enviarCobrancas } from '@/server/crediario';
import { salvarOrcamento, carregarOrcamento, cancelarOrcamento, abrirInventario, salvarContagem, fecharInventario, cancelarInventario, criarCotacao, salvarPrecosFornecedor, fecharCotacao, lancarComissoes } from '@/server/admin/gestao';
import { sugestaoReposicao, lojaDoCaixa } from '@/server/admin/operacoes';
import { normalizarNumero } from '@/server/whatsapp/conversas';
import { EQUIPE } from '@/lib/dominio';

const uuid = z.string().uuid();
const campos = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
/** "12,90" → 1290 centavos */
const reais = z.preprocess((v) => (v === '' || v == null ? undefined : Math.round(Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) * 100)), z.number().int().min(0).max(100_000_00));
/** "1,5" (%) → 150 pontos-base */
const percentual = z.preprocess((v) => (v === '' || v == null ? 0 : Math.round(Number(String(v).replace(',', '.')) * 100)), z.number().int().min(0).max(10_000));
const itensSchema = z.array(z.object({ produtoId: uuid, quantidade: z.number().int().min(1).max(1000) })).min(1).max(200);
const lojaObrigatoria = async (u: Parameters<typeof lojaDoCaixa>[0]) => { const l = await lojaDoCaixa(u); if (!l) throw new ErroNegocio('Seu usuário não está vinculado a uma loja (Painel › Equipe).'); return l; };

// ─────────────── PDV: contas, vendedores, pré-venda ───────────────

export async function buscarContasPdv(q: string, metodo: 'CREDIARIO' | 'CONVENIO') {
  await exigirPermissao('venderCrediario');
  return buscarContas(String(q ?? '').slice(0, 60), metodo === 'CONVENIO' ? 'CONVENIO' : 'CREDIARIO');
}

export async function salvarOrcamentoAcao(dados: unknown) {
  return executar(async () => {
    const u = await exigirPermissao('orcamentos');
    const d = z.object({ tipo: z.enum(['ORCAMENTO', 'PRE_VENDA']), itens: itensSchema, clienteNome: z.string().trim().max(80).optional(), telefone: z.string().max(20).optional(), observacao: z.string().max(300).optional(), validadeDias: z.number().int().min(1).max(30).optional() }).parse(dados);
    const r = await salvarOrcamento(u, { ...d, telefone: d.telefone ? normalizarNumero(d.telefone) : undefined });
    refresh();
    return r;
  });
}

export async function carregarPreVendaAcao(numero: string) {
  return executar(async () => {
    const u = await exigirPermissao('pdv');
    return carregarOrcamento(u, z.coerce.number().int().min(1).parse(numero));
  });
}

export async function cancelarOrcamentoAcao(id: string) {
  return executar(async () => { const u = await exigirPermissao('orcamentos'); await cancelarOrcamento(u, uuid.parse(id)); refresh(); }, 'Cancelado');
}

// ─────────────── Crediário ───────────────

export async function salvarContaCrediarioAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('crediario');
    const d = z.object({
      id: uuid.optional().or(z.literal('')), nome: z.string().trim().min(3, 'Informe o nome').max(120),
      cpf: z.string().transform((s) => s.replace(/\D/g, '')).refine((s) => s === '' || s.length === 11, 'CPF com 11 dígitos').optional(),
      telefone: z.string().max(20).optional(), limite: reais, diaVencimento: z.coerce.number().int().min(1).max(28),
      convenioId: uuid.optional().or(z.literal('')), matricula: z.string().max(30).optional(), observacao: z.string().max(300).optional(),
    }).parse(campos(form));
    const dados = {
      nome: d.nome, telefone: d.telefone ? normalizarNumero(d.telefone) : null, limite: d.limite ?? 0, diaVencimento: d.diaVencimento,
      convenioId: d.convenioId || null, matricula: d.matricula || null, observacao: d.observacao || null,
      ...(d.cpf ? { cpfHash: indiceCpf(d.cpf), cpfFinal: d.cpf.slice(-4) } : {}),
    };
    if (d.cpf) {
      const outra = await db.contaCrediario.findUnique({ where: { cpfHash: indiceCpf(d.cpf) }, select: { id: true } });
      if (outra && outra.id !== d.id) throw new ErroNegocio('Já existe uma conta com este CPF.');
      const cliente = await db.usuario.findUnique({ where: { cpfHash: indiceCpf(d.cpf) }, select: { id: true } });
      if (cliente) Object.assign(dados, { usuarioId: cliente.id });
    }
    const c = d.id ? await db.contaCrediario.update({ where: { id: d.id }, data: dados }) : await db.contaCrediario.create({ data: dados });
    await auditar(d.id ? 'crediario.conta_editada' : 'crediario.conta_criada', { usuarioId: u.id, alvo: c.id, detalhes: { limite: c.limite, convenioId: c.convenioId } });
    refresh();
  }, 'Conta salva');
}

export async function alternarBloqueioContaAcao(id: string) {
  return executar(async () => {
    const u = await exigirPermissao('crediario');
    const c = await db.contaCrediario.findUniqueOrThrow({ where: { id: uuid.parse(id) } });
    await db.contaCrediario.update({ where: { id: c.id }, data: { bloqueada: !c.bloqueada } });
    await auditar(c.bloqueada ? 'crediario.desbloqueada' : 'crediario.bloqueada', { usuarioId: u.id, alvo: c.id });
    refresh();
  }, 'Atualizado');
}

export async function receberCrediarioAcao(contaId: string, _: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('crediario');
    const d = z.object({ valor: reais, forma: z.enum(['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'TRANSFERENCIA']), contaFinanceiraId: uuid.optional().or(z.literal('')) }).parse(campos(form));
    const r = await receberPagamento(u, { contaId: uuid.parse(contaId), valor: d.valor ?? 0, forma: d.forma, contaFinanceiraId: d.contaFinanceiraId || null });
    refresh();
    return r;
  }, 'Pagamento registrado');
}

export async function enviarCobrancasAcao() {
  const r = await executar(async () => {
    const u = await exigirPermissao('crediario');
    const r = await enviarCobrancas(u.id);
    refresh();
    return r;
  });
  return r.ok && r.dados ? { ...r, mensagem: r.dados.enviadas ? `${r.dados.enviadas} lembrete(s) enviado(s)${r.dados.falhas ? `, ${r.dados.falhas} falharam` : ''}.` : 'Ninguém para cobrar agora (sem atraso ou já lembrado nos últimos 3 dias).' } : r;
}

// ─────────────── Convênios ───────────────

export async function salvarConvenioAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('convenios');
    const d = z.object({
      id: uuid.optional().or(z.literal('')), nome: z.string().trim().min(2, 'Informe o nome da empresa').max(120), cnpj: z.string().max(20).optional(),
      contato: z.string().max(80).optional(), telefone: z.string().max(20).optional(), email: z.string().max(120).optional(),
      desconto: percentual, diaFechamento: z.coerce.number().int().min(1).max(28), prazoPagamentoDias: z.coerce.number().int().min(0).max(60), limitePadrao: reais,
    }).parse(campos(form));
    if (d.desconto > 5000) throw new ErroNegocio('Desconto máximo de 50%.');
    const dados = { nome: d.nome, cnpj: d.cnpj || null, contato: d.contato || null, telefone: d.telefone || null, email: d.email || null, descontoBp: d.desconto, diaFechamento: d.diaFechamento, prazoPagamentoDias: d.prazoPagamentoDias, limitePadrao: d.limitePadrao ?? 0 };
    const c = d.id ? await db.convenio.update({ where: { id: d.id }, data: dados }) : await db.convenio.create({ data: dados });
    await auditar('convenio.salvo', { usuarioId: u.id, alvo: c.id, detalhes: { desconto: c.descontoBp } });
    refresh();
  }, 'Convênio salvo');
}

export async function alternarConvenioAcao(id: string) {
  return executar(async () => {
    const u = await exigirPermissao('convenios');
    const c = await db.convenio.findUniqueOrThrow({ where: { id: uuid.parse(id) } });
    await db.convenio.update({ where: { id: c.id }, data: { ativo: !c.ativo } });
    await auditar('convenio.ativo', { usuarioId: u.id, alvo: c.id, detalhes: { ativo: !c.ativo } });
    refresh();
  }, 'Atualizado');
}

export async function receberFaturaConvenioAcao(id: string) {
  return executar(async () => {
    const u = await exigirPermissao('crediario');
    const r = await receberFaturaConvenio(u, uuid.parse(id));
    refresh();
    return r;
  }, 'Fatura recebida e contas quitadas');
}

// ─────────────── Comissões ───────────────

export async function salvarComissaoAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('comissoes');
    const d = z.object({ usuarioId: uuid, percentual }).parse(campos(form));
    if (d.percentual > 2000) throw new ErroNegocio('Comissão máxima de 20%.');
    await db.usuario.update({ where: { id: d.usuarioId, papel: { in: EQUIPE } }, data: { comissaoBp: d.percentual } });
    await auditar('comissao.percentual', { usuarioId: u.id, alvo: d.usuarioId, detalhes: { bp: d.percentual } });
    refresh();
  }, 'Comissão salva');
}

export async function lancarComissoesAcao(mes: string) {
  return executar(async () => {
    const u = await exigirPermissao('comissoes');
    const m = z.string().regex(/^\d{4}-\d{2}$/).parse(mes);
    const inicio = new Date(`${m}-01T03:00:00Z`);
    const fim = new Date(inicio); fim.setUTCMonth(fim.getUTCMonth() + 1);
    const n = await lancarComissoes(u, inicio, fim, m);
    refresh();
    return n;
  }, 'Comissões lançadas em Financeiro › Contas a pagar');
}

// ─────────────── Inventário ───────────────

export async function abrirInventarioAcao(_: unknown, form: FormData) {
  const r = await executar(async () => {
    const u = await exigirPermissao('inventario');
    const d = z.object({ descricao: z.string().trim().min(3, 'Descreva o inventário').max(120), categoriaId: uuid.optional().or(z.literal('')), lojaId: uuid.optional().or(z.literal('')) }).parse(campos(form));
    const lojaId = lojaDoUsuario(u) ?? (d.lojaId || (await lojaObrigatoria(u)));
    return (await abrirInventario(u, { lojaId, descricao: d.descricao, categoriaId: d.categoriaId || null })).id;
  });
  if (!r.ok) return r;
  redirect(`/admin/inventario/${r.dados}`);
}

export async function salvarContagemAcao(id: string, contagens: unknown) {
  return executar(async () => {
    const u = await exigirPermissao('inventario');
    const c = z.array(z.object({ itemId: uuid, contado: z.number().int().min(0).max(1_000_000).nullable() })).max(5000).parse(contagens);
    await salvarContagem(u, uuid.parse(id), c);
  }, 'Contagem salva');
}

export async function fecharInventarioAcao(id: string, zerarNaoContados: boolean) {
  return executar(async () => {
    const u = await exigirPermissao('inventario');
    const r = await fecharInventario(u, uuid.parse(id), !!zerarNaoContados);
    refresh();
    return r;
  }, 'Inventário fechado e estoque ajustado');
}

export async function cancelarInventarioAcao(id: string) {
  return executar(async () => { const u = await exigirPermissao('inventario'); await cancelarInventario(u, uuid.parse(id)); refresh(); }, 'Inventário cancelado');
}

// ─────────────── Cotação ───────────────

export async function criarCotacaoAcao(_: unknown, form: FormData) {
  const r = await executar(async () => {
    const u = await exigirPermissao('compras');
    const lojaId = await lojaObrigatoria(u);
    const descricao = z.string().trim().min(3, 'Descreva a cotação').max(120).parse(form.get('descricao'));
    const sugestao = form.get('origem') === 'vazia' ? [] : await sugestaoReposicao(lojaId);
    if (form.get('origem') !== 'vazia' && !sugestao.length) throw new ErroNegocio('Nenhum produto abaixo do estoque mínimo agora. Escolha "Começar vazia" e adicione os itens.');
    return (await criarCotacao(u, { lojaId, descricao, itens: sugestao.map((s) => ({ produtoId: s.produtoId, quantidade: s.sugerido })) })).id;
  });
  if (!r.ok) return r;
  redirect(`/admin/cotacoes/${r.dados}`);
}

export async function adicionarItemCotacaoAcao(cotacaoId: string, produtoId: string, quantidade: number) {
  return executar(async () => {
    await exigirPermissao('compras');
    const c = await db.cotacao.findUnique({ where: { id: uuid.parse(cotacaoId) }, select: { status: true } });
    if (c?.status !== 'ABERTA') throw new ErroNegocio('Cotação não está aberta.');
    const p = await db.produto.findUniqueOrThrow({ where: { id: uuid.parse(produtoId) }, select: { id: true, nome: true } });
    await db.cotacaoItem.create({ data: { cotacaoId, produtoId: p.id, produtoNome: p.nome, quantidade: z.number().int().min(1).max(100000).parse(quantidade) } });
    refresh();
  }, 'Item adicionado');
}

export async function removerItemCotacaoAcao(itemId: string) {
  return executar(async () => {
    await exigirPermissao('compras');
    await db.cotacaoItem.deleteMany({ where: { id: uuid.parse(itemId), cotacao: { status: 'ABERTA' } } });
    refresh();
  }, 'Item removido');
}

export async function salvarPrecosCotacaoAcao(cotacaoId: string, fornecedorId: string, precos: unknown) {
  return executar(async () => {
    await exigirPermissao('compras');
    const p = z.array(z.object({ itemId: uuid, custoUnitario: z.number().int().min(0).max(100_000_00).nullable(), prazoDias: z.number().int().min(0).max(120).nullable().optional() })).max(1000).parse(precos);
    await salvarPrecosFornecedor(uuid.parse(cotacaoId), uuid.parse(fornecedorId), p);
    refresh();
  }, 'Preços salvos');
}

export async function fecharCotacaoAcao(id: string) {
  const r = await executar(async () => {
    const u = await exigirPermissao('compras');
    const r = await fecharCotacao(u, uuid.parse(id));
    refresh();
    return r;
  });
  return r.ok && r.dados ? { ...r, mensagem: `Pedido(s) de compra ${r.dados.compras.map((n) => `#${n}`).join(', ')} criados em rascunho (Compras).${r.dados.semPreco.length ? ` Sem preço: ${r.dados.semPreco.join(', ')}.` : ''}` } : r;
}

export async function cancelarCotacaoAcao(id: string) {
  return executar(async () => {
    const u = await exigirPermissao('compras');
    const r = await db.cotacao.updateMany({ where: { id: uuid.parse(id), status: 'ABERTA' }, data: { status: 'CANCELADA', fechadaEm: new Date() } });
    if (!r.count) throw new ErroNegocio('Cotação não está aberta.');
    await auditar('cotacao.cancelada', { usuarioId: u.id, alvo: id });
    refresh();
  }, 'Cotação cancelada');
}

// ─────────────── Verificação em duas etapas ───────────────

/** Gera a chave nova (ainda não ativa) e devolve para o app autenticador. */
export async function iniciarDoisFatoresAcao() {
  return executar(async () => {
    const u = await exigirUsuario();
    const atual = await db.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { totpAtivoEm: true } });
    if (atual.totpAtivoEm) throw new ErroNegocio('A verificação em duas etapas já está ativa.');
    const segredo = gerarSegredo();
    await db.usuario.update({ where: { id: u.id }, data: { totpSegredoCifrado: cifrar(segredo), totpUltimoPasso: null } });
    return { segredo, link: linkOtpauth(segredo, u.email) };
  });
}

export async function confirmarDoisFatoresAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    limitarTaxa(`2fa-ativar:${u.id}`, 10, 10 * 60_000);
    const dono = await db.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { totpSegredoCifrado: true, totpAtivoEm: true } });
    const segredo = decifrar(dono.totpSegredoCifrado);
    if (!segredo || dono.totpAtivoEm) throw new ErroNegocio('Gere a chave primeiro.');
    const passo = verificarTotp(segredo, String(form.get('codigo') ?? ''));
    if (passo == null) throw new ErroNegocio('Código não confere. Confira se o horário do celular está automático e tente o código seguinte.');
    const { codigos, hashes } = gerarCodigosRecuperacao();
    await db.usuario.update({ where: { id: u.id }, data: { totpAtivoEm: new Date(), totpUltimoPasso: passo, codigosRecuperacao: hashes } });
    await marcarReautenticado();
    await auditar('2fa.ativado', { usuarioId: u.id });
    return codigos;
  }, 'Verificação em duas etapas ativada');
}

export async function desativarDoisFatoresAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    limitarTaxa(`2fa-desativar:${u.id}`, 5, 10 * 60_000);
    if (!(await conferirSegundoFator(u.id, String(form.get('codigo') ?? '').trim()))) throw new ErroNegocio('Código inválido.');
    await db.usuario.update({ where: { id: u.id }, data: { totpAtivoEm: null, totpSegredoCifrado: null, totpUltimoPasso: null, codigosRecuperacao: [] } });
    await auditar('2fa.desativado', { usuarioId: u.id });
    refresh();
  }, 'Verificação em duas etapas desativada');
}

/** Confirma o código para liberar ações críticas por alguns minutos. */
export async function reautenticarAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    limitarTaxa(`2fa-reauth:${u.id}`, 10, 10 * 60_000);
    if (!(await conferirSegundoFator(u.id, String(form.get('codigo') ?? '').trim()))) throw new ErroNegocio('Código inválido.');
    await marcarReautenticado();
    await auditar('2fa.reautenticado', { usuarioId: u.id });
    refresh();
  }, 'Confirmado. Ações protegidas liberadas por 15 minutos.');
}

export async function novosCodigosRecuperacaoAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    if (!(await conferirSegundoFator(u.id, String(form.get('codigo') ?? '').trim()))) throw new ErroNegocio('Código inválido.');
    const { codigos, hashes } = gerarCodigosRecuperacao();
    await db.usuario.update({ where: { id: u.id }, data: { codigosRecuperacao: hashes } });
    await auditar('2fa.novos_codigos', { usuarioId: u.id });
    return codigos;
  }, 'Novos códigos gerados. Os antigos deixaram de valer.');
}
