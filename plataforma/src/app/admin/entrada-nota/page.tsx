import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { Badge, Esqueleto, TituloPagina, Vazio, Aviso } from '@/components/ui';
import { BiparNota } from '@/components/admin/BiparNota';
import { brl, data, dataHora } from '@/lib/formato';
import type { ItemNotaEntrada } from '@/server/compras/entrada-nota';

export const metadata = { title: 'Entrada de nota' };
const STATUS = { PENDENTE: ['Conferir', 'amber'], LANCADA: ['No estoque', 'emerald'], DESCARTADA: ['Descartada', 'slate'] } as const;

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('notasEntrada');
  const loja = lojaDoUsuario(u);
  const notas = await db.notaEntrada.findMany({ where: loja ? { lojaId: loja } : {}, orderBy: { criadoEm: 'desc' }, take: 60, select: { id: true, numero: true, serie: true, emitenteNome: true, emitidaEm: true, valorTotal: true, status: true, itens: true, criadoEm: true, origem: true } });
  return (
    <div className="space-y-6">
      <BiparNota />
      <Aviso tipo="info">Depois de importar, confira os itens: o sistema já liga cada produto pelo código de barras ou pelo registro da ANVISA e lê lote e validade da própria nota. Da segunda compra em diante ele lembra os códigos de cada fornecedor. Ao lançar, entra no estoque, atualiza o custo e cria as contas a pagar das duplicatas.</Aviso>
      {!notas.length ? <Vazio icone="notas" titulo="Nenhuma nota importada ainda" /> : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Nota</th><th>Fornecedor</th><th>Emissão</th><th className="text-right">Valor</th><th>Itens</th><th>Importada</th><th>Situação</th></tr></thead>
            <tbody>{notas.map((n) => {
              const itens = n.itens as ItemNotaEntrada[];
              const pend = itens.filter((i) => !i.ignorar && !i.produtoId).length;
              return (
                <tr key={n.id}>
                  <td><Link href={`/admin/entrada-nota/${n.id}`} className="font-semibold hover:underline">NF {n.numero}</Link><span className="block text-xs text-slate-500">série {n.serie}{n.origem === 'sefaz' ? ' · baixada da SEFAZ' : ''}</span></td>
                  <td>{n.emitenteNome}</td><td>{data(n.emitidaEm)}</td><td className="text-right font-semibold">{brl(n.valorTotal)}</td>
                  <td>{itens.length}{n.status === 'PENDENTE' && pend > 0 && <span className="block text-xs text-amber-700">{pend} sem produto</span>}</td>
                  <td>{dataHora(n.criadoEm)}</td>
                  <td><Badge cor={STATUS[n.status][1]}>{STATUS[n.status][0]}</Badge></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function EntradaNota() {
  return <><TituloPagina titulo="Entrada de nota fiscal" subtitulo="Bipe a nota de compra ou envie o XML: estoque, lotes, custo e contas a pagar em um passo" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
