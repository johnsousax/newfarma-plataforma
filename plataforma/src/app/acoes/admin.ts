'use server';
import { refresh, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/server/db';
import { executar, ErroNegocio } from '@/server/erros';
import { exigirPermissao, ipAtual, lojaDoUsuario } from '@/server/auth';
import { auditar } from '@/server/auditoria';
import { avancarStatus, cancelarPedido } from '@/server/pedidos';
import { avaliarReceita } from '@/server/receitas';
import { entrada } from '@/server/estoque';
import { hashSenha } from '@/server/cripto';
import { validarSenhaForte } from '@/server/auth';
import { criarCompra, enviarCompra, receberCompra, abrirCaixa, fecharCaixa, movimentarCaixa, venderBalcao } from '@/server/admin/operacoes';
import { REGRAS } from '@/lib/dominio';
import { normalizar, slugificar } from '@/lib/texto';
import { Classificacao, TipoMedicamento, StatusPedido, MetodoPagamento, Papel } from '@/generated/prisma/enums';

const uuid = z.string().uuid();
const ASSINATURA_IMG: Record<string, number[]> = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
/** "12,90" ou "12.90" → 1290 centavos */
const reais = z.preprocess((v) => (v === '' || v == null ? undefined : Math.round(Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) * 100)), z.number().int().min(0).max(100_000_00));
const reaisOpc = z.preprocess((v) => (v === '' || v == null ? null : v), reais.nullable());
const campos = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
const errosZod = (e: z.ZodError) => ({ ok: false as const, erro: 'Confira os campos destacados.', campos: Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message])) });

// ─────────────── Pedidos e receitas ───────────────

export async function avancarPedido(pedidoId: string, status: string) {
  return executar(async () => {
    const u = await exigirPermissao('pedidos');
    await avancarStatus(u, uuid.parse(pedidoId), z.enum(StatusPedido).parse(status), await ipAtual());
    refresh();
  }, 'Status atualizado');
}

export async function cancelarPedidoAdmin(pedidoId: string, motivo: string) {
  return executar(async () => {
    const u = await exigirPermissao('pedidos');
    const m = z.string().trim().min(5, 'Informe o motivo do cancelamento').max(200).parse(motivo);
    await cancelarPedido(uuid.parse(pedidoId), m, { usuario: u }, await ipAtual());
    refresh();
  }, 'Pedido cancelado');
}

export async function avaliarReceitaAcao(receitaId: string, aprovada: boolean, observacao: string) {
  return executar(async () => {
    const u = await exigirPermissao('receitas');
    await avaliarReceita(u, uuid.parse(receitaId), aprovada, String(observacao ?? ''), await ipAtual());
    refresh();
  }, aprovada ? 'Receita aprovada' : 'Receita recusada');
}

// ─────────────── Produtos ───────────────

const produtoSchema = z.object({
  nome: z.string().trim().min(3).max(150),
  sku: z.string().trim().min(3).max(30),
  ean: z.string().trim().regex(/^\d{8,14}$/, 'EAN com 8 a 14 dígitos').optional().or(z.literal('')),
  descricaoCurta: z.string().trim().min(3).max(200),
  descricao: z.string().trim().min(10).max(5000),
  marcaId: uuid, categoriaId: uuid,
  classificacao: z.enum(Classificacao), tipo: z.enum(TipoMedicamento),
  principioAtivo: z.string().trim().max(150).optional(), concentracao: z.string().trim().max(50).optional(),
  formaFarmaceutica: z.string().trim().max(80).optional(), apresentacao: z.string().trim().max(80).optional(),
  registroAnvisa: z.string().trim().max(20).optional(),
  indicacoes: z.string().max(3000).optional(), contraindicacoes: z.string().max(3000).optional(), modoDeUsar: z.string().max(3000).optional(), advertencias: z.string().max(3000).optional(),
  preco: reais.refine((v) => v > 0, 'Preço obrigatório'), precoDe: reaisOpc, pmc: reaisOpc, custo: reaisOpc,
  icone: z.string().trim().min(1).max(8), estoqueMinimo: z.coerce.number().int().min(0).max(10000),
  tags: z.string().max(300).optional(), ativo: z.string().optional(), destaque: z.string().optional(), motivoPreco: z.string().max(200).optional(),
});

