import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Badge, Esqueleto, Estrelas, TituloPagina, Vazio } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { moderarAvaliacao } from '@/app/acoes/admin';
import { dataHora } from '@/lib/formato';

export const metadata = { title: 'Avaliações' };

async function Conteudo() {
  await connection();
  await paginaAdmin('avaliacoes');
  const lista = await db.avaliacao.findMany({ where: { status: 'PENDENTE' }, orderBy: { criadoEm: 'asc' }, take: 50, include: { produto: { select: { nome: true, slug: true } }, usuario: { select: { nome: true } } } });
  if (!lista.length) return <Vazio icone="⭐" titulo="Nenhuma avaliação aguardando moderação" />;
  return (
    <ul className="space-y-3">
      {lista.map((a) => (
        <li key={a.id} className="cartao space-y-2 p-5">
          <div className="flex flex-wrap items-center gap-2"><Estrelas nota={a.nota} /><strong>{a.titulo}</strong>{a.compraVerificada && <Badge cor="emerald">Compra verificada</Badge>}</div>
          <p className="text-sm text-slate-700">{a.comentario}</p>
          <p className="text-xs text-slate-500">{a.usuario.nome} sobre <Link href={`/produto/${a.produto.slug}`} className="link" target="_blank">{a.produto.nome}</Link> · {dataHora(a.criadoEm)}</p>
          <p className="text-xs text-amber-700">Recuse avaliações com dados de saúde de terceiros, promessa de cura, ofensas ou propaganda (RDC 96/2008).</p>
          <div className="flex gap-2"><BotaoAcao variante="primario" acao={moderarAvaliacao.bind(null, a.id, true)}>Publicar</BotaoAcao><BotaoAcao variante="perigo" acao={moderarAvaliacao.bind(null, a.id, false)}>Recusar</BotaoAcao></div>
        </li>
      ))}
    </ul>
  );
}

export default function Avaliacoes() {
  return <><TituloPagina titulo="Moderação de avaliações" /><Suspense fallback={<Esqueleto className="h-64" />}><Conteudo /></Suspense></>;
}
