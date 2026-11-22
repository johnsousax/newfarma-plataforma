import { FormAcao } from '@/components/admin/Acoes';
import { salvarFuncionarioAcao } from '@/app/acoes/admin';
import { isoDia } from '@/lib/periodo';

type F = { id: string; nome: string; cargo: string; setor: string | null; tipoContrato: string; telefone: string | null; email: string | null; rg: string | null; endereco: string | null; jornada: string | null; escala: string | null; crf: string | null; observacoes: string | null; admissao: Date; nascimento: Date | null; salario: number; valeTransporte: number; valeRefeicao: number; outrosBeneficios: number; usuarioId: string | null; cpfCifrado: string | null; pixCifrado: string | null };
const reais = (c?: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

export function FormFuncionario({ f, usuarios }: { f?: F; usuarios: { id: string; nome: string; email: string }[] }) {
  return (
    <FormAcao acao={salvarFuncionarioAcao} rotulo={f ? 'Salvar alterações' : 'Cadastrar funcionário'} className="space-y-5">
      {f && <input type="hidden" name="id" value={f.id} />}
      <fieldset className="grid gap-3 md:grid-cols-4">
        <legend className="mb-2 font-semibold">Dados pessoais</legend>
        <label className="md:col-span-2"><span className="rotulo">Nome completo</span><input name="nome" required defaultValue={f?.nome} className="campo" /></label>
        <label><span className="rotulo">CPF {f?.cpfCifrado && '(guardado; preencha só para trocar)'}</span><input name="cpf" inputMode="numeric" className="campo" /></label>
        <label><span className="rotulo">RG</span><input name="rg" defaultValue={f?.rg ?? ''} className="campo" /></label>
        <label><span className="rotulo">Nascimento</span><input name="nascimento" type="date" defaultValue={f?.nascimento ? isoDia(f.nascimento) : ''} className="campo" /></label>
        <label><span className="rotulo">Telefone / WhatsApp</span><input name="telefone" defaultValue={f?.telefone ?? ''} className="campo" /></label>
        <label><span className="rotulo">E-mail</span><input name="email" type="email" defaultValue={f?.email ?? ''} className="campo" /></label>
        <label><span className="rotulo">Chave Pix {f?.pixCifrado && '(guardada)'}</span><input name="pix" className="campo" /></label>
        <label className="md:col-span-4"><span className="rotulo">Endereço</span><input name="endereco" defaultValue={f?.endereco ?? ''} className="campo" /></label>
      </fieldset>
      <fieldset className="grid gap-3 md:grid-cols-4">
        <legend className="mb-2 font-semibold">Contrato</legend>
        <label><span className="rotulo">Cargo</span><input name="cargo" required list="cargos" defaultValue={f?.cargo} className="campo" /><datalist id="cargos">{['Farmacêutico(a)', 'Balconista', 'Caixa', 'Gerente', 'Estoquista', 'Entregador', 'Auxiliar de limpeza'].map((c) => <option key={c} value={c} />)}</datalist></label>
        <label><span className="rotulo">Setor</span><input name="setor" defaultValue={f?.setor ?? ''} className="campo" /></label>
        <label><span className="rotulo">Tipo</span><select name="tipoContrato" defaultValue={f?.tipoContrato ?? 'CLT'} className="campo"><option value="CLT">CLT</option><option value="PJ">PJ</option><option value="ESTAGIO">Estágio</option><option value="TEMPORARIO">Temporário</option><option value="AUTONOMO">Autônomo</option></select></label>
        <label><span className="rotulo">Admissão</span><input name="admissao" type="date" required defaultValue={f ? isoDia(f.admissao) : isoDia(new Date())} className="campo" /></label>
        <label><span className="rotulo">Jornada</span><input name="jornada" placeholder="44h semanais" defaultValue={f?.jornada ?? ''} className="campo" /></label>
        <label className="md:col-span-2"><span className="rotulo">Escala / horário</span><input name="escala" placeholder="Seg a sex 8h–17h, sáb 8h–12h" defaultValue={f?.escala ?? ''} className="campo" /></label>
        <label><span className="rotulo">CRF (se farmacêutico)</span><input name="crf" defaultValue={f?.crf ?? ''} className="campo" /></label>
      </fieldset>
      <fieldset className="grid gap-3 md:grid-cols-4">
        <legend className="mb-2 font-semibold">Remuneração (mensal)</legend>
        <label><span className="rotulo">Salário (R$)</span><input name="salario" required defaultValue={reais(f?.salario)} className="campo" /></label>
        <label><span className="rotulo">Vale-transporte (R$)</span><input name="valeTransporte" defaultValue={reais(f?.valeTransporte)} className="campo" /></label>
        <label><span className="rotulo">Vale-refeição (R$)</span><input name="valeRefeicao" defaultValue={reais(f?.valeRefeicao)} className="campo" /></label>
        <label><span className="rotulo">Outros benefícios (R$)</span><input name="outrosBeneficios" defaultValue={reais(f?.outrosBeneficios)} className="campo" /></label>
      </fieldset>
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-2 font-semibold">Acesso e observações</legend>
        <label><span className="rotulo">Acesso ao sistema (login da equipe)</span><select name="usuarioId" defaultValue={f?.usuarioId ?? ''} className="campo"><option value="">Sem acesso</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome} · {u.email}</option>)}</select></label>
        <label><span className="rotulo">Observações</span><input name="observacoes" defaultValue={f?.observacoes ?? ''} className="campo" /></label>
      </fieldset>
    </FormAcao>
  );
}
