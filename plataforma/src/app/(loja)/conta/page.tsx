import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { Aviso, Badge, BotaoLink, Esqueleto } from '@/components/ui';
import { STATUS_PEDIDO, nivelFidelidade } from '@/lib/dominio';
import { brl, data } from '@/lib/formato';
import { diasAtras } from '@/lib/tempo';

export const metadata = { title: 'Minha conta' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/conta'>['searchParams'] }) {
  await connection();
  const u = await exigirLogin('/conta');
  const sp = await searchParams;
  const umAno = diasAtras(365);
  const [pedidos, gasto, assinaturas, lembretes, pendentes] = await Promise.all([
    db.pedido.findMany({ where: { usuarioId: u.id }, orderBy: { criadoEm: 'desc' }, take: 3, include: { _count: { select: { itens: true } } } }),
    db.pedido.aggregate({ where: { usuarioId: u.id, status: 'ENTREGUE', criadoEm: { gte: umAno } }, _sum: { total: true } }),
    db.assinatura.findMany({ where: { usuarioId: u.id, ativa: true }, include: { produto: { select: { nome: true } } }, orderBy: { proximaEntrega: 'asc' }, take: 2 }),
    db.lembrete.findMany({ where: { usuarioId: u.id, ativo: true, dosesRestantes: { lte: 7 } }, include: { produto: { select: { slug: true } } } }),
    db.pedido.count({ where: { usuarioId: u.id, status: { in: ['AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO'] } } }),
  ]);
  const nivel = nivelFidelidade(gasto._sum.total ?? 0);
  return (
    <div className="space-y-6">
      {sp.bemvindo && <Aviso tipo="sucesso">Conta criada! Use o cupom <strong>BEMVINDO10</strong> para ganhar 10% na primeira compra.</Aviso>}
      <div>
        <h1 className="text-2xl font-bold">Olá, {u.nome.split(' ')[0]}!</h1>
        <p className="text-sm text-slate-500">Que bom ter você por aqui.</p>
      </div>
      {pendentes > 0 && <Aviso tipo="alerta">Você tem {pendentes} pedido(s) aguardando ação (receita ou pagamento). <Link href="/conta/pedidos" className="font-semibold underline">Ver pedidos</Link></Aviso>}
      {lembretes.map((l) => (
        <Aviso key={l.id} tipo="alerta">Seu <strong>{l.nomeMedicamento}</strong> está acabando ({l.dosesRestantes} doses). {l.produto && <Link href={`/produto/${l.produto.slug}`} className="font-semibold underline">Comprar agora</Link>}</Aviso>
      ))}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/conta/fidelidade" className="cartao p-5 hover:shadow-md">
          <p className="text-sm text-slate-500">Seus pontos</p>
          <p className="text-3xl font-extrabold text-marca-700">{u.pontos}</p>
          <p className="text-xs text-slate-500">= {brl(Math.floor(u.pontos / 100) * 500)} em descontos</p>
        </Link>
        <Link href="/conta/fidelidade" className="cartao p-5 hover:shadow-md">
          <p className="text-sm text-slate-500">Seu nível</p>
          <p className="text-3xl font-extrabold" style={{ color: nivel.cor }}>{nivel.nome}</p>
          <p className="text-xs text-slate-500">{nivel.proximo ? `Faltam ${brl(nivel.faltam)} para ${nivel.proximo.nome}` : 'Nível máximo!'}</p>
        </Link>
        <Link href="/conta/assinaturas" className="cartao p-5 hover:shadow-md">
          <p className="text-sm text-slate-500">Uso contínuo</p>
          {assinaturas[0] ? <><p className="truncate font-semibold">{assinaturas[0].produto.nome}</p><p className="text-xs text-slate-500">Próxima entrega em {data(assinaturas[0].proximaEntrega)}</p></> : <p className="font-semibold text-marca-700">Assine e ganhe 10% →</p>}
        </Link>
      </div>
      <section className="cartao p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Últimos pedidos</h2><Link href="/conta/pedidos" className="link text-sm">Ver todos</Link></div>
        {pedidos.length ? (
          <ul className="divide-y divide-slate-100">
            {pedidos.map((p) => (
              <li key={p.id}>
                <Link href={`/pedido/${p.numero}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                  <span><strong>#{p.numero}</strong> <span className="text-sm text-slate-500">· {data(p.criadoEm)} · {p._count.itens} item(ns)</span></span>
                  <span className="flex items-center gap-3"><Badge cor={STATUS_PEDIDO[p.status].cor}>{STATUS_PEDIDO[p.status].rotulo}</Badge><strong>{brl(p.total)}</strong></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <div className="py-6 text-center text-sm text-slate-500">Você ainda não fez pedidos. <BotaoLink href="/ofertas" tamanho="sm" className="ml-2">Ver ofertas</BotaoLink></div>}
      </section>
    </div>
  );
}

export default function Conta(props: PageProps<'/conta'>) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense>;
}
