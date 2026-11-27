import { FormAcao } from '@/components/admin/Acoes';
import { salvarConvenioAcao } from '@/app/acoes/gestao';

type C = { id: string; nome: string; cnpj: string | null; contato: string | null; telefone: string | null; email: string | null; descontoBp: number; diaFechamento: number; prazoPagamentoDias: number; limitePadrao: number };
const r = (c?: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

export function FormConvenio({ c }: { c?: C }) {
  return (
    <FormAcao acao={salvarConvenioAcao} rotulo={c ? 'Salvar' : 'Cadastrar convênio'} className="grid gap-3 md:grid-cols-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <label className="md:col-span-2"><span className="rotulo">Empresa</span><input name="nome" required defaultValue={c?.nome} className="campo" /></label>
      <label><span className="rotulo">CNPJ</span><input name="cnpj" defaultValue={c?.cnpj ?? ''} className="campo" /></label>
      <label><span className="rotulo">Contato (RH)</span><input name="contato" defaultValue={c?.contato ?? ''} className="campo" /></label>
      <label><span className="rotulo">Telefone</span><input name="telefone" defaultValue={c?.telefone ?? ''} className="campo" /></label>
      <label><span className="rotulo">E-mail</span><input name="email" type="email" defaultValue={c?.email ?? ''} className="campo" /></label>
      <label><span className="rotulo">Desconto aos conveniados (%)</span><input name="desconto" defaultValue={c ? String(c.descontoBp / 100).replace('.', ',') : '5'} className="campo" /></label>
      <label><span className="rotulo">Limite padrão por pessoa (R$)</span><input name="limitePadrao" defaultValue={r(c?.limitePadrao) || '300,00'} className="campo" /></label>
      <label><span className="rotulo">Dia do fechamento</span><input name="diaFechamento" type="number" min={1} max={28} defaultValue={c?.diaFechamento ?? 25} className="campo" /></label>
      <label><span className="rotulo">Prazo para a empresa pagar (dias)</span><input name="prazoPagamentoDias" type="number" min={0} max={60} defaultValue={c?.prazoPagamentoDias ?? 10} className="campo" /></label>
    </FormAcao>
  );
}
