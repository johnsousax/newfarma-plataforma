import { FormAcao } from '@/components/admin/Acoes';
import { salvarContaCrediarioAcao } from '@/app/acoes/gestao';

type Conta = { id: string; nome: string; telefone: string | null; limite: number; diaVencimento: number; convenioId: string | null; matricula: string | null; observacao: string | null; cpfFinal: string | null };
const r = (c?: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

export function FormContaCrediario({ conta, convenios }: { conta?: Conta; convenios: { id: string; nome: string; limitePadrao: number }[] }) {
  return (
    <FormAcao acao={salvarContaCrediarioAcao} rotulo={conta ? 'Salvar alterações' : 'Abrir conta'} className="grid gap-3 md:grid-cols-3">
      {conta && <input type="hidden" name="id" value={conta.id} />}
      <label className="md:col-span-2"><span className="rotulo">Nome do cliente</span><input name="nome" required defaultValue={conta?.nome} className="campo" /></label>
      <label><span className="rotulo">CPF {conta?.cpfFinal ? `(final ${conta.cpfFinal}; preencha só para trocar)` : ''}</span><input name="cpf" inputMode="numeric" className="campo" /></label>
      <label><span className="rotulo">Celular / WhatsApp</span><input name="telefone" defaultValue={conta?.telefone ?? ''} placeholder="(98) 99999-9999" className="campo" /></label>
      <label><span className="rotulo">Limite de crédito (R$)</span><input name="limite" required defaultValue={r(conta?.limite) || '300,00'} className="campo" /></label>
      <label><span className="rotulo">Dia do vencimento</span><input name="diaVencimento" type="number" min={1} max={28} defaultValue={conta?.diaVencimento ?? 10} className="campo" /></label>
      <label><span className="rotulo">Convênio (empresa)</span>
        <select name="convenioId" defaultValue={conta?.convenioId ?? ''} className="campo"><option value="">Nenhum — crediário próprio</option>{convenios.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
      </label>
      <label><span className="rotulo">Matrícula no convênio</span><input name="matricula" defaultValue={conta?.matricula ?? ''} className="campo" /></label>
      <label className="md:col-span-3"><span className="rotulo">Observação</span><input name="observacao" defaultValue={conta?.observacao ?? ''} className="campo" /></label>
    </FormAcao>
  );
}
