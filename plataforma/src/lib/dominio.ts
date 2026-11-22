// Regras e rótulos compartilhados entre servidor e interface (sem dados sensíveis).
import type { Classificacao, StatusPedido, Modalidade, MetodoPagamento, Papel, TipoMedicamento } from '@/generated/prisma/enums';

/**
 * Regras sanitárias por classificação (resumo — validar com o RT e assessoria regulatória):
 *  - RDC 44/2009: venda remota só por farmácia aberta ao público; PROIBIDA para controlados (Portaria 344/98).
 *  - RDC 471/2021: antimicrobianos → receita retida, validade de 10 dias, escrituração no SNGPC.
 *  - Tarja vermelha: exige receita (sem retenção).
 *  - MIP (RDC 98/2016): venda livre.
 */
export const REGRAS: Record<Classificacao, { rotulo: string; curto: string; medicamento: boolean; vendaRemota: boolean; exigeReceita: boolean; retencao: boolean; escrituracao: boolean; cor: string }> = {
  NAO_MEDICAMENTO: { rotulo: 'Não medicamento', curto: 'Livre', medicamento: false, vendaRemota: true, exigeReceita: false, retencao: false, escrituracao: false, cor: 'slate' },
  MIP: { rotulo: 'Medicamento isento de prescrição (MIP)', curto: 'MIP', medicamento: true, vendaRemota: true, exigeReceita: false, retencao: false, escrituracao: false, cor: 'emerald' },
  TARJA_VERMELHA: { rotulo: 'Venda sob prescrição médica', curto: 'Tarja vermelha', medicamento: true, vendaRemota: true, exigeReceita: true, retencao: false, escrituracao: false, cor: 'red' },
  ANTIMICROBIANO: { rotulo: 'Antimicrobiano — receita retida (RDC 471/2021)', curto: 'Antibiótico', medicamento: true, vendaRemota: true, exigeReceita: true, retencao: true, escrituracao: true, cor: 'orange' },
  CONTROLADO: { rotulo: 'Controle especial (Portaria 344/98) — somente na loja', curto: 'Controlado', medicamento: true, vendaRemota: false, exigeReceita: true, retencao: true, escrituracao: true, cor: 'zinc' },
};

export const TIPO_MEDICAMENTO: Record<TipoMedicamento, string> = {
  NAO_SE_APLICA: '',
  REFERENCIA: 'Referência',
  GENERICO: 'Genérico',
  SIMILAR: 'Similar',
};

export const STATUS_PEDIDO: Record<StatusPedido, { rotulo: string; cor: string; cliente: string }> = {
  AGUARDANDO_RECEITA: { rotulo: 'Aguardando receita', cor: 'amber', cliente: 'Envie a receita para o farmacêutico validar.' },
  AGUARDANDO_PAGAMENTO: { rotulo: 'Aguardando pagamento', cor: 'amber', cliente: 'Conclua o pagamento para liberarmos seu pedido.' },
  PAGO: { rotulo: 'Pagamento aprovado', cor: 'sky', cliente: 'Pagamento confirmado. Já vamos separar seus itens.' },
  EM_SEPARACAO: { rotulo: 'Em separação', cor: 'indigo', cliente: 'Estamos separando seus produtos.' },
  PRONTO_PARA_RETIRADA: { rotulo: 'Pronto para retirada', cor: 'teal', cliente: 'Seu pedido está pronto na loja. Leve um documento com foto.' },
  SAIU_PARA_ENTREGA: { rotulo: 'Saiu para entrega', cor: 'violet', cliente: 'O entregador está a caminho.' },
  ENTREGUE: { rotulo: 'Entregue', cor: 'emerald', cliente: 'Pedido entregue. Obrigado pela compra!' },
  CANCELADO: { rotulo: 'Cancelado', cor: 'rose', cliente: 'Pedido cancelado.' },
};

export const MODALIDADE: Record<Modalidade, string> = {
  ENTREGA_PADRAO: 'Entrega padrão',
  ENTREGA_EXPRESSA: 'Entrega expressa',
  RETIRADA: 'Retirar na loja',
  BALCAO: 'Venda no balcão',
};

export const METODO_PAGAMENTO: Record<MetodoPagamento, string> = {
  CARTAO_CREDITO: 'Cartão de crédito',
  CARTAO_DEBITO: 'Cartão de débito',
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
};

export const PAPEL: Record<Papel, string> = {
  CLIENTE: 'Cliente',
  ATENDENTE: 'Atendente',
  FARMACEUTICO: 'Farmacêutico(a)',
  GERENTE: 'Gerente',
  ADMIN: 'Administrador',
};

export const EQUIPE: Papel[] = ['ATENDENTE', 'FARMACEUTICO', 'GERENTE', 'ADMIN'];

/** Permissões do backoffice por papel. */
export const PERMISSOES = {
  painel: ['ATENDENTE', 'FARMACEUTICO', 'GERENTE', 'ADMIN'],
  pedidos: ['ATENDENTE', 'FARMACEUTICO', 'GERENTE', 'ADMIN'],
  receitas: ['FARMACEUTICO'],
  atendimento: ['FARMACEUTICO', 'GERENTE', 'ADMIN'],
  verReceitas: ['FARMACEUTICO', 'GERENTE', 'ADMIN'],
  pdv: ['ATENDENTE', 'FARMACEUTICO', 'GERENTE', 'ADMIN'],
  estoque: ['FARMACEUTICO', 'GERENTE', 'ADMIN'],
  produtos: ['GERENTE', 'ADMIN'],
  compras: ['GERENTE', 'ADMIN'],
  marketing: ['GERENTE', 'ADMIN'],
  clientes: ['ATENDENTE', 'FARMACEUTICO', 'GERENTE', 'ADMIN'],
  avaliacoes: ['GERENTE', 'ADMIN'],
  relatorios: ['GERENTE', 'ADMIN'],
  anvisa: ['FARMACEUTICO', 'GERENTE', 'ADMIN'],
  equipe: ['ADMIN'],
  lojas: ['ADMIN'],
  auditoria: ['ADMIN'],
} as const satisfies Record<string, Papel[]>;

export type Permissao = keyof typeof PERMISSOES;
export const pode = (papel: Papel | undefined | null, p: Permissao) => !!papel && (PERMISSOES[p] as readonly Papel[]).includes(papel);

export const NIVEIS_FIDELIDADE = [
  { nome: 'Bronze', minimo: 0, multiplicador: 1, cor: '#b45309' },
  { nome: 'Prata', minimo: 50000, multiplicador: 1.5, cor: '#64748b' },
  { nome: 'Ouro', minimo: 150000, multiplicador: 2, cor: '#ca8a04' },
] as const;

export function nivelFidelidade(gasto12mCentavos: number) {
  let n: (typeof NIVEIS_FIDELIDADE)[number] = NIVEIS_FIDELIDADE[0];
  for (const x of NIVEIS_FIDELIDADE) if (gasto12mCentavos >= x.minimo) n = x;
  const idx = NIVEIS_FIDELIDADE.indexOf(n);
  const proximo = NIVEIS_FIDELIDADE[idx + 1] ?? null;
  return { ...n, proximo, faltam: proximo ? proximo.minimo - gasto12mCentavos : 0 };
}

export const COR_COMPRA = { RASCUNHO: 'slate', ENVIADO: 'sky', RECEBIDO: 'emerald', CANCELADO: 'rose' } as const;
