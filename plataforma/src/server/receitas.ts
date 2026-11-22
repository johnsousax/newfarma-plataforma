import 'server-only';
import { db } from './db';
import { config } from './config';
import { ErroNegocio } from './erros';
import { auditar } from './auditoria';
import { cifrar, cifrarBytes, decifrar, decifrarBytes } from './cripto';
import { REGRAS } from '@/lib/dominio';
import type { UsuarioSessao } from './auth';

const TIPOS: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};
const MAX_BYTES = 5 * 1024 * 1024;

/** Cliente envia a receita (arquivo + dados do prescritor). O arquivo é cifrado antes de ir ao banco. */
export async function enviarReceita(usuario: UsuarioSessao, pedidoId: string, arquivo: File, dados: { prescritor: string; registro: string; dataEmissao: string }, ip: string) {
  const pedido = await db.pedido.findFirst({ where: { id: pedidoId, usuarioId: usuario.id }, include: { itens: true } });
  if (!pedido) throw new ErroNegocio('Pedido não encontrado.', 404);
  if (pedido.status !== 'AGUARDANDO_RECEITA') throw new ErroNegocio('Este pedido não está aguardando receita.');
  if (!arquivo || arquivo.size === 0) throw new ErroNegocio('Anexe a foto ou o PDF da receita.');
  if (arquivo.size > MAX_BYTES) throw new ErroNegocio('Arquivo muito grande (máximo 5 MB).');
  const assinatura = TIPOS[arquivo.type];
  if (!assinatura) throw new ErroNegocio('Envie a receita em JPG, PNG ou PDF.');
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (!assinatura.every((b, i) => bytes[i] === b)) throw new ErroNegocio('O conteúdo do arquivo não corresponde ao tipo informado.');

  const registro = dados.registro.trim().toUpperCase();
  if (!/^(CRM|CRO|CRMV)[-\s]?[A-Z]{2}\s?\d{3,7}$/.test(registro)) throw new ErroNegocio('Registro do prescritor inválido (ex.: CRM-SP 123456).');
  const emissao = new Date(dados.dataEmissao);
  if (Number.isNaN(emissao.getTime()) || emissao > new Date()) throw new ErroNegocio('Data de emissão inválida.');
  if (dados.prescritor.trim().length < 3) throw new ErroNegocio('Informe o nome do prescritor.');

  await db.receita.updateMany({ where: { pedidoId, status: 'PENDENTE' }, data: { status: 'REJEITADA', observacao: 'Substituída por novo envio' } });
  const r = await db.receita.create({
    data: {
      pedidoId, usuarioId: usuario.id, arquivoCifrado: new Uint8Array(cifrarBytes(bytes)), mime: arquivo.type, tamanho: arquivo.size,
      prescritorCifrado: cifrar(dados.prescritor.trim().slice(0, 120)), registroPrescritor: registro, dataEmissao: emissao,
    },
  });
  await db.pedidoEvento.create({ data: { pedidoId, status: 'AGUARDANDO_RECEITA', descricao: 'Receita enviada. Um farmacêutico vai analisar.', usuarioId: usuario.id } });
  await auditar('receita.enviada', { usuarioId: usuario.id, alvo: r.id, ip });
  return r;
}

export function validadeReceita(dataEmissao: Date, temAntimicrobiano: boolean) {
  const dias = temAntimicrobiano ? config.anvisa.validadeReceitaAntimicrobianoDias : config.anvisa.validadeReceitaComumDias;
  const limite = new Date(dataEmissao.getTime() + dias * 86_400_000);
  return { dias, limite, valida: limite >= new Date() };
}

/** Somente farmacêutico com CRF avalia. Aprovação libera o pedido para pagamento. */
export async function avaliarReceita(farm: UsuarioSessao, receitaId: string, aprovada: boolean, observacao: string, ip: string) {
  if (farm.papel !== 'FARMACEUTICO' || !farm.crf) throw new ErroNegocio('Somente farmacêutico com CRF cadastrado pode avaliar receitas.', 403);
  return db.$transaction(async (tx) => {
    const r = await tx.receita.findUnique({ where: { id: receitaId }, include: { pedido: { include: { itens: true } } } });
    if (!r) throw new ErroNegocio('Receita não encontrada.', 404);
    if (r.status !== 'PENDENTE') throw new ErroNegocio('Receita já avaliada.', 409);
    const temAtm = r.pedido.itens.some((i) => i.classificacao === 'ANTIMICROBIANO');
    const v = validadeReceita(r.dataEmissao, temAtm);
    if (aprovada && !v.valida) throw new ErroNegocio(`Receita vencida: validade de ${v.dias} dias a partir da emissão.`);
    if (!aprovada && observacao.trim().length < 5) throw new ErroNegocio('Explique ao cliente o motivo da recusa.');
    await tx.receita.update({ where: { id: r.id }, data: { status: aprovada ? 'APROVADA' : 'REJEITADA', farmaceuticoId: farm.id, observacao: observacao.slice(0, 500) || null, avaliadoEm: new Date() } });
    if (aprovada && r.pedido.status === 'AGUARDANDO_RECEITA') {
      await tx.pedido.update({ where: { id: r.pedidoId }, data: { status: 'AGUARDANDO_PAGAMENTO' } });
      await tx.pedidoEvento.create({ data: { pedidoId: r.pedidoId, status: 'AGUARDANDO_PAGAMENTO', descricao: `Receita aprovada por ${farm.nome} (${farm.crf}). Conclua o pagamento.`, usuarioId: farm.id } });
    } else if (!aprovada) {
      await tx.pedidoEvento.create({ data: { pedidoId: r.pedidoId, status: 'AGUARDANDO_RECEITA', descricao: `Receita recusada: ${observacao}. Envie uma nova receita ou cancele o pedido.`, usuarioId: farm.id } });
    }
    await auditar(aprovada ? 'receita.aprovada' : 'receita.rejeitada', { usuarioId: farm.id, alvo: r.id, ip }, tx);
  });
}

export async function arquivoReceita(receitaId: string) {
  const r = await db.receita.findUnique({ where: { id: receitaId } });
  if (!r) return null;
  return { bytes: decifrarBytes(r.arquivoCifrado), mime: r.mime };
}

export async function receitasPendentes() {
  const lista = await db.receita.findMany({
    where: { status: 'PENDENTE' },
    orderBy: { criadoEm: 'asc' },
    include: { pedido: { include: { itens: true, loja: { select: { nome: true } } } }, usuario: { select: { nome: true } } },
  });
  return lista.map((r) => {
    const temAtm = r.pedido.itens.some((i) => i.classificacao === 'ANTIMICROBIANO');
    return { ...r, arquivoCifrado: undefined, prescritor: decifrar(r.prescritorCifrado), validade: validadeReceita(r.dataEmissao, temAtm), itensReceita: r.pedido.itens.filter((i) => REGRAS[i.classificacao].exigeReceita) };
  });
}
