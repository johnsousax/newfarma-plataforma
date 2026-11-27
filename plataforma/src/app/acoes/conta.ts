'use server';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/server/db';
import { executar, ErroNegocio } from '@/server/erros';
import { entrar, sair, iniciarSessao, exigirUsuario, validarSenhaForte, limitarTaxa, ipAtual, concluirSegundoFator } from '@/server/auth';
import { mesclarCarrinhoVisitante } from '@/server/carrinho';
import { hashSenha, cifrar, indiceCpf, verificarSenha } from '@/server/cripto';
import { auditar } from '@/server/auditoria';
import { cpfValido } from '@/lib/texto';
import { EQUIPE } from '@/lib/dominio';

const destinoSeguro = (v: unknown, padrao: string) => {
  const s = String(v ?? '');
  return s.startsWith('/') && !s.startsWith('//') ? s : padrao;
};

export async function entrarAcao(_: unknown, form: FormData) {
  const r = await executar(async () => {
    const email = z.string().email('E-mail inválido').parse(String(form.get('email') ?? '').trim());
    const u = await entrar(email, String(form.get('senha') ?? ''));
    if (u.mfaPendente) return { papel: u.papel, mfa: true };
    await mesclarCarrinhoVisitante(u.id);
    return { papel: u.papel, mfa: false };
  });
  if (!r.ok) return r;
  const destino = destinoSeguro(form.get('voltar'), EQUIPE.includes(r.dados!.papel) ? '/admin' : '/conta');
  if (r.dados!.mfa) redirect(`/entrar/codigo?voltar=${encodeURIComponent(destino)}`);
  redirect(destino);
}

/** Segunda etapa do login: código do app autenticador (ou de recuperação). */
export async function codigoLoginAcao(_: unknown, form: FormData) {
  const r = await executar(async () => {
    const u = await concluirSegundoFator(String(form.get('codigo') ?? '').trim().slice(0, 20));
    await mesclarCarrinhoVisitante(u.id);
    return u.papel;
  });
  if (!r.ok) return r;
  redirect(destinoSeguro(form.get('voltar'), EQUIPE.includes(r.dados!) ? '/admin' : '/conta'));
}

const cadastroSchema = z.object({
  nome: z.string().trim().min(5, 'Informe o nome completo').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  cpf: z.string().transform((s) => s.replace(/\D/g, '')).refine(cpfValido, 'CPF inválido'),
  telefone: z.string().transform((s) => s.replace(/\D/g, '')).refine((s) => s.length >= 10 && s.length <= 11, 'Telefone inválido'),
  nascimento: z.string().refine((s) => { const d = new Date(s); return !Number.isNaN(d.getTime()) && d < new Date(Date.now() - 16 * 365 * 86_400_000); }, 'É preciso ter 16 anos ou mais'),
  senha: z.string(),
  lgpd: z.literal('on', { error: 'É necessário aceitar a Política de Privacidade' }),
  marketing: z.string().optional(),
});

export async function cadastrarAcao(_: unknown, form: FormData) {
  const dados = Object.fromEntries(form);
  const p = cadastroSchema.safeParse(dados);
  if (!p.success) {
    const campos = Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message]));
    return { ok: false as const, erro: 'Confira os campos destacados.', campos };
  }
  const r = await executar(async () => {
    limitarTaxa(`cadastro:${await ipAtual()}`, 10, 60 * 60_000);
    validarSenhaForte(p.data.senha);
    const cpfHash = indiceCpf(p.data.cpf);
    if (await db.usuario.findFirst({ where: { OR: [{ email: p.data.email }, { cpfHash }] } })) throw new ErroNegocio('Já existe uma conta com este e-mail ou CPF.');
    const u = await db.usuario.create({
      data: {
        nome: p.data.nome, email: p.data.email, senhaHash: hashSenha(p.data.senha), cpfCifrado: cifrar(p.data.cpf), cpfHash,
        telefone: p.data.telefone, nascimento: new Date(p.data.nascimento), consentimentoLgpdEm: new Date(), aceitaMarketing: p.data.marketing === 'on',
      },
    });
    await auditar('conta.criada', { usuarioId: u.id, ip: await ipAtual() });
    await iniciarSessao(u.id);
    await mesclarCarrinhoVisitante(u.id);
  });
  if (!r.ok) return r;
  redirect(destinoSeguro(form.get('voltar'), '/conta?bemvindo=1'));
}

