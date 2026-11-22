import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Badge, Esqueleto } from '@/components/ui';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { enviarCompraAcao, cancelarCompraAcao, receberCompraAcao } from '@/app/acoes/admin';
import { brl, dataHora, cep } from '@/lib/formato';
import { COR_COMPRA } from '@/lib/dominio';
import { Icone } from '@/components/icones';

async function Conteudo({ params }: { params: PageProps<'/admin/compras/[id]'>['params'] }) {
  await connection();
  await paginaAdmin('compras');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await db.pedidoCompra.findUnique({ where: { id }, include: { fornecedor: true, loja: true, itens: { include: { produto: { select: { nome: true, sku: true, ean: true } } } } } });
  if (!c) notFound();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/compras" className="text-sm text-slate-500 hover:underline">← Compras</Link>
          <h1 className="text-2xl font-bold">Pedido de compra #{c.numero} <Badge cor={COR_COMPRA[c.status]} className="align-middle">{c.status}</Badge></h1>
          <p className="text-sm text-slate-500">{c.fornecedor.razaoSocial} · CNPJ {c.fornecedor.cnpj} · entrega em {c.loja.nome} ({c.loja.logradouro}, {c.loja.numero} · {cep(c.loja.cep)})</p>
          <p className="text-sm text-slate-500">Criado {dataHora(c.criadoEm)}{c.enviadoEm ? ` · enviado ${dataHora(c.enviadoEm)}` : ''}{c.recebidoEm ? ` · recebido ${dataHora(c.recebidoEm)} · NF ${c.notaFiscal}` : ''}</p>
        </div>
        <div className="flex gap-2">
          {c.status === 'RASCUNHO' && <BotaoAcao variante="primario" tamanho="md" acao={enviarCompraAcao.bind(null, c.id)}><Icone nome="enviar" />Enviar ao fornecedor</BotaoAcao>}
          {['RASCUNHO', 'ENVIADO'].includes(c.status) && <BotaoAcao variante="perigo" tamanho="md" confirmar="Cancelar este pedido?" acao={cancelarCompraAcao.bind(null, c.id)}>Cancelar</BotaoAcao>}
        </div>
      </div>
      {c.status === 'ENVIADO' ? (
        <FormAcao acao={receberCompraAcao} rotulo="Confirmar recebimento e lançar no estoque" className="cartao space-y-4 p-5">
          <input type="hidden" name="id" value={c.id} />
          <h2 className="font-semibold">Recebimento da mercadoria</h2>
          <label className="block max-w-xs"><span className="rotulo">Nº da nota fiscal</span><input name="notaFiscal" required className="campo" /></label>
          <table className="tabela">
            <thead><tr><th>Produto</th><th>Pedido</th><th>Recebido</th><th>Lote</th><th>Validade</th></tr></thead>
            <tbody>{c.itens.map((i) => <tr key={i.id}><td>{i.produto.nome}<span className="block text-xs text-slate-500">{i.produto.sku}</span></td><td>{i.quantidade}</td><td><input name={`qtd_${i.id}`} type="number" min={0} defaultValue={i.quantidade} className="campo w-24 py-1.5" /></td><td><input name={`lote_${i.id}`} required className="campo w-32 py-1.5 uppercase" /></td><td><input name={`validade_${i.id}`} type="date" required className="campo py-1.5" /></td></tr>)}</tbody>
          </table>
        </FormAcao>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Produto</th><th>EAN</th><th className="text-right">Qtd</th><th className="text-right">Custo un.</th><th className="text-right">Subtotal</th></tr></thead>
            <tbody>{c.itens.map((i) => <tr key={i.id}><td>{i.produto.nome}</td><td>{i.produto.ean}</td><td className="text-right">{i.quantidade}</td><td className="text-right">{brl(i.custoUnitario)}</td><td className="text-right">{brl(i.quantidade * i.custoUnitario)}</td></tr>)}</tbody>
          </table>
          <p className="border-t p-4 text-right text-lg font-bold">Total {brl(c.total)}</p>
        </div>
      )}
    </div>
  );
}

export default function DetalheCompra(props: PageProps<'/admin/compras/[id]'>) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo params={props.params} /></Suspense>;
}