export async function salvarProduto(_: unknown, form: FormData) {
  const p = produtoSchema.safeParse(campos(form));
  if (!p.success) return errosZod(p.error);
  const r = await executar(async () => {
    const u = await exigirPermissao('produtos');
    const d = p.data;
    const regra = REGRAS[d.classificacao];
    // Validações sanitárias e de preço (CMED)
    if (regra.medicamento) {
      if ((d.registroAnvisa ?? '').replace(/\D/g, '').length !== 13) throw new ErroNegocio('Medicamentos exigem registro ANVISA com 13 dígitos.');
      if (!d.principioAtivo) throw new ErroNegocio('Medicamentos exigem princípio ativo (DCB).');
      if (!d.pmc) throw new ErroNegocio('Informe o PMC (preço máximo ao consumidor — tabela CMED).');
      if (d.preco > d.pmc) throw new ErroNegocio('O preço de venda não pode ultrapassar o PMC (CMED).');
      if (d.tipo === 'NAO_SE_APLICA') throw new ErroNegocio('Informe se o medicamento é referência, genérico ou similar.');
    }
    if (d.precoDe && d.precoDe <= d.preco) throw new ErroNegocio('O preço "de" deve ser maior que o preço de venda.');
    const id = form.get('id') ? uuid.parse(form.get('id')) : null;
    const [marca, categoria] = await Promise.all([db.marca.findUniqueOrThrow({ where: { id: d.marcaId } }), db.categoria.findUniqueOrThrow({ where: { id: d.categoriaId } })]);
    const tags = (d.tags ?? '').split(',').map((t) => normalizar(t)).filter(Boolean).slice(0, 15);
    const dados = {
      nome: d.nome, sku: d.sku.toUpperCase(), ean: d.ean || null, descricaoCurta: d.descricaoCurta, descricao: d.descricao, marcaId: d.marcaId, categoriaId: d.categoriaId,
      classificacao: d.classificacao, tipo: regra.medicamento ? d.tipo : 'NAO_SE_APLICA' as const, principioAtivo: d.principioAtivo || null, concentracao: d.concentracao || null,
      formaFarmaceutica: d.formaFarmaceutica || null, apresentacao: d.apresentacao || null, registroAnvisa: regra.medicamento ? (d.registroAnvisa ?? '').replace(/\D/g, '') : null,
      indicacoes: d.indicacoes || null, contraindicacoes: d.contraindicacoes || null, modoDeUsar: d.modoDeUsar || null, advertencias: d.advertencias || null,
      preco: d.preco, precoDe: d.precoDe, pmc: d.pmc, custo: d.custo, icone: d.icone, estoqueMinimo: d.estoqueMinimo, tags,
      ativo: d.ativo === 'on', destaque: d.destaque === 'on',
      busca: normalizar([d.nome, marca.nome, d.principioAtivo ?? '', categoria.nome, ...tags].join(' ')),
    };
    try {
      if (id) {
        const anterior = await db.produto.findUniqueOrThrow({ where: { id } });
        await db.$transaction(async (tx) => {
          await tx.produto.update({ where: { id }, data: dados });
          if (anterior.preco !== d.preco) await tx.historicoPreco.create({ data: { produtoId: id, precoAnterior: anterior.preco, precoNovo: d.preco, usuarioId: u.id, motivo: d.motivoPreco || null } });
        });
        await auditar('produto.atualizado', { usuarioId: u.id, alvo: id, detalhes: anterior.preco !== d.preco ? { precoDe: anterior.preco, precoPara: d.preco } : undefined });
        return id;
      }
      const novo = await db.produto.create({ data: { ...dados, slug: `${slugificar(d.nome)}-${Date.now().toString(36)}` } });
      await auditar('produto.criado', { usuarioId: u.id, alvo: novo.id });
      return novo.id;
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') throw new ErroNegocio('Já existe produto com este SKU ou EAN.');
      throw e;
    }
  });
  if (!r.ok) return r;
  updateTag('catalogo');
  redirect(`/admin/produtos/${r.dados}?salvo=1`);
}

export async function alternarProdutoAtivo(id: string) {
  return executar(async () => {
    const u = await exigirPermissao('produtos');
    const p = await db.produto.findUniqueOrThrow({ where: { id: uuid.parse(id) } });
    await db.produto.update({ where: { id: p.id }, data: { ativo: !p.ativo } });
    await auditar(p.ativo ? 'produto.desativado' : 'produto.ativado', { usuarioId: u.id, alvo: p.id });
    refresh();
  });
}

export async function criarMarca(_: unknown, form: FormData) {
  return executar(async () => {
    await exigirPermissao('produtos');
    const nome = z.string().trim().min(2).max(60).parse(form.get('nome'));
    await db.marca.create({ data: { nome, slug: slugificar(nome), fabricante: String(form.get('fabricante') ?? '') || null } });
    refresh();
  }, 'Marca criada');
}

// ─────────────── Estoque ───────────────

export async function entradaEstoque(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('estoque');
    const d = z.object({ produtoId: uuid, lojaId: uuid, codigo: z.string().trim().min(2).max(30), validade: z.coerce.date(), quantidade: z.coerce.number().int().min(1).max(100000), custo: reaisOpc, motivo: z.string().max(120).optional() }).parse(campos(form));
    const loja = lojaDoUsuario(u);
    if (loja && loja !== d.lojaId) throw new ErroNegocio('Você só pode movimentar o estoque da sua loja.');
    await db.$transaction((tx) => entrada(tx, { ...d, codigo: d.codigo.toUpperCase(), custoUnit: d.custo, usuarioId: u.id, motivo: d.motivo || 'Entrada manual' }));
    await auditar('estoque.entrada', { usuarioId: u.id, alvo: d.produtoId, detalhes: { loja: d.lojaId, lote: d.codigo, qtd: d.quantidade } });
    refresh();
  }, 'Entrada registrada');
}

