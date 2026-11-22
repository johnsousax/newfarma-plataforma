import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { filaAtendimento } from '@/server/assistente/conversas';
import { Badge, Esqueleto, TituloPagina, Vazio, Aviso } from '@/components/ui';
import { AtualizarSozinho } from '@/components/assistente/Controles';
import { dataHora, telefone } from '@/lib/formato';
import { minutosDesde, diasAtras } from '@/lib/tempo';

export const metadata = { title: 'Atendimento farmacêutico' };

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('atendimento');
  const [fila, bloqueios] = await Promise.all([
    filaAtendimento(),
    db.mensagem.groupBy({ by: ['bloqueadaPorRegra'], where: { bloqueadaPorRegra: { not: null }, criadoEm: { gte: diasAtras(30) } }, _count: true }),
  ]);
  return (
    <div className="space-y-5">
      <AtualizarSozinho ativo />
      {u.papel !== 'FARMACEUTICO' && <Aviso tipo="info">Somente farmacêuticos respondem. Você pode acompanhar a fila.</Aviso>}
      {fila.length === 0 ? <Vazio icone="✅" titulo="Ninguém aguardando" texto="Quando o assistente encaminhar uma dúvida ou o cliente pedir um farmacêutico, a conversa aparece aqui (atualiza sozinha)." /> : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Cliente</th><th>Motivo</th><th>Status</th><th>Esperando</th><th>Mensagens</th><th /></tr></thead>
            <tbody>{fila.map((c) => (
              <tr key={c.id} className={c.emergencia ? 'bg-oferta-50' : ''}>
                <td className="font-medium">{c.usuario.nome}<span className="block text-xs text-slate-500">{telefone(c.usuario.telefone)}</span></td>
                <td className="text-sm">{c.emergencia && <Badge cor="rose">🚨 Emergência</Badge>} {c.motivoEncaminhamento}</td>
                <td><Badge cor={c.status === 'EM_ATENDIMENTO' ? 'emerald' : 'amber'}>{c.status === 'EM_ATENDIMENTO' ? `Com ${c.farmaceutico?.nome ?? 'farmacêutico'}` : 'Aguardando'}</Badge></td>
                <td className="whitespace-nowrap">{minutosDesde(c.atualizadoEm)} min<span className="block text-xs text-slate-500">{dataHora(c.atualizadoEm)}</span></td>
                <td>{c._count.mensagens}</td>
                <td className="text-right"><Link href={`/admin/atendimento/${c.id}`} className="link">Abrir →</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <section className="cartao p-5 text-sm">
        <h2 className="mb-2 font-semibold">Bloqueios automáticos do assistente (30 dias)</h2>
        <p className="mb-3 text-slate-500">Respostas da IA substituídas pela verificação de segurança antes de chegar ao cliente. Use para revisar as regras com o RT.</p>
        {bloqueios.length ? <ul className="flex flex-wrap gap-2">{bloqueios.map((b) => <li key={b.bloqueadaPorRegra}><Badge cor="amber">{b.bloqueadaPorRegra}: {b._count}</Badge></li>)}</ul> : <p className="text-slate-500">Nenhum bloqueio no período.</p>}
      </section>
    </div>
  );
}

export default function Atendimento() {
  return <><TituloPagina titulo="Atendimento farmacêutico" subtitulo="Dúvidas encaminhadas pelo assistente virtual e pedidos de atendimento humano" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
