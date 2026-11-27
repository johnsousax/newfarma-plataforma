import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { configuracoes } from '@/server/configuracoes';
import { AutoImprimir } from '@/components/impressao/Impressao';
import { FARMACIA } from '@/lib/farmacia';
import { brl, data, dataHora } from '@/lib/formato';
import type { ItemOrcamento } from '@/server/admin/gestao';

export const metadata = { title: 'Imprimir orçamento', robots: { index: false } };

async function Orcamento({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await paginaAdmin('orcamentos');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const o = await db.orcamento.findUnique({ where: { id } });
  if (!o) notFound();
  const [loja, vendedor, { contato }] = await Promise.all([db.loja.findUnique({ where: { id: o.lojaId } }), db.usuario.findUnique({ where: { id: o.vendedorId }, select: { nome: true } }), configuracoes()]);
  const itens = o.itens as ItemOrcamento[];
  return (
    <main className="mx-auto max-w-2xl bg-white p-8 text-slate-900">
      <AutoImprimir ativo={false} />
      <header className="border-b pb-4">
        <h1 className="text-2xl font-extrabold">{FARMACIA.nome}</h1>
        <p className="text-sm text-slate-600">{loja ? `${loja.logradouro}, ${loja.numero} - ${loja.bairro}, ${loja.cidade}/${loja.uf}` : ''} · {contato.telefone || contato.whatsapp}</p>
      </header>
      <h2 className="mt-5 text-xl font-bold">{o.tipo === 'ORCAMENTO' ? 'Orçamento' : 'Pré-venda'} nº {o.numero}</h2>
      <p className="text-sm text-slate-600">Emitido em {dataHora(o.criadoEm)} por {vendedor?.nome ?? '—'} · válido até {data(o.validoAte)}{o.clienteNome ? ` · Cliente: ${o.clienteNome}` : ''}</p>
      <table className="mt-4 w-full text-sm">
        <thead><tr className="border-b text-left"><th className="py-2">Produto</th><th className="text-right">Qtd</th><th className="text-right">Unit.</th><th className="text-right">Total</th></tr></thead>
        <tbody>{itens.map((i) => <tr key={i.produtoId} className="border-b border-slate-100"><td className="py-2">{i.nome}{i.desconto ? <span className="block text-xs text-emerald-700">desconto {brl(i.desconto)}</span> : null}</td><td className="text-right">{i.quantidade}</td><td className="text-right">{brl(i.preco)}</td><td className="text-right font-semibold">{brl(i.total)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={3} className="pt-3 text-right font-bold">Total</td><td className="pt-3 text-right text-xl font-extrabold">{brl(o.total)}</td></tr></tfoot>
      </table>
      {o.observacao && <p className="mt-4 text-sm">{o.observacao}</p>}
      <p className="mt-6 text-xs text-slate-500">Preços sujeitos a alteração após a validade e à disponibilidade em estoque. Medicamentos sob prescrição só com receita. Para comprar, informe o nº {o.numero} no caixa.</p>
    </main>
  );
}

export default function ImprimirOrcamento(props: { params: Promise<{ id: string }> }) {
  return <Suspense><Orcamento params={props.params} /></Suspense>;
}
