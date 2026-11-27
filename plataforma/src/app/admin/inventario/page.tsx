import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { Badge, Esqueleto, TituloPagina, Vazio, Aviso } from '@/components/ui';
import { FormAcao } from '@/components/admin/Acoes';
import { abrirInventarioAcao } from '@/app/acoes/gestao';
import { dataHora } from '@/lib/formato';

export const metadata = { title: 'Inventário' };
const STATUS = { ABERTO: ['Em contagem', 'amber'], FECHADO: ['Fechado', 'emerald'], CANCELADO: ['Cancelado', 'slate'] } as const;

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('inventario');
  const loja = lojaDoUsuario(u);
  const [lista, categorias, lojas] = await Promise.all([
    db.inventario.findMany({ where: loja ? { lojaId: loja } : {}, orderBy: { abertoEm: 'desc' }, take: 50, include: { _count: { select: { itens: true } } } }),
    db.categoria.findMany({ where: { paiId: null }, orderBy: { ordem: 'asc' }, select: { id: true, nome: true } }),
    db.loja.findMany({ where: { ativa: true }, select: { id: true, nome: true } }),
  ]);
  const temAberto = lista.some((i) => i.status === 'ABERTO');
  return (
    <div className="space-y-5">
      <Aviso tipo="info">O inventário fotografa o estoque de cada lote. A equipe conta as prateleiras (pode bipar o código de barras), lança as quantidades e, ao fechar, o sistema ajusta sobras e faltas com registro na auditoria. Vendas durante a contagem continuam valendo.</Aviso>
      {!temAberto && (
        <FormAcao acao={abrirInventarioAcao} rotulo="Abrir inventário" className="cartao grid gap-3 p-5 md:grid-cols-3">
          <label><span className="rotulo">Descrição</span><input name="descricao" required defaultValue={`Balanço ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`} className="campo" /></label>
          <label><span className="rotulo">Departamento</span><select name="categoriaId" className="campo"><option value="">Loja inteira</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          {!loja && lojas.length > 1 && <label><span className="rotulo">Loja</span><select name="lojaId" className="campo">{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>}
        </FormAcao>
      )}
      {!lista.length ? <Vazio icone="inventario" titulo="Nenhum inventário ainda" /> : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Nº</th><th>Descrição</th><th>Lotes</th><th>Aberto</th><th>Fechado</th><th>Situação</th></tr></thead>
            <tbody>{lista.map((i) => (
              <tr key={i.id}>
                <td className="font-bold">{i.numero}</td>
                <td><Link href={`/admin/inventario/${i.id}`} className="font-semibold hover:underline">{i.descricao}</Link></td>
                <td>{i._count.itens}</td><td>{dataHora(i.abertoEm)}</td><td>{dataHora(i.fechadoEm)}</td>
                <td><Badge cor={STATUS[i.status][1]}>{STATUS[i.status][0]}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Inventarios() {
  return <><TituloPagina titulo="Inventário (balanço)" subtitulo="Contagem física do estoque com ajuste automático das diferenças" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