export async function ajustarLote(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('estoque');
    const d = z.object({ loteId: uuid, tipo: z.enum(['AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'PERDA']), quantidade: z.coerce.number().int().min(1).max(100000), motivo: z.string().trim().min(5, 'Descreva o motivo').max(200) }).parse(campos(form));
    await db.$transaction(async (tx) => {
      const [l] = await tx.$queryRaw<{ id: string; produtoId: string; lojaId: string; quantidade: number; reservado: number }[]>`SELECT id, "produtoId", "lojaId", quantidade, reservado FROM "Lote" WHERE id = ${d.loteId} FOR UPDATE`;
      if (!l) throw new ErroNegocio('Lote não encontrado.');
      const loja = lojaDoUsuario(u);
      if (loja && loja !== l.lojaId) throw new ErroNegocio('Lote de outra loja.');
      const delta = d.tipo === 'AJUSTE_POSITIVO' ? d.quantidade : -d.quantidade;
      if (l.quantidade + delta < l.reservado) throw new ErroNegocio(`Não é possível baixar abaixo do reservado para pedidos (${l.reservado} un.).`);
      await tx.lote.update({ where: { id: l.id }, data: { quantidade: { increment: delta } } });
      await tx.movimentoEstoque.create({ data: { produtoId: l.produtoId, lojaId: l.lojaId, loteId: l.id, tipo: d.tipo, quantidade: d.quantidade, motivo: d.motivo, usuarioId: u.id } });
      await auditar('estoque.ajuste', { usuarioId: u.id, alvo: l.id, detalhes: { tipo: d.tipo, quantidade: d.quantidade, motivo: d.motivo } }, tx);
    });
    refresh();
  }, 'Ajuste registrado');
}

// ─────────────── Compras e fornecedores ───────────────

export async function criarCompraAcao(entradaDados: unknown) {
  const r = await executar(async () => {
    const u = await exigirPermissao('compras');
    const d = z.object({ fornecedorId: uuid, lojaId: uuid, observacao: z.string().max(300).optional(), itens: z.array(z.object({ produtoId: uuid, quantidade: z.number().int().min(0).max(100000), custoUnitario: z.number().int().min(0) })).max(300) }).parse(entradaDados);
    return (await criarCompra(u, d)).id;
  });
  if (!r.ok) return r;
  redirect(`/admin/compras/${r.dados}`);
}

export async function enviarCompraAcao(id: string) {
  return executar(async () => { const u = await exigirPermissao('compras'); await enviarCompra(u, uuid.parse(id)); refresh(); }, 'Pedido enviado ao fornecedor');
}

export async function cancelarCompraAcao(id: string) {
  return executar(async () => {
    const u = await exigirPermissao('compras');
    const r = await db.pedidoCompra.updateMany({ where: { id: uuid.parse(id), status: { in: ['RASCUNHO', 'ENVIADO'] } }, data: { status: 'CANCELADO' } });
    if (!r.count) throw new ErroNegocio('Este pedido não pode ser cancelado.');
    await auditar('compra.cancelada', { usuarioId: u.id, alvo: id });
    refresh();
  });
}

export async function receberCompraAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('compras');
    const c = campos(form);
    const itens = Object.keys(c).filter((k) => k.startsWith('lote_')).map((k) => {
      const itemId = k.slice(5);
      return { itemId, codigo: c[k], validade: new Date(c[`validade_${itemId}`]), quantidade: Number(c[`qtd_${itemId}`]) };
    });
    if (itens.some((i) => Number.isNaN(i.validade.getTime()))) throw new ErroNegocio('Validade inválida em algum item.');
    await receberCompra(u, uuid.parse(c.id), c.notaFiscal ?? '', itens);
    refresh();
  }, 'Mercadoria recebida e lançada no estoque');
}

export async function salvarFornecedor(_: unknown, form: FormData) {
  const p = z.object({
    razaoSocial: z.string().trim().min(3).max(150), nomeFantasia: z.string().trim().min(2).max(80),
    cnpj: z.string().trim().regex(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, 'CNPJ inválido'),
    email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')), telefone: z.string().max(20).optional(), contato: z.string().max(80).optional(),
    prazoEntregaDias: z.coerce.number().int().min(0).max(90),
  }).safeParse(campos(form));
  if (!p.success) return errosZod(p.error);
  return executar(async () => {
    const u = await exigirPermissao('compras');
    const id = form.get('id') ? uuid.parse(form.get('id')) : null;
    const dados = { ...p.data, email: p.data.email || null };
    try {
      if (id) await db.fornecedor.update({ where: { id }, data: dados });
      else await db.fornecedor.create({ data: dados });
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') throw new ErroNegocio('CNPJ já cadastrado.');
      throw e;
    }
    await auditar('fornecedor.salvo', { usuarioId: u.id, detalhes: { cnpj: p.data.cnpj } });
    refresh();
  }, 'Fornecedor salvo');
}

