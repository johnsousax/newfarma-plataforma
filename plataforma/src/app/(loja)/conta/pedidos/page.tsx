import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { Badge, Esqueleto, TituloPagina, Vazio, BotaoLink } from '@/components/ui';
import { ComprarNovamente } from '@/components/checkout/AcoesPedido';
import { STATUS_PEDIDO, MODALIDADE } from '@/lib/dominio';
import { brl, data } from '@/lib/formato';

export const metadata = { title: 'Meus pedidos' };

async function Conteudo() {
  await connection();
  const u = await exigirLogin('/conta/pedidos');
  const pedidos = await db.pedido.findMany({ where: { usuarioId: u.id }, orderBy: { criadoEm: 'desc' }, take: 50, include: { itens: { select: { nome: true, quantidade: true } } } });
  if (!pedidos.length) return <Vazio icone="📦" titulo="Nenhum pedido ainda" acao={<BotaoLink href="/">Começar a comprar</BotaoLink>} />;
  return (
    <ul className="space-y-3">
      {pedidos.map((p) => (
        <li key={p.id} className="cartao p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link href={`/pedido/${p.numero}`} className="text-lg font-bold hover:text-marca-700">Pedido #{p.numero}</Link>
              <p className="text-sm text-slate-500">{data(p.criadoEm)} · {MODALIDADE[p.modalidade]} · {p.canal === 'PDV' ? 'Compra na loja' : 'Site'}</p>
            </div>
            <div className="flex items-center gap-3"><Badge cor={STATUS_PEDIDO[p.status].cor}>{STATUS_PEDIDO[p.status].rotulo}</Badge><strong>{brl(p.total)}</strong></div>
          </div>
          <p className="mt-2 line-clamp-1 text-sm text-slate-600">{p.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(' · ')}</p>
          <div className="mt-3 flex gap-2"><BotaoLink href={`/pedido/${p.numero}`} variante="secundario" tamanho="sm">Detalhes</BotaoLink><ComprarNovamente pedidoId={p.id} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function Pedidos() {
  return <><TituloPagina titulo="Meus pedidos" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
