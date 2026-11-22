import type { StatusNota } from '@/generated/prisma/enums';

export const COR_NOTA: Record<StatusNota, { rotulo: string; cor: 'amber' | 'sky' | 'emerald' | 'red' | 'slate' }> = {
  PENDENTE: { rotulo: 'Pronta p/ transmitir', cor: 'amber' }, ENVIADA: { rotulo: 'Enviada', cor: 'sky' }, AUTORIZADA: { rotulo: 'Autorizada', cor: 'emerald' },
  REJEITADA: { rotulo: 'Rejeitada', cor: 'red' }, CANCELADA: { rotulo: 'Cancelada', cor: 'slate' },
};