// ─────────────── Marketing ───────────────

const data = z.preprocess((v) => (v ? new Date(String(v)) : undefined), z.date().optional());

export async function salvarCupom(_: unknown, form: FormData) {
  const p = z.object({
    codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'Use 3 a 20 letras/números'), descricao: z.string().trim().min(3).max(120),
    tipo: z.enum(['PERCENTUAL', 'VALOR_FIXO', 'FRETE_GRATIS']), valor: z.string().optional(), minimoPedido: reaisOpc,
    usoMaximo: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(1).nullable()), usoPorCliente: z.coerce.number().int().min(1).max(100),
    primeiraCompra: z.string().optional(), fim: data,
  }).safeParse(campos(form));
  if (!p.success) return errosZod(p.error);
  return executar(async () => {
    const u = await exigirPermissao('marketing');
    const d = p.data;
    const valor = d.tipo === 'PERCENTUAL' ? z.coerce.number().int().min(1).max(90).parse(d.valor) : d.tipo === 'VALOR_FIXO' ? reais.parse(d.valor) : 0;
    const id = form.get('id') ? uuid.parse(form.get('id')) : null;
    const dados = { codigo: d.codigo, descricao: d.descricao, tipo: d.tipo, valor, minimoPedido: d.minimoPedido ?? 0, usoMaximo: d.usoMaximo, usoPorCliente: d.usoPorCliente, primeiraCompra: d.primeiraCompra === 'on', fim: d.fim ?? null };
    try {
      if (id) await db.cupom.update({ where: { id }, data: dados });
      else await db.cupom.create({ data: dados });
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') throw new ErroNegocio('Já existe um cupom com este código.');
      throw e;
    }
    await auditar(id ? 'cupom.editado' : 'cupom.criado', { usuarioId: u.id, detalhes: { codigo: d.codigo } });
    refresh();
  }, 'Cupom salvo');
}

export async function salvarPromocao(_: unknown, form: FormData) {
  const p = z.object({
    nome: z.string().trim().min(3).max(100), tipo: z.enum(['PERCENTUAL', 'LEVE_PAGUE']),
    percentual: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(80).optional()),
    leve: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(2).max(10).optional()),
    pague: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(9).optional()),
    alvo: z.enum(['categoria', 'marca']), categoriaId: z.string().optional(), marcaId: z.string().optional(),
    inicio: z.coerce.date(), fim: z.coerce.date(),
  }).safeParse(campos(form));
  if (!p.success) return errosZod(p.error);
  return executar(async () => {
    const u = await exigirPermissao('marketing');
    const d = p.data;
    if (d.fim <= d.inicio) throw new ErroNegocio('A data final deve ser depois da inicial.');
    if (d.tipo === 'PERCENTUAL' && !d.percentual) throw new ErroNegocio('Informe o percentual.');
    if (d.tipo === 'LEVE_PAGUE' && (!d.leve || !d.pague || d.pague >= d.leve)) throw new ErroNegocio('No "leve X pague Y", Y deve ser menor que X.');
    const categoriaId = d.alvo === 'categoria' ? uuid.parse(d.categoriaId) : null;
    const marcaId = d.alvo === 'marca' ? uuid.parse(d.marcaId) : null;
    const dados = { nome: d.nome, tipo: d.tipo, percentual: d.tipo === 'PERCENTUAL' ? d.percentual : null, leve: d.tipo === 'LEVE_PAGUE' ? d.leve : null, pague: d.tipo === 'LEVE_PAGUE' ? d.pague : null, categoriaId, marcaId, inicio: d.inicio, fim: d.fim };
    const id = form.get('id') ? uuid.parse(form.get('id')) : null;
    const promo = id ? await db.promocao.update({ where: { id }, data: dados }) : await db.promocao.create({ data: dados });
    await auditar(id ? 'promocao.editada' : 'promocao.criada', { usuarioId: u.id, alvo: promo.id });
    updateTag('catalogo');
    refresh();
  }, 'Promoção salva. A alteração já vale na loja.');
}

