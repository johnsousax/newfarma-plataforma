import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { Esqueleto, TituloPagina, Badge } from '@/components/ui';
import { FormLembrete, BotaoRemoverLembrete } from '@/components/conta/FormsConta';

export const metadata = { title: 'Lembretes de remédio' };

async function Conteudo() {
  await connection();
  const u = await exigirLogin('/conta/lembretes');
  const [lista, produtos] = await Promise.all([
    db.lembrete.findMany({ where: { usuarioId: u.id }, include: { produto: { select: { slug: true } } }, orderBy: { criadoEm: 'desc' } }),
    db.produto.findMany({ where: { ativo: true, classificacao: { not: 'NAO_MEDICAMENTO' } }, select: { id: true, nome: true }, orderBy: { nome: 'asc' }, take: 200 }),
  ]);
  return (
    <div className="space-y-4">
      {lista.map((l) => (
        <div key={l.id} className="cartao flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-semibold">⏰ {l.nomeMedicamento} {l.dosagem && <span className="font-normal text-slate-500">· {l.dosagem}</span>}</p>
            <div className="mt-1 flex flex-wrap gap-1">{l.horarios.map((h) => <Badge key={h} cor="marca">{h}</Badge>)}</div>
            {l.dosesRestantes != null && <p className={`mt-1 text-sm ${l.dosesRestantes <= 7 ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{l.dosesRestantes} doses restantes{l.dosesRestantes <= 7 && l.produto ? <> · <Link href={`/produto/${l.produto.slug}`} className="underline">comprar</Link></> : ''}</p>}
          </div>
          <BotaoRemoverLembrete id={l.id} />
        </div>
      ))}
      <FormLembrete produtos={produtos} />
      <p className="text-xs text-slate-500">Os lembretes são enviados por WhatsApp/e-mail quando a integração de notificações estiver ativa. Eles não substituem a orientação médica.</p>
    </div>
  );
}

export default function Lembretes() {
  return <><TituloPagina titulo="Lembretes de remédio" subtitulo="Nunca esqueça uma dose — e saiba quando recomprar" /><Suspense fallback={<Esqueleto className="h-64" />}><Conteudo /></Suspense></>;
}
