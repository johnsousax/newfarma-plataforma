import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Badge, Esqueleto, Estrelas, TituloPagina, Vazio, cx } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { moderarAvaliacao } from '@/app/acoes/admin';
import { dataHora } from '@/lib/formato';
import type { StatusModeracao } from '@/generated/prisma/enums';

export const metadata = { title: 'Avaliações' };

const ABAS: { status: StatusModeracao; rotulo: string; descricao: string }[] = [
  { status: 'PENDENTE', rotulo: 'Aguardando', descricao: 'Novas avaliações esperando sua decisão' },
  { status: 'APROVADA', rotulo: 'Publicadas', descricao: 'Aparecem na página do produto' },
  { status: 'GUARDADA', rotulo: 'Guardadas', descricao: 'Ficam salvas aqui, mas não aparecem no site' },
  { status: 'REJEITADA', rotulo: 'Recusadas', descricao: 'Não publicadas' },
];

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  await paginaAdmin('avaliacoes');
  const sp = await searchParams;
  const aba = ABAS.find((a) => a.status === sp.aba)?.status ?? 'PENDENTE';
  const [lista, contagem] = await Promise.all([
    db.avaliacao.findMany({ where: { status: aba }, orderBy: { criadoEm: aba === 'PENDENTE' ? 'asc' : 'desc' }, take: 60, include: { produto: { select: { nome: true, slug: true } }, usuario: { select: { nome: true } } } }),
    db.avaliacao.groupBy({ by: ['status'], _count: true }),
  ]);
  const n = Object.fromEntries(contagem.map((c) => [c.status, c._count]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ABAS.map((a) => <Link key={a.status} href={`/admin/avaliacoes?aba=${a.status}`} className={cx('rounded-full px-4 py-1.5 text-sm', a.status === aba ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}>{a.rotulo} <span className="opacity-60">{n[a.status] ?? 0}</span></Link>)}
      </div>
      <p className="text-sm text-slate-500">{ABAS.find((a) => a.status === aba)!.descricao}.</p>
      {!lista.length ? <Vazio icone="estrela" titulo="Nada por aqui" /> : (
        <ul className="space-y-3">
          {lista.map((a) => (
            <li key={a.id} className="cartao space-y-2 p-5">
              <div className="flex flex-wrap items-center gap-2"><Estrelas nota={a.nota} /><strong>{a.titulo}</strong>{a.compraVerificada && <Badge cor="emerald">Compra verificada</Badge>}</div>
              <p className="text-sm text-slate-700">{a.comentario}</p>
              <p className="text-xs text-slate-500">{a.usuario.nome} sobre <Link href={`/produto/${a.produto.slug}`} className="link" target="_blank">{a.produto.nome}</Link> · {dataHora(a.criadoEm)}</p>
              {aba === 'PENDENTE' && <p className="text-xs text-amber-700">Recuse avaliações com dados de saúde de terceiros, promessa de cura, ofensas ou propaganda (RDC 96/2008).</p>}
              <div className="flex flex-wrap gap-2">
                {aba !== 'APROVADA' && <BotaoAcao variante="primario" acao={moderarAvaliacao.bind(null, a.id, 'APROVADA')}>Publicar</BotaoAcao>}
                {aba !== 'GUARDADA' && <BotaoAcao acao={moderarAvaliacao.bind(null, a.id, 'GUARDADA')}>Guardar sem publicar</BotaoAcao>}
                {aba !== 'REJEITADA' && <BotaoAcao variante="perigo" acao={moderarAvaliacao.bind(null, a.id, 'REJEITADA')}>Recusar</BotaoAcao>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Avaliacoes(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><TituloPagina titulo="Avaliações" subtitulo="Publique, guarde sem publicar ou recuse" /><Suspense fallback={<Esqueleto className="h-64" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
