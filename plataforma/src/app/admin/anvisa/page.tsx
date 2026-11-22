import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { alocacoesDe } from '@/server/pedidos';
import { Aviso, Badge, Esqueleto, TituloPagina } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { marcarTransmitidoSngpc } from '@/app/acoes/admin';
import { dataHora } from '@/lib/formato';
import { FARMACIA } from '@/lib/farmacia';

export const metadata = { title: 'ANVISA / SNGPC' };

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('anvisa');
  const loja = lojaDoUsuario(u);
  const lista = await db.escrituracao.findMany({ where: loja ? { lojaId: loja } : {}, orderBy: { criadoEm: 'desc' }, take: 200, include: { produto: { select: { nome: true } }, pedido: { select: { numero: true, id: true, canal: true } } } });
  const pendentes = lista.filter((e) => !e.transmitidoSngpc);
  return (
    <div className="space-y-4">
      <Aviso tipo="info">Livro de escrituração de antimicrobianos e controlados dispensados. RT: {FARMACIA.rtNome || 'não informado no .env'}{FARMACIA.rtCrf ? ` (${FARMACIA.rtCrf})` : ''}. Exporte o arquivo e transmita pelo sistema SNGPC da ANVISA; depois marque como transmitido. <strong>Este painel não substitui a integração oficial</strong> (XML SNGPC) — veja docs/INTEGRACOES.md.</Aviso>
      <div className="flex flex-wrap gap-2">
        <a href="/api/admin/sngpc" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">⬇ Exportar pendentes (CSV)</a>
        {pendentes.length > 0 && <BotaoAcao variante="primario" tamanho="md" confirmar={`Marcar ${pendentes.length} registro(s) como transmitidos?`} acao={marcarTransmitidoSngpc.bind(null, pendentes.map((p) => p.id))}>Marcar {pendentes.length} como transmitidos</BotaoAcao>}
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Data</th><th>Pedido</th><th>Medicamento</th><th>Registro MS</th><th>Lotes</th><th className="text-right">Qtd</th><th>Prescritor</th><th>Farmacêutico</th><th>SNGPC</th></tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{dataHora(e.criadoEm)}</td>
                <td><Link href={`/admin/pedidos/${e.pedido.id}`} className="link">#{e.pedido.numero}</Link><span className="block text-xs text-slate-500">{e.pedido.canal}</span></td>
                <td>{e.produto.nome}<span className="block text-xs text-slate-500">{e.principioAtivo}</span></td>
                <td className="font-mono text-xs">{e.registroAnvisa}</td>
                <td className="text-xs">{alocacoesDe(e.lotes).map((l) => `${l.codigo}×${l.quantidade}`).join(', ')}</td>
                <td className="text-right">{e.quantidade}</td><td>{e.registroPrescritor ?? '—'}</td><td>{e.crfFarmaceutico}</td>
                <td><Badge cor={e.transmitidoSngpc ? 'emerald' : 'amber'}>{e.transmitidoSngpc ? 'Transmitido' : 'Pendente'}</Badge></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={9} className="py-10 text-center text-slate-500">Nenhuma dispensação escriturada ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Anvisa() {
  return <><TituloPagina titulo="ANVISA — Escrituração (SNGPC)" subtitulo="RDC 471/2021 (antimicrobianos) e Portaria 344/98 (controlados)" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
