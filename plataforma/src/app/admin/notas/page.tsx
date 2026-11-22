import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { configuracoes } from '@/server/configuracoes';
import { pendenciasFiscais } from '@/server/fiscal/nfce';
import { Aviso, Badge, Esqueleto, TituloPagina, Vazio } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { gerarNotaAcao } from '@/app/acoes/admin';
import { brl, dataHora } from '@/lib/formato';
import { COR_NOTA } from '@/lib/fiscal';
import { diasAtras } from '@/lib/tempo';

export const metadata = { title: 'Notas fiscais' };


async function Conteudo() {
  await connection();
  await paginaAdmin('notas');
  const [{ fiscal }, { pendencias }, notas, semNota] = await Promise.all([
    configuracoes(), pendenciasFiscais(),
    db.notaFiscal.findMany({ orderBy: { criadoEm: 'desc' }, take: 80, include: { pedido: { select: { numero: true } } } }),
    db.pedido.findMany({ where: { status: { in: ['PAGO', 'EM_SEPARACAO', 'PRONTO_PARA_RETIRADA', 'SAIU_PARA_ENTREGA', 'ENTREGUE'] }, notas: { none: { status: { not: 'CANCELADA' } } }, criadoEm: { gte: diasAtras(30) } }, orderBy: { criadoEm: 'desc' }, take: 30, select: { id: true, numero: true, total: true, canal: true, criadoEm: true } }),
  ]);
  return (
    <div className="space-y-6">
      <Aviso tipo={pendencias.length ? 'alerta' : 'info'}>
        Ambiente: <strong>{fiscal.ambiente === 'producao' ? 'Produção' : 'Homologação (testes)'}</strong> · Provedor: <strong>{fiscal.provedor === 'nenhum' ? 'nenhum (as notas ficam prontas para transmitir)' : fiscal.provedor}</strong> · Série {fiscal.serieNfce}.
        {pendencias.length > 0 && <> Antes de emitir em produção, complete: {pendencias.join(' · ')}. <Link href="/admin/configuracoes" className="link">Abrir configurações</Link></>}
      </Aviso>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Vendas sem nota (30 dias)</h2>
        {!semNota.length ? <p className="text-sm text-slate-500">Todas as vendas pagas têm nota.</p> : (
          <div className="cartao overflow-x-auto"><table className="tabela">
            <thead><tr><th>Pedido</th><th>Canal</th><th>Data</th><th className="text-right">Total</th><th></th></tr></thead>
            <tbody>{semNota.map((p) => (
              <tr key={p.id}><td><Link href={`/admin/pedidos/${p.id}`} className="link">#{p.numero}</Link></td><td>{p.canal}</td><td>{dataHora(p.criadoEm)}</td><td className="text-right">{brl(p.total)}</td>
                <td className="text-right"><BotaoAcao variante="primario" acao={gerarNotaAcao.bind(null, p.id)}>Gerar NFC-e</BotaoAcao></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Notas emitidas</h2>
        {!notas.length ? <Vazio icone="notas" titulo="Nenhuma nota ainda" /> : (
          <div className="cartao overflow-x-auto"><table className="tabela">
            <thead><tr><th>Número</th><th>Pedido</th><th>Emissão</th><th>Situação</th><th className="text-right">Valor</th></tr></thead>
            <tbody>{notas.map((n) => (
              <tr key={n.id}>
                <td><Link href={`/admin/notas/${n.id}`} className="link font-mono">{n.modelo} {n.serie}/{n.numero}</Link>{n.ambiente !== 'producao' && <span className="ml-1 text-[10px] text-amber-700">HOMOLOG.</span>}</td>
                <td>#{n.pedido.numero}</td><td>{dataHora(n.criadoEm)}</td>
                <td><Badge cor={COR_NOTA[n.status].cor}>{COR_NOTA[n.status].rotulo}</Badge></td>
                <td className="text-right">{brl(n.valorTotal)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

export default function Notas() {
  return <><TituloPagina titulo="Notas fiscais" subtitulo="NFC-e prontas para a integração com a SEFAZ" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