export async function sairAcao() {
  await sair();
  redirect('/');
}

const enderecoSchema = z.object({
  apelido: z.string().trim().min(2).max(30),
  destinatario: z.string().trim().min(3).max(120),
  cep: z.string().transform((s) => s.replace(/\D/g, '')).refine((s) => s.length === 8, 'CEP inválido'),
  logradouro: z.string().trim().min(3).max(150),
  numero: z.string().trim().min(1).max(10),
  complemento: z.string().trim().max(60).optional(),
  bairro: z.string().trim().min(2).max(80),
  cidade: z.string().trim().min(2).max(80),
  uf: z.string().trim().length(2).toUpperCase(),
  principal: z.string().optional(),
});

export async function salvarEndereco(_: unknown, form: FormData) {
  const p = enderecoSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false as const, erro: 'Confira os campos do endereço.', campos: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  return executar(async () => {
    const u = await exigirUsuario();
    const id = form.get('id') ? z.string().uuid().parse(form.get('id')) : null;
    const total = await db.endereco.count({ where: { usuarioId: u.id } });
    if (!id && total >= 10) throw new ErroNegocio('Limite de 10 endereços.');
    const principal = p.data.principal === 'on' || total === 0;
    const { principal: _p, ...dados } = p.data;
    await db.$transaction(async (tx) => {
      if (principal) await tx.endereco.updateMany({ where: { usuarioId: u.id }, data: { principal: false } });
      if (id) {
        const r = await tx.endereco.updateMany({ where: { id, usuarioId: u.id }, data: { ...dados, principal } });
        if (!r.count) throw new ErroNegocio('Endereço não encontrado.');
      } else await tx.endereco.create({ data: { ...dados, principal, usuarioId: u.id } });
    });
    refresh();
  }, 'Endereço salvo');
}

export async function removerEndereco(id: string) {
  return executar(async () => {
    const u = await exigirUsuario();
    await db.endereco.deleteMany({ where: { id: z.string().uuid().parse(id), usuarioId: u.id } });
    refresh();
  });
}

export async function alternarFavorito(produtoId: string) {
  return executar(async () => {
    const u = await exigirUsuario();
    const pid = z.string().uuid().parse(produtoId);
    const existe = await db.favorito.findUnique({ where: { usuarioId_produtoId: { usuarioId: u.id, produtoId: pid } } });
    if (existe) await db.favorito.delete({ where: { usuarioId_produtoId: { usuarioId: u.id, produtoId: pid } } });
    else await db.favorito.create({ data: { usuarioId: u.id, produtoId: pid } });
    refresh();
    return !existe;
  });
}

export async function salvarDados(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    const nome = z.string().trim().min(5).max(120).parse(form.get('nome'));
    const telefone = z.string().transform((s) => s.replace(/\D/g, '')).refine((s) => s.length >= 10 && s.length <= 11, 'Telefone inválido').parse(form.get('telefone'));
    await db.usuario.update({ where: { id: u.id }, data: { nome, telefone, aceitaMarketing: form.get('marketing') === 'on' } });
    refresh();
  }, 'Dados atualizados');
}

export async function trocarSenha(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    const atual = String(form.get('atual') ?? '');
    const nova = String(form.get('nova') ?? '');
    const completo = await db.usuario.findUniqueOrThrow({ where: { id: u.id } });
    if (!verificarSenha(atual, completo.senhaHash)) throw new ErroNegocio('Senha atual incorreta.');
    validarSenhaForte(nova);
    await db.usuario.update({ where: { id: u.id }, data: { senhaHash: hashSenha(nova) } });
    await db.sessao.deleteMany({ where: { usuarioId: u.id } });
    await auditar('conta.senha_alterada', { usuarioId: u.id, ip: await ipAtual() });
    await iniciarSessao(u.id);
  }, 'Senha alterada. As outras sessões foram encerradas.');
}