export async function salvarBanner(_: unknown, form: FormData) {
  const p = z.object({
    titulo: z.string().trim().min(3).max(80), subtitulo: z.string().max(160).optional(), textoBotao: z.string().trim().min(2).max(30),
    link: z.string().trim().regex(/^\/[\w\-/?=&%.]*$/, 'Use um caminho interno, ex.: /categoria/vitaminas'),
    corDe: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), corPara: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), ordem: z.coerce.number().int().min(0).max(99),
    svg: z.string().max(400_000).optional(),
  }).safeParse(campos(form));
  if (!p.success) return errosZod(p.error);
  return executar(async () => {
    const u = await exigirPermissao('marketing');
    const { dimensoes, limparSvg } = await import('@/server/design/imagem');
    const id = form.get('id') ? uuid.parse(form.get('id')) : null;
    const d = p.data;
    const arte: { imagem?: Uint8Array<ArrayBuffer> | null; imagemMime?: string | null; svg?: string | null } = {};
    const arquivo = form.get('imagem');
    if (arquivo instanceof File && arquivo.size > 0) {
      if (arquivo.size > 3 * 1024 * 1024) throw new ErroNegocio('A imagem passa de 3 MB. Exporte em JPG ou WEBP com qualidade 85%.');
      const bytes = Buffer.from(await arquivo.arrayBuffer());
      const ass = ASSINATURA_IMG[arquivo.type];
      if (!ass || !ass.every((b, i) => bytes[i] === b)) throw new ErroNegocio('Envie JPG, PNG ou WEBP.');
      const dim = dimensoes(bytes);
      if (!dim) throw new ErroNegocio('Não consegui ler o tamanho da imagem.');
      const prop = dim.largura / dim.altura;
      if (dim.largura < 1200 || prop < 3 || prop > 3.4) throw new ErroNegocio(`A imagem tem ${dim.largura} × ${dim.altura} px. O padrão do site é 1600 × 500 px (proporção 3,2:1, mínimo 1200 px de largura).`);
      Object.assign(arte, { imagem: new Uint8Array(bytes), imagemMime: arquivo.type, svg: null });
    } else if (d.svg) {
      Object.assign(arte, { svg: limparSvg(d.svg), imagem: null, imagemMime: null });
    }
    const dados = { titulo: d.titulo, subtitulo: d.subtitulo || null, textoBotao: d.textoBotao, link: d.link, ordem: d.ordem, ...(d.corDe ? { corDe: d.corDe } : {}), ...(d.corPara ? { corPara: d.corPara } : {}), ...arte };
    if (id) await db.banner.update({ where: { id }, data: dados });
    else await db.banner.create({ data: { ...dados, icone: '' } });
    await auditar(id ? 'banner.editado' : 'banner.criado', { usuarioId: u.id, detalhes: { titulo: d.titulo, arte: arte.imagem ? 'imagem' : arte.svg ? 'ia' : 'padrao' } });
    refresh();
  }, 'Banner salvo');
}

export async function gerarBannerIA(briefing: unknown) {
  return executar(async () => {
    const u = await exigirPermissao('marketing');
    const { limitarTaxa } = await import('@/server/auth');
    limitarTaxa(`design:${u.id}`, 12, 60 * 60_000);
    const b = z.object({
      titulo: z.string().trim().min(3).max(80), subtitulo: z.string().max(160).optional(), cta: z.string().trim().min(2).max(30),
      oferta: z.string().max(60).optional(), tema: z.string().max(200).optional(), estilo: z.string().max(200).optional(),
      ajustes: z.string().max(400).optional(), svgAnterior: z.string().max(400_000).optional(),
    }).parse(briefing);
    const { criarBanner } = await import('@/server/design/agente');
    const r = await criarBanner(b);
    await auditar('banner.ia_gerado', { usuarioId: u.id, detalhes: { titulo: b.titulo } });
    return r;
  });
}

export async function excluirBanner(id: string) {
  return executar(async () => {
    const u = await exigirPermissao('marketing');
    await db.banner.delete({ where: { id: uuid.parse(id) } });
    await auditar('banner.excluido', { usuarioId: u.id, alvo: id });
    refresh();
  });
}

export async function alternarMarketing(tipo: 'cupom' | 'promocao' | 'banner', id: string) {
  return executar(async () => {
    const u = await exigirPermissao('marketing');
    const i = uuid.parse(id);
    if (tipo === 'cupom') { const c = await db.cupom.findUniqueOrThrow({ where: { id: i } }); await db.cupom.update({ where: { id: i }, data: { ativo: !c.ativo } }); }
    if (tipo === 'promocao') { const c = await db.promocao.findUniqueOrThrow({ where: { id: i } }); await db.promocao.update({ where: { id: i }, data: { ativa: !c.ativa } }); }
    if (tipo === 'banner') { const c = await db.banner.findUniqueOrThrow({ where: { id: i } }); await db.banner.update({ where: { id: i }, data: { ativo: !c.ativo } }); }
    await auditar(`${tipo}.alternado`, { usuarioId: u.id, alvo: i });
    refresh();
  });
}

export async function moderarAvaliacao(id: string, status: 'APROVADA' | 'GUARDADA' | 'REJEITADA' | 'PENDENTE') {
  return executar(async () => {
    const u = await exigirPermissao('avaliacoes');
    const st = z.enum(['APROVADA', 'GUARDADA', 'REJEITADA', 'PENDENTE']).parse(status);
    await db.avaliacao.update({ where: { id: uuid.parse(id) }, data: { status: st } });
    await auditar('avaliacao.moderada', { usuarioId: u.id, alvo: id, detalhes: { status: st } });
    refresh();
  });
}

