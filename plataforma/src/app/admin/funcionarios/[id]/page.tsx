import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { decifrar } from '@/server/cripto';
import { situacaoFerias, TIPOS_OCORRENCIA, ENCARGOS_ESTIMADOS } from '@/server/funcionarios';
import { Badge, Esqueleto } from '@/components/ui';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { FormFuncionario } from '@/components/admin/FormFuncionario';
import { salvarOcorrenciaAcao, excluirOcorrenciaAcao, desligarFuncionarioAcao, reativarFuncionarioAcao } from '@/app/acoes/admin';
import { brl, data } from '@/lib/formato';
import { isoDia } from '@/lib/periodo';
import { EQUIPE } from '@/lib/dominio';
import { Icone } from '@/components/icones';

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await paginaAdmin('funcionarios');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [f, usuarios] = await Promise.all([
    db.funcionario.findUnique({ where: { id }, include: { ocorrencias: { orderBy: { inicio: 'desc' } }, lancamentos: { where: { origem: 'folha' }, orderBy: { competencia: 'desc' }, take: 12, select: { id: true, descricao: true, valor: true, status: true, vencimento: true } } } }),
    db.usuario.findMany({ where: { papel: { in: EQUIPE } }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, email: true } }),
  ]);
  if (!f) notFound();
  const fer = situacaoFerias(f.admissao, f.ocorrencias.filter((o) => o.tipo === 'FERIAS'));
  const cpf = decifrar(f.cpfCifrado);
  const custo = f.salario + f.valeTransporte + f.valeRefeicao + f.outrosBeneficios + (f.tipoContrato === 'CLT' ? Math.round(f.salario * ENCARGOS_ESTIMADOS) : 0);
  const anos = Math.floor(fer.mesesDeCasa / 12);
  return (
    <div className="space-y-6">
      <Link href="/admin/funcionarios" className="text-sm text-slate-500 hover:underline">← Funcionários</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{f.nome} {!f.ativo && <Badge cor="slate" className="align-middle">Desligado</Badge>}</h1>
          <p className="text-sm text-slate-500">{f.cargo} · {f.tipoContrato} · desde {data(f.admissao)} ({anos ? `${anos} ano(s) e ` : ''}{fer.mesesDeCasa % 12} mês(es)){cpf && ` · CPF ${cpf.replace(/^(\d{3})\d{6}(\d{2})$/, '$1.***.***-$2')}`}</p>
        </div>
        {f.ativo
          ? <BotaoAcao variante="perigo" pedirTexto="Data do desligamento (AAAA-MM-DD) ou deixe em branco para hoje" acao={desligarFuncionarioAcao.bind(null, f.id)}>Desligar</BotaoAcao>
          : <BotaoAcao acao={reativarFuncionarioAcao.bind(null, f.id)}>Reativar</BotaoAcao>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="cartao p-4"><p className="text-xs font-semibold uppercase text-slate-500">Salário</p><p className="text-2xl font-bold">{brl(f.salario)}</p></div>
        <div className="cartao p-4"><p className="text-xs font-semibold uppercase text-slate-500">Custo mensal estimado</p><p className="text-2xl font-bold">{brl(custo)}</p></div>
        <div className="cartao p-4"><p className="text-xs font-semibold uppercase text-slate-500">Férias disponíveis</p><p className={`text-2xl font-bold ${fer.vencendo ? 'text-rose-700' : ''}`}>{fer.saldo} dias</p><p className="text-xs text-slate-500">{fer.limite ? `Tirar até ${data(fer.limite)}` : `Próximo período em ${data(fer.proximaAquisicao)}`}</p></div>
        <div className="cartao p-4"><p className="text-xs font-semibold uppercase text-slate-500">Escala</p><p className="text-sm font-semibold">{f.escala ?? '—'}</p><p className="text-xs text-slate-500">{f.jornada}</p></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="cartao p-5"><h2 className="mb-4 text-lg font-bold">Cadastro</h2><FormFuncionario f={f} usuarios={usuarios} /></section>
        <aside className="space-y-4">
          <section className="cartao space-y-3 p-5">
            <h2 className="font-bold">Ocorrências e férias</h2>
            <FormAcao acao={salvarOcorrenciaAcao.bind(null, f.id)} rotulo="Registrar" className="grid gap-2 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="rotulo">Tipo</span><select name="tipo" className="campo">{Object.entries(TIPOS_OCORRENCIA).map(([k, t]) => <option key={k} value={k}>{t.rotulo}</option>)}</select></label>
              <label><span className="rotulo">Início</span><input name="inicio" type="date" required defaultValue={isoDia(new Date())} className="campo" /></label>
              <label><span className="rotulo">Fim (se período)</span><input name="fim" type="date" className="campo" /></label>
              <label><span className="rotulo">Valor (R$, se houver)</span><input name="valor" className="campo" /></label>
              <label><span className="rotulo">Descrição</span><input name="descricao" className="campo" /></label>
            </FormAcao>
            <ul className="divide-y divide-slate-100 text-sm">
              {f.ocorrencias.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-2 py-2">
                  <span><strong>{TIPOS_OCORRENCIA[o.tipo]?.rotulo ?? o.tipo}</strong> · {data(o.inicio)}{o.fim && ` a ${data(o.fim)}`}{o.valor ? ` · ${TIPOS_OCORRENCIA[o.tipo]?.sinal === -1 ? '−' : '+'}${brl(o.valor)}` : ''}{o.descricao && <span className="block text-xs text-slate-500">{o.descricao}</span>}</span>
                  <BotaoAcao variante="fantasma" confirmar="Excluir este registro?" acao={excluirOcorrenciaAcao.bind(null, o.id)}><Icone nome="excluir" /></BotaoAcao>
                </li>
              ))}
              {!f.ocorrencias.length && <li className="py-3 text-slate-500">Nenhum registro.</li>}
            </ul>
            <p className="text-xs text-slate-500">Horas extras e bônus somam; faltas, descontos e vales descontam na folha gerada pelo Financeiro.</p>
          </section>
          <section className="cartao space-y-2 p-5">
            <h2 className="font-bold">Folhas lançadas</h2>
            {f.lancamentos.map((l) => <p key={l.id} className="flex justify-between text-sm"><span>{l.descricao.split(' · ')[0]}</span><span>{brl(l.valor)} <Badge cor={l.status === 'PAGO' ? 'emerald' : 'amber'}>{l.status === 'PAGO' ? 'Pago' : 'A pagar'}</Badge></span></p>)}
            {!f.lancamentos.length && <p className="text-sm text-slate-500">Gere a folha em Financeiro › Contas, categorias e rotinas.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function Funcionario(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo params={props.params} /></Suspense>;
}
