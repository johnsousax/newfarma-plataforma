import { Suspense } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/server/db';
import { Badge, Esqueleto, TituloPagina } from '@/components/ui';
import { telefone, cep } from '@/lib/formato';

export const metadata = { title: 'Nossas lojas' };

async function lojas() {
  'use cache';
  cacheLife('hours');
  cacheTag('lojas');
  return db.loja.findMany({ where: { ativa: true, centroDistribuicao: false }, orderBy: { nome: 'asc' } });
}

async function Lista() {
  const ls = await lojas();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ls.map((l) => (
        <article key={l.id} className="cartao p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold">{l.nome}</h2>
            {l.aceitaExpressa && <Badge cor="marca">⚡ Expressa 2h</Badge>}
          </div>
          <p className="mt-2 text-sm text-slate-600">{l.logradouro}, {l.numero} · {l.bairro}<br />{l.cidade}/{l.uf} · CEP {cep(l.cep)}</p>
          <p className="mt-2 text-sm">🕒 {l.horario}</p>
          <p className="text-sm">📞 {telefone(l.telefone)}</p>
          <p className="mt-2 text-xs text-slate-500">CNPJ {l.cnpj} · Farmacêutico presente durante todo o horário de funcionamento.</p>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.logradouro} ${l.numero} ${l.cidade}`)}`} target="_blank" rel="noopener noreferrer" className="link mt-3 inline-block text-sm">Como chegar →</a>
        </article>
      ))}
    </div>
  );
}

export default function Lojas() {
  return (
    <div className="container-loja py-6">
      <TituloPagina titulo="Nossas lojas" subtitulo="Retire seu pedido em 1 hora ou compre medicamentos controlados com receita" />
      <Suspense fallback={<Esqueleto className="h-64" />}><Lista /></Suspense>
    </div>
  );
}