// ─────────────── PDV e caixa ───────────────

export async function abrirCaixaAcao(_: unknown, form: FormData) {
  return executar(async () => { const u = await exigirPermissao('pdv'); await abrirCaixa(u, reais.parse(form.get('valor') || '0')); refresh(); }, 'Caixa aberto');
}

export async function movimentarCaixaAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('pdv');
    await movimentarCaixa(u, z.enum(['SANGRIA', 'SUPRIMENTO']).parse(form.get('tipo')), reais.parse(form.get('valor')), String(form.get('descricao') ?? '').slice(0, 100));
    refresh();
  }, 'Movimento registrado');
}

export async function fecharCaixaAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('pdv');
    const r = await fecharCaixa(u, reais.parse(form.get('valor') || '0'));
    refresh();
    return r.diferenca;
  }, 'Caixa fechado');
}

export async function buscarProdutoPdv(q: string) {
  const u = await exigirPermissao('pdv');
  const t = normalizar(String(q ?? '')).slice(0, 60);
  if (t.length < 2) return [];
  const produtos = await db.produto.findMany({
    where: { ativo: true, OR: [{ busca: { contains: t } }, { ean: t }, { sku: t.toUpperCase() }] },
    take: 8, orderBy: { vendas: 'desc' },
    select: { id: true, nome: true, preco: true, icone: true, classificacao: true, ean: true, lotes: { where: { lojaId: u.lojaId ?? undefined, validade: { gt: new Date() } }, select: { quantidade: true, reservado: true } } },
  });
  return produtos.map(({ lotes, ...p }) => ({ ...p, disponivel: lotes.reduce((s, l) => s + l.quantidade - l.reservado, 0) }));
}

export async function finalizarVendaPdv(dados: unknown) {
  return executar(async () => {
    const u = await exigirPermissao('pdv');
    const d = z.object({
      itens: z.array(z.object({ produtoId: uuid, quantidade: z.number().int().min(1).max(100) })).min(1).max(100),
      metodo: z.enum(MetodoPagamento), valorRecebido: z.number().int().min(0).optional(),
      cpf: z.string().transform((s) => s.replace(/\D/g, '')).optional(), receitaConferida: z.boolean().optional(), registroPrescritor: z.string().max(30).optional(),
    }).parse(dados);
    const r = await venderBalcao(u, { ...d, cpf: d.cpf || undefined });
    refresh();
    return r;
  });
}

// ─────────────── ANVISA ───────────────

export async function marcarTransmitidoSngpc(ids: string[]) {
  return executar(async () => {
    const u = await exigirPermissao('anvisa');
    if (u.papel !== 'FARMACEUTICO' && u.papel !== 'ADMIN') throw new ErroNegocio('Somente o farmacêutico responsável transmite ao SNGPC.');
    const lista = z.array(uuid).max(500).parse(ids);
    await db.escrituracao.updateMany({ where: { id: { in: lista } }, data: { transmitidoSngpc: true } });
    await auditar('sngpc.transmitido', { usuarioId: u.id, detalhes: { quantidade: lista.length } });
    refresh();
  }, 'Registros marcados como transmitidos');
}

// ─────────────── Equipe e lojas ───────────────

export async function salvarMembroEquipe(_: unknown, form: FormData) {
  const p = z.object({
    nome: z.string().trim().min(5).max(120), email: z.string().trim().toLowerCase().email(),
    papel: z.enum(Papel).refine((x) => x !== 'CLIENTE', 'Escolha um papel da equipe'),
    lojaId: z.string().optional(), crf: z.string().trim().max(20).optional(), senha: z.string().optional(),
  }).safeParse(campos(form));
  if (!p.success) return errosZod(p.error);
  return executar(async () => {
    const u = await exigirPermissao('equipe');
    const d = p.data;
    if (d.papel === 'FARMACEUTICO' && !/^CRF-[A-Z]{2}\s?\d{3,7}$/i.test(d.crf ?? '')) throw new ErroNegocio('Farmacêutico exige CRF válido (ex.: CRF-SP 12345).');
    const id = form.get('id') ? uuid.parse(form.get('id')) : null;
    const lojaId = d.lojaId ? uuid.parse(d.lojaId) : null;
    if (id) {
      if (id === u.id && d.papel !== 'ADMIN') throw new ErroNegocio('Você não pode remover seu próprio acesso de administrador.');
      await db.usuario.update({ where: { id }, data: { nome: d.nome, papel: d.papel, lojaId, crf: d.crf || null } });
      await db.sessao.deleteMany({ where: { usuarioId: id } }); // aplica a nova permissão imediatamente
    } else {
      validarSenhaForte(d.senha ?? '');
      if (await db.usuario.findUnique({ where: { email: d.email } })) throw new ErroNegocio('E-mail já cadastrado.');
      await db.usuario.create({ data: { nome: d.nome, email: d.email, papel: d.papel, lojaId, crf: d.crf || null, senhaHash: hashSenha(d.senha!), consentimentoLgpdEm: new Date() } });
    }
    await auditar('equipe.salvo', { usuarioId: u.id, detalhes: { email: d.email, papel: d.papel } });
    refresh();
  }, 'Membro da equipe salvo');
}

