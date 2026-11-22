import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { receitasPendentes } from '@/server/receitas';
import { Aviso, Badge, Esqueleto, SeloClassificacao, TituloPagina, Vazio } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { avaliarReceitaAcao } from '@/app/acoes/admin';
import { data, dataHora } from '@/lib/formato';
import { minutosDesde } from '@/lib/tempo';

export const metadata = { title: 'Receitas' };

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('verReceitas');
  const podeAvaliar = u.papel === 'FARMACEUTICO';
  const [fila, recentes] = await Promise.all([
    receitasPendentes(),
    db.receita.findMany({ where: { status: { not: 'PENDENTE' } }, orderBy: { avaliadoEm: 'desc' }, take: 15, include: { pedido: { select: { numero: true, id: true } }, farmaceutico: { select: { nome: true } } } }),
  ]);
  return (
    <div className="space-y-6">
      {!podeAvaliar && <Aviso tipo="info">Somente farmacêuticos com CRF podem aprovar ou recusar receitas. Você pode visualizar a fila.</Aviso>}
      {fila.length === 0 ? <Vazio icone="✅" titulo="Nenhuma receita pendente" texto="Quando um cliente enviar uma receita, ela aparece aqui." /> : fila.map((r) => (
        <article key={r.id} className="cartao grid gap-5 p-5 lg:grid-cols-[360px_1fr]">
          <a href={`/api/admin/receitas/${r.id}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {r.mime === 'application/pdf'
              ? <div className="flex h-64 items-center justify-center text-sm font-semibold text-marca-700">📄 Abrir PDF da receita</div>
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={`/api/admin/receitas/${r.id}`} alt="Receita enviada pelo cliente" className="h-64 w-full object-contain" />}
          </a>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/admin/pedidos/${r.pedidoId}`} className="text-lg font-bold hover:underline">Pedido #{r.pedido.numero}</Link>
              <Badge cor="amber">Pendente há {minutosDesde(r.criadoEm)} min</Badge>
              <span className="text-slate-500">{r.pedido.loja.nome}</span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-slate-500">Paciente/cliente</dt><dd>{r.usuario.nome}</dd>
              <dt className="text-slate-500">Prescritor</dt><dd>{r.prescritor} · {r.registroPrescritor}</dd>
              <dt className="text-slate-500">Emissão</dt><dd>{data(r.dataEmissao)} · válida até {data(r.validade.limite)} ({r.validade.dias} dias) {r.validade.valida ? <Badge cor="emerald">Dentro da validade</Badge> : <Badge cor="rose">VENCIDA</Badge>}</dd>
              <dt className="text-slate-500">Enviada</dt><dd>{dataHora(r.criadoEm)}</dd>
            </dl>
            <div>
              <p className="mb-1 font-semibold">Itens que exigem receita</p>
              <ul className="space-y-1">{r.itensReceita.map((i) => <li key={i.id}>{i.quantidade}× {i.nome} <SeloClassificacao c={i.classificacao} /></li>)}</ul>
            </div>
            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Confira: nome do paciente, medicamento, dose e posologia, data, assinatura e carimbo do prescritor. Antimicrobianos: receita em 2 vias, validade de 10 dias, retenção da 2ª via na entrega.</p>
            {podeAvaliar && (
              <div className="flex flex-wrap gap-2">
                <BotaoAcao variante="primario" tamanho="md" confirmar="Aprovar e liberar para pagamento?" acao={async () => { 'use server'; return avaliarReceitaAcao(r.id, true, ''); }}>✅ Aprovar</BotaoAcao>
                <BotaoAcao variante="perigo" tamanho="md" pedirTexto="Motivo (será enviado ao cliente)" acao={async (m) => { 'use server'; return avaliarReceitaAcao(r.id, false, m ?? ''); }}>Recusar</BotaoAcao>
              </div>
            )}
          </div>
        </article>
      ))}
      <section className="cartao overflow-x-auto">
        <h2 className="p-5 pb-2 font-semibold">Avaliadas recentemente</h2>
        <table className="tabela">
          <thead><tr><th>Pedido</th><th>Status</th><th>Prescritor</th><th>Farmacêutico</th><th>Quando</th><th>Observação</th></tr></thead>
          <tbody>{recentes.map((r) => <tr key={r.id}><td><Link href={`/admin/pedidos/${r.pedido.id}`} className="link">#{r.pedido.numero}</Link></td><td><Badge cor={r.status === 'APROVADA' ? 'emerald' : 'rose'}>{r.status}</Badge></td><td>{r.registroPrescritor}</td><td>{r.farmaceutico?.nome ?? '—'}</td><td>{dataHora(r.avaliadoEm)}</td><td className="text-slate-500">{r.observacao ?? ''}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

export default function Receitas() {
  return <><TituloPagina titulo="Validação de receitas" subtitulo="Fila de receitas enviadas pelos clientes (RDC 44/2009 e RDC 471/2021)" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
