import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { alertasRh, ENCARGOS_ESTIMADOS } from '@/server/funcionarios';
import { Badge, Esqueleto, TituloPagina, Vazio, cx } from '@/components/ui';
import { Icone } from '@/components/icones';
import { FormFuncionario } from '@/components/admin/FormFuncionario';
import { brl, data } from '@/lib/formato';
import { EQUIPE } from '@/lib/dominio';

export const metadata = { title: 'Funcionários' };

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  await paginaAdmin('funcionarios');
  const sp = await searchParams;
  const inativos = sp.inativos === '1';
  const [lista, alertas, usuarios] = await Promise.all([
    db.funcionario.findMany({ where: { ativo: !inativos }, orderBy: { nome: 'asc' } }),
    alertasRh(),
    db.usuario.findMany({ where: { papel: { in: EQUIPE } }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, email: true } }),
  ]);
  const ativos = lista.filter((f) => f.ativo);
  const folha = ativos.reduce((s, f) => s + f.salario, 0);
  const beneficios = ativos.reduce((s, f) => s + f.valeTransporte + f.valeRefeicao + f.outrosBeneficios, 0);
  const encargos = Math.round(ativos.filter((f) => f.tipoContrato === 'CLT').reduce((s, f) => s + f.salario, 0) * ENCARGOS_ESTIMADOS);
  return (
    <div className="space-y-5">
      {!inativos && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Funcionários ativos', String(ativos.length)], ['Folha (salários)', brl(folha)], ['Benefícios', brl(beneficios)], ['Custo total estimado/mês', brl(folha + beneficios + encargos)]].map(([r, v]) => (
            <div key={r} className="cartao p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>
          ))}
        </div>
      )}
      {alertas.length > 0 && !inativos && (
        <section className="cartao p-5">
          <h2 className="mb-2 font-bold">Atenção</h2>
          <ul className="space-y-1 text-sm">{alertas.map((a, i) => <li key={i} className="flex items-center gap-2"><Badge cor={a.tom}>{a.nome.split(' ')[0]}</Badge><Link href={`/admin/funcionarios/${a.funcionarioId}`} className="hover:underline">{a.texto}</Link></li>)}</ul>
        </section>
      )}
      <div className="flex gap-2 text-sm">
        <Link href="/admin/funcionarios" className={cx('rounded-full px-4 py-1.5', !inativos ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}>Ativos</Link>
        <Link href="/admin/funcionarios?inativos=1" className={cx('rounded-full px-4 py-1.5', inativos ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}>Desligados</Link>
      </div>
      {!lista.length ? <Vazio icone="funcionarios" titulo={inativos ? 'Nenhum desligado' : 'Nenhum funcionário cadastrado'} /> : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Nome</th><th>Cargo</th><th>Contrato</th><th>Admissão</th><th>Escala</th><th className="text-right">Salário</th></tr></thead>
            <tbody>{lista.map((f) => (
              <tr key={f.id}>
                <td><Link href={`/admin/funcionarios/${f.id}`} className="link font-medium">{f.nome}</Link>{f.usuarioId && <span className="ml-2 text-xs text-slate-500">com acesso</span>}</td>
                <td>{f.cargo}{f.setor && <span className="block text-xs text-slate-500">{f.setor}</span>}</td>
                <td>{f.tipoContrato}</td><td>{data(f.admissao)}{f.demissao && <span className="block text-xs text-rose-700">saiu {data(f.demissao)}</span>}</td>
                <td className="text-sm text-slate-600">{f.escala ?? '—'}</td>
                <td className="text-right font-semibold">{brl(f.salario)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {!inativos && <details className="cartao p-5"><summary className="flex cursor-pointer items-center gap-2 font-semibold text-marca-700"><Icone nome="mais" />Novo funcionário</summary><div className="mt-4"><FormFuncionario usuarios={usuarios} /></div></details>}
      <p className="text-xs text-slate-500">Custo estimado inclui ~{Math.round(ENCARGOS_ESTIMADOS * 100)}% de encargos e provisões (FGTS, 13º e férias) sobre salários CLT. Confirme os valores com a contabilidade.</p>
    </div>
  );
}

export default function Funcionarios(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><TituloPagina titulo="Funcionários" subtitulo="Cadastro, salários, benefícios, férias e ocorrências" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