export async function alternarAtivoUsuario(id: string) {
  return executar(async () => {
    const u = await exigirPermissao('equipe');
    if (id === u.id) throw new ErroNegocio('Você não pode desativar a si mesmo.');
    const alvo = await db.usuario.findUniqueOrThrow({ where: { id: uuid.parse(id) } });
    await db.usuario.update({ where: { id: alvo.id }, data: { ativo: !alvo.ativo } });
    if (alvo.ativo) await db.sessao.deleteMany({ where: { usuarioId: alvo.id } });
    await auditar(alvo.ativo ? 'usuario.desativado' : 'usuario.ativado', { usuarioId: u.id, alvo: alvo.id });
    refresh();
  });
}

export async function salvarLoja(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('lojas');
    const d = z.object({
      id: uuid, nome: z.string().trim().min(3).max(80), cnpj: z.string().trim().min(14).max(20),
      cep: z.string().transform((s) => s.replace(/\D/g, '')).refine((s) => s.length === 8, 'CEP inválido'),
      logradouro: z.string().trim().min(3).max(150), numero: z.string().trim().min(1).max(10), bairro: z.string().trim().min(2).max(80),
      cidade: z.string().trim().min(2).max(80), uf: z.string().trim().length(2).toUpperCase(),
      horario: z.string().trim().min(3).max(120), telefone: z.string().trim().min(8).max(20),
      faixasCep: z.string().max(300), aceitaExpressa: z.string().optional(), ativa: z.string().optional(),
    }).parse(campos(form));
    const faixas = d.faixasCep.split(/[,\s]+/).filter(Boolean);
    if (faixas.some((f) => !/^\d{5}(-\d{5})?$/.test(f))) throw new ErroNegocio('Faixas de CEP no formato 01000-01999, separadas por vírgula.');
    await db.loja.update({ where: { id: d.id }, data: { nome: d.nome, cnpj: d.cnpj, cep: d.cep, logradouro: d.logradouro, numero: d.numero, bairro: d.bairro, cidade: d.cidade, uf: d.uf, horario: d.horario, telefone: d.telefone.replace(/\D/g, ''), faixasCep: faixas, aceitaExpressa: d.aceitaExpressa === 'on', ativa: d.ativa === 'on' } });
    await auditar('loja.atualizada', { usuarioId: u.id, alvo: d.id });
    updateTag('lojas');
    refresh();
  }, 'Loja atualizada');
}

// ─────────────── Fotos de produto ───────────────


export async function enviarFotosProduto(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('produtos');
    const produtoId = uuid.parse(form.get('produtoId'));
    const arquivos = form.getAll('fotos').filter((f): f is File => f instanceof File && f.size > 0);
    if (!arquivos.length) throw new ErroNegocio('Escolha ao menos uma foto.');
    const atuais = await db.imagemProduto.count({ where: { produtoId } });
    if (atuais + arquivos.length > 8) throw new ErroNegocio('Máximo de 8 fotos por produto.');
    let ordem = atuais;
    for (const f of arquivos) {
      if (f.size > 2 * 1024 * 1024) throw new ErroNegocio(`"${f.name}" passa de 2 MB.`);
      const bytes = Buffer.from(await f.arrayBuffer());
      const ass = ASSINATURA_IMG[f.type];
      if (!ass || !ass.every((b, i) => bytes[i] === b)) throw new ErroNegocio(`"${f.name}" não é JPG, PNG ou WEBP válido.`);
      await db.imagemProduto.create({ data: { produtoId, mime: f.type, dados: new Uint8Array(bytes), tamanho: f.size, ordem: ordem++ } });
    }
    await auditar('produto.fotos', { usuarioId: u.id, alvo: produtoId, detalhes: { quantidade: arquivos.length } });
    refresh();
  }, 'Fotos enviadas');
}

export async function removerFotoProduto(id: string) {
  return executar(async () => {
    const u = await exigirPermissao('produtos');
    const img = await db.imagemProduto.delete({ where: { id: uuid.parse(id) } });
    await auditar('produto.foto_removida', { usuarioId: u.id, alvo: img.produtoId });
    refresh();
  });
}