/** LGPD art. 18: eliminação. Mantém pedidos (obrigação legal/fiscal) mas anonimiza a conta. */
export async function excluirConta(_: unknown, form: FormData) {
  const r = await executar(async () => {
    const u = await exigirUsuario();
    if (u.papel !== 'CLIENTE') throw new ErroNegocio('Contas da equipe são desativadas pelo administrador.');
    const completo = await db.usuario.findUniqueOrThrow({ where: { id: u.id } });
    if (!verificarSenha(String(form.get('senha') ?? ''), completo.senhaHash)) throw new ErroNegocio('Senha incorreta.');
    await db.$transaction([
      db.endereco.deleteMany({ where: { usuarioId: u.id } }),
      db.favorito.deleteMany({ where: { usuarioId: u.id } }),
      db.lembrete.deleteMany({ where: { usuarioId: u.id } }),
      db.conversa.deleteMany({ where: { usuarioId: u.id } }),
      db.assinatura.deleteMany({ where: { usuarioId: u.id } }),
      db.sessao.deleteMany({ where: { usuarioId: u.id } }),
      db.usuario.update({ where: { id: u.id }, data: { nome: 'Cliente removido', email: `removido-${u.id}@anonimo.invalid`, cpfCifrado: null, cpfHash: null, telefone: null, nascimento: null, ativo: false, aceitaMarketing: false, senhaHash: hashSenha(crypto.randomUUID()) } }),
    ]);
    await auditar('conta.excluida_lgpd', { usuarioId: u.id, ip: await ipAtual() });
  });
  if (!r.ok) return r;
  await sair();
  redirect('/?conta=excluida');
}

export async function avaliarProdutoAcao(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    const produtoId = z.string().uuid().parse(form.get('produtoId'));
    const nota = z.coerce.number().int().min(1).max(5).parse(form.get('nota'));
    const titulo = z.string().trim().min(3, 'Título muito curto').max(80).parse(form.get('titulo'));
    const comentario = z.string().trim().min(10, 'Conte um pouco mais (mín. 10 caracteres)').max(1000).parse(form.get('comentario'));
    const comprou = await db.pedidoItem.count({ where: { produtoId, pedido: { usuarioId: u.id, status: 'ENTREGUE' } } });
    await db.avaliacao.upsert({
      where: { produtoId_usuarioId: { produtoId, usuarioId: u.id } },
      create: { produtoId, usuarioId: u.id, nota, titulo, comentario, compraVerificada: comprou > 0 },
      update: { nota, titulo, comentario, status: 'PENDENTE' },
    });
    refresh();
  }, 'Obrigado! Sua avaliação será publicada após moderação.');
}

const assinaturaSchema = z.object({ produtoId: z.string().uuid(), quantidade: z.coerce.number().int().min(1).max(10), intervaloDias: z.coerce.number().int().refine((n) => [15, 30, 45, 60, 90].includes(n)), enderecoId: z.string().uuid().optional() });

export async function criarAssinatura(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    const d = assinaturaSchema.parse(Object.fromEntries([...form].filter(([, v]) => v !== '')));
    const p = await db.produto.findUnique({ where: { id: d.produtoId } });
    if (!p || p.classificacao === 'CONTROLADO') throw new ErroNegocio('Produto não disponível para assinatura.');
    if (d.enderecoId && !(await db.endereco.findFirst({ where: { id: d.enderecoId, usuarioId: u.id } }))) throw new ErroNegocio('Endereço inválido.');
    await db.assinatura.create({ data: { ...d, usuarioId: u.id, proximaEntrega: new Date(Date.now() + d.intervaloDias * 86_400_000) } });
    refresh();
  }, 'Assinatura criada! Avisaremos antes de cada entrega.');
}

export async function alternarAssinatura(id: string) {
  return executar(async () => {
    const u = await exigirUsuario();
    const a = await db.assinatura.findFirst({ where: { id: z.string().uuid().parse(id), usuarioId: u.id } });
    if (!a) throw new ErroNegocio('Assinatura não encontrada.');
    await db.assinatura.update({ where: { id: a.id }, data: { ativa: !a.ativa } });
    refresh();
  });
}

