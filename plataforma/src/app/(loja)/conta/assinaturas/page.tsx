import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { Badge, Esqueleto, TituloPagina, Aviso } from '@/components/ui';
import { FormAssinatura, BotaoAssinatura } from '@/components/conta/FormsConta';
import { brl, data } from '@/lib/formato';

export const metadata = { title: 'Uso contínuo' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/conta/assinaturas'>['searchParams'] }) {
  await connection();
  const u = await exigirLogin('/conta/assinaturas');
  const sp = await searchParams;
  const [lista, enderecos, produtos] = await Promise.all([
    db.assinatura.findMany({ where: { usuarioId: u.id }, include: { produto: { select: { nome: true, slug: true, preco: true, icone: true, classificacao: true } }, endereco: { select: { apelido: true } } }, orderBy: { criadoEm: 'desc' } }),
    db.endereco.findMany({ where: { usuarioId: u.id }, orderBy: { principal: 'desc' } }),
    db.produto.findMany({ where: { ativo: true, classificacao: { not: 'CONTROLADO' }, OR: [{ tags: { has: 'uso continuo' } }, { categoria: { slug: { in: ['vitaminas', 'suplementos', 'fraldas', 'diabetes'] } } }] }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
  ]);
  return (
    <div className="space-y-4">
      <Aviso tipo="info">🔁 Receba seus produtos de uso contínuo automaticamente com <strong>10% de desconto</strong>. Avisamos 2 dias antes de cada envio; você pode pausar quando quiser. Itens com receita passam pela validação do farmacêutico a cada ciclo.</Aviso>
      {lista.map((a) => (
        <div key={a.id} className="cartao flex flex-wrap items-center gap-4 p-5">
          <span className="text-3xl">{a.produto.icone}</span>
          <div className="min-w-0 flex-1">
            <Link href={`/produto/${a.produto.slug}`} className="font-semibold hover:text-marca-700">{a.produto.nome}</Link>
            <p className="text-sm text-slate-500">{a.quantidade} un. a cada {a.intervaloDias} dias · {brl(Math.round(a.produto.preco * a.quantidade * (1 - a.descontoPercentual / 100)))} por entrega{a.endereco ? ` · ${a.endereco.apelido}` : ''}</p>
            <p className="text-sm">{a.ativa ? <>Próxima entrega: <strong>{data(a.proximaEntrega)}</strong></> : <Badge cor="amber">Pausada</Badge>}</p>
          </div>
          <BotaoAssinatura id={a.id} ativa={a.ativa} />
        </div>
      ))}
      {enderecos.length ? <FormAssinatura produtos={produtos.map((p) => ({ id: p.id, nome: p.nome }))} enderecos={enderecos.map((e) => ({ id: e.id, nome: e.apelido }))} produtoInicial={typeof sp.produto === 'string' ? sp.produto : undefined} /> : <Aviso tipo="alerta">Cadastre um <Link href="/conta/enderecos" className="underline">endereço</Link> para criar uma assinatura.</Aviso>}
    </div>
  );
}

export default function Assinaturas(props: PageProps<'/conta/assinaturas'>) {
  return <><TituloPagina titulo="Uso contínuo" subtitulo="Assinaturas com entrega programada" /><Suspense fallback={<Esqueleto className="h-64" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