export async function tornarFotoPrincipal(id: string) {
  return executar(async () => {
    await exigirPermissao('produtos');
    const img = await db.imagemProduto.findUniqueOrThrow({ where: { id: uuid.parse(id) } });
    const todas = await db.imagemProduto.findMany({ where: { produtoId: img.produtoId }, orderBy: { ordem: 'asc' }, select: { id: true } });
    const nova = [img.id, ...todas.map((t) => t.id).filter((x) => x !== img.id)];
    await db.$transaction(nova.map((x, i) => db.imagemProduto.update({ where: { id: x }, data: { ordem: i } })));
    refresh();
  });
}

// ─────────────── Integrações (chaves guardadas cifradas no banco) ───────────────

export async function salvarChaveAnthropic(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao('lojas');
    const { INTEGRACOES, salvarSegredo } = await import('@/server/integracoes');
    const { testarChave } = await import('@/server/assistente/ia');
    const chave = String(form.get('chave') ?? '').trim();
    if (!INTEGRACOES.ANTHROPIC_API_KEY.formato.test(chave)) throw new ErroNegocio('Cole a chave completa, que começa com "sk-ant-".');
    const t = await testarChave(chave);
    if (!t.ok) throw new ErroNegocio(`A Anthropic recusou a chave: ${t.erro}`);
    await salvarSegredo('ANTHROPIC_API_KEY', chave, u.id);
    refresh();
    return t.modelo;
  }, 'Chave validada e salva. O assistente já está ativo.');
}

export async function removerChaveAnthropic() {
  return executar(async () => {
    const u = await exigirPermissao('lojas');
    const { removerSegredo } = await import('@/server/integracoes');
    await removerSegredo('ANTHROPIC_API_KEY', u.id);
    refresh();
  }, 'Chave removida. As dúvidas voltam a ir direto para o farmacêutico.');
}

// ─────────────── Permissões e configurações (painel do dono) ───────────────

export async function salvarPermissoesAcao(matriz: Record<string, string[]>) {
  return executar(async () => {
    const u = await exigirPermissao('configuracoes');
    const { salvarMatriz } = await import('@/server/permissoes');
    await salvarMatriz(z.record(z.string(), z.array(z.string())).parse(matriz), u.id);
    refresh();
  }, 'Permissões salvas. Valem a partir do próximo clique de cada pessoa.');
}

export async function restaurarPermissoesAcao() {
  return executar(async () => {
    const u = await exigirPermissao('configuracoes');
    const { restaurarPadrao } = await import('@/server/permissoes');
    await restaurarPadrao(u.id);
    refresh();
  }, 'Permissões padrão restauradas.');
}

const centavos = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? '0').replace(/\./g, '').replace(',', '.')) * 100) || 0;

export async function salvarConfiguracaoAcao(grupo: string, _: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirPermissao(grupo === 'entrega' ? 'lojas' : 'configuracoes');
    const { salvarConfiguracao, SCHEMAS } = await import('@/server/configuracoes');
    if (!(grupo in SCHEMAS)) throw new ErroNegocio('Grupo de configuração inválido.');
    const c = campos(form);
    const bool = (k: string) => form.get(k) === 'on';
    const valor: unknown = ({
      contato: { whatsapp: c.whatsapp ?? '', telefone: c.telefone ?? '', email: c.email ?? '', afe: c.afe ?? '', rtNome: c.rtNome ?? '', rtCrf: c.rtCrf ?? '' },
      assistente: { nome: c.nome, limiteDiario: c.limiteDiario, ativo: bool('ativo') },
      entrega: {
        ativa: bool('ativa'), somenteBairrosCadastrados: bool('somenteBairrosCadastrados'), retiradaAtiva: bool('retiradaAtiva'),
        taxaPadrao: centavos(form.get('taxaPadrao')), pedidoMinimo: centavos(form.get('pedidoMinimo')), freteGratisAcima: centavos(form.get('freteGratisAcima')),
        taxaMaxima: centavos(form.get('taxaMaxima')), prazoPadraoMinutos: c.prazoPadraoMinutos,
      },
      impressao: { larguraMm: Number(c.larguraMm), automatica: bool('automatica'), cabecalho: c.cabecalho ?? '', rodape: c.rodape ?? '', mostrarCpf: bool('mostrarCpf'), vias: c.vias },
      fiscal: {
        ambiente: c.ambiente, regime: c.regime, inscricaoEstadual: c.inscricaoEstadual ?? '', inscricaoMunicipal: c.inscricaoMunicipal ?? '', serieNfce: c.serieNfce,
        proximoNumeroNfce: c.proximoNumeroNfce, cscId: c.cscId ?? '', provedor: c.provedor, emitirAutomaticamente: bool('emitirAutomaticamente'),
      },
    } as Record<string, unknown>)[grupo];
    try {
      await salvarConfiguracao(grupo as never, valor, u.id);
    } catch (e) {
      if (e instanceof z.ZodError) throw new ErroNegocio(e.issues.map((i) => i.message).join(' · '));
      throw e;
    }
    refresh();
  }, 'Configuração salva');
}