export async function salvarLembrete(_: unknown, form: FormData) {
  return executar(async () => {
    const u = await exigirUsuario();
    const nome = z.string().trim().min(2).max(120).parse(form.get('nomeMedicamento'));
    const horarios = String(form.get('horarios') ?? '').split(/[,\s]+/).filter(Boolean);
    if (!horarios.length || horarios.some((h) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(h))) throw new ErroNegocio('Informe horários no formato HH:MM, separados por vírgula.');
    const doses = form.get('dosesRestantes') ? z.coerce.number().int().min(0).max(1000).parse(form.get('dosesRestantes')) : null;
    const produtoId = form.get('produtoId') ? z.string().uuid().parse(form.get('produtoId')) : null;
    await db.lembrete.create({ data: { usuarioId: u.id, nomeMedicamento: nome, dosagem: String(form.get('dosagem') ?? '').slice(0, 60) || null, horarios: horarios.slice(0, 8), inicio: new Date(), dosesRestantes: doses, produtoId } });
    refresh();
  }, 'Lembrete criado');
}

export async function removerLembrete(id: string) {
  return executar(async () => {
    const u = await exigirUsuario();
    await db.lembrete.deleteMany({ where: { id: z.string().uuid().parse(id), usuarioId: u.id } });
    refresh();
  });
}

// ─────────────── Recuperação de senha ───────────────

/** Sempre responde igual, exista ou não a conta (não revela e-mails cadastrados). */
export async function pedirRedefinicaoSenha(_: unknown, form: FormData) {
  return executar(async () => {
    const ip = await ipAtual();
    limitarTaxa(`esqueci:${ip}`, 5, 60 * 60_000);
    const email = z.string().trim().toLowerCase().email('E-mail inválido').parse(form.get('email'));
    const u = await db.usuario.findUnique({ where: { email } });
    if (u?.ativo) {
      const { tokenAleatorio, sha256 } = await import('@/server/cripto');
      const { enviarEmail } = await import('@/server/notificacoes');
      const { FARMACIA } = await import('@/lib/farmacia');
      await db.tokenSenha.updateMany({ where: { usuarioId: u.id, usadoEm: null }, data: { usadoEm: new Date() } });
      const token = tokenAleatorio();
      await db.tokenSenha.create({ data: { usuarioId: u.id, tokenHash: sha256(token), expiraEm: new Date(Date.now() + 60 * 60_000) } });
      const link = `${FARMACIA.site}/redefinir-senha?token=${token}`;
      await enviarEmail(email, `${FARMACIA.nome}: redefinição de senha`, `Olá, ${u.nome.split(' ')[0]}!\n\nRecebemos um pedido para redefinir sua senha. Use o link abaixo em até 1 hora:\n${link}\n\nSe não foi você, ignore este e-mail. Sua senha continua a mesma.`);
      await auditar('conta.redefinicao_pedida', { usuarioId: u.id, ip });
    }
  }, 'Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha. Confira também a caixa de spam.');
}

export async function redefinirSenha(_: unknown, form: FormData) {
  const r = await executar(async () => {
    const { sha256 } = await import('@/server/cripto');
    const token = z.string().min(20).max(100).parse(form.get('token'));
    const nova = String(form.get('senha') ?? '');
    if (nova !== String(form.get('confirmacao') ?? '')) throw new ErroNegocio('As senhas não conferem.');
    validarSenhaForte(nova);
    const t = await db.tokenSenha.findUnique({ where: { tokenHash: sha256(token) } });
    if (!t || t.usadoEm || t.expiraEm < new Date()) throw new ErroNegocio('Link inválido ou expirado. Peça um novo.');
    await db.$transaction([
      db.tokenSenha.update({ where: { id: t.id }, data: { usadoEm: new Date() } }),
      db.usuario.update({ where: { id: t.usuarioId }, data: { senhaHash: hashSenha(nova), tentativasFalhas: 0, bloqueadoAte: null } }),
      db.sessao.deleteMany({ where: { usuarioId: t.usuarioId } }),
    ]);
    await auditar('conta.senha_redefinida', { usuarioId: t.usuarioId, ip: await ipAtual() });
  });
  if (!r.ok) return r;
  redirect('/entrar?senha=redefinida');
}
