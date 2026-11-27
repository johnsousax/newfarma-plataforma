import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { Badge, Esqueleto, TituloPagina, Vazio, Aviso } from '@/components/ui';
import { FormAcao } from '@/components/admin/Acoes';
import { criarCotacaoAcao } from '@/app/acoes/gestao';
import { dataHora } from '@/lib/formato';

export const metadata = { title: 'Cotações' };
const STATUS = { ABERTA: ['Aberta', 'amber'], FECHADA: ['Pedidos gerados', 'emerald'], CANCELADA: ['Cancelada', 'slate'] } as const;

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('compras');
  const loja = lojaDoUsuario(u);
  const lista = await db.cotacao.findMany({ where: loja ? { lojaId: loja } : {}, orderBy: { criadoEm: 'desc' }, take: 50, include: { _count: { select: { itens: true } } } });
  return (
    <div className="space-y-5">
      <Aviso tipo="info">Monte a lista (automática pelos itens abaixo do estoque mínimo, ou do zero), envie aos distribuidores, lance os preços que cada um passar e o sistema escolhe o melhor preço de cada item. Ao fechar, gera um pedido de compra por fornecedor.</Aviso>
      <FormAcao acao={criarCotacaoAcao} rotulo="Nova cotação" className="cartao grid gap-3 p-5 md:grid-cols-3">
        <label className="md:col-span-2"><span className="rotulo">Descrição</span><input name="descricao" required defaultValue={`Reposição ${new Date().toLocaleDateString('pt-BR')}`} className="campo" /></label>
        <label><span className="rotulo">Itens</span><select name="origem" className="campo"><option value="sugestao">Itens abaixo do mínimo</option><option value="vazia">Começar vazia</option></select></label>
      </FormAcao>
      {!lista.length ? <Vazio icone="cotacoes" titulo="Nenhuma cotação ainda" /> : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Nº</th><th>Descrição</th><th>Itens</th><th>Criada</th><th>Situação</th></tr></thead>
            <tbody>{lista.map((c) => (
              <tr key={c.id}><td className="font-bold">{c.numero}</td><td><Link href={`/admin/cotacoes/${c.id}`} className="font-semibold hover:underline">{c.descricao}</Link></td><td>{c._count.itens}</td><td>{dataHora(c.criadoEm)}</td><td><Badge cor={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Cotacoes() {
  return <><TituloPagina titulo="Cotações de compra" subtitulo="Compare preços entre distribuidores antes de comprar" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
