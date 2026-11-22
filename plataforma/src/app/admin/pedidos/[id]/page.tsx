import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { proximosStatus, alocacoesDe } from '@/server/pedidos';
import { Badge, Esqueleto, SeloClassificacao, Aviso } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { avancarPedido, cancelarPedidoAdmin } from '@/app/acoes/admin';
import { STATUS_PEDIDO, MODALIDADE, METODO_PAGAMENTO, REGRAS } from '@/lib/dominio';
import { brl, dataHora, data, telefone } from '@/lib/formato';

async function Conteudo({ params }: { params: PageProps<'/admin/pedidos/[id]'>['params'] }) {
  await connection();
  const u = await paginaAdmin('pedidos');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const loja = lojaDoUsuario(u);
  const p = await db.pedido.findFirst({
    where: { id, ...(loja ? { lojaId: loja } : {}) },
    include: { itens: true, eventos: { orderBy: { criadoEm: 'desc' } }, pagamentos: { orderBy: { criadoEm: 'desc' } }, receitas: { orderBy: { criadoEm: 'desc' }, include: { farmaceutico: { select: { nome: true, crf: true } } } }, loja: true, usuario: { select: { nome: true, email: true, telefone: true } }, cupom: { select: { codigo: true } } },
  });
  if (!p) notFound();
  const prox = proximosStatus(p.status, p.modalidade);
  const temPrescricao = p.itens.some((i) => REGRAS[i.classificacao].exigeReceita);
  const end = p.enderecoEntrega as Record<string, string> | null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/pedidos" className="text-sm text-slate-500 hover:underline">← Pedidos</Link>
          <h1 className="text-2xl font-bold">Pedido #{p.numero} <Badge cor={STATUS_PEDIDO[p.status].cor} className="align-middle">{STATUS_PEDIDO[p.status].rotulo}</Badge></h1>
          <p className="text-sm text-slate-500">{dataHora(p.criadoEm)} · {p.canal} · {MODALIDADE[p.modalidade]} · {p.loja.nome}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {prox.map((s) => (
            <BotaoAcao key={s} variante="primario" tamanho="md" acao={avancarPedido.bind(null, p.id, s)} confirmar={s === 'EM_SEPARACAO' ? 'Confirma a separação? O estoque será baixado (FEFO).' : undefined}>
              {s === 'EM_SEPARACAO' ? 'Iniciar separação' : s === 'SAIU_PARA_ENTREGA' ? 'Despachar' : s === 'PRONTO_PARA_RETIRADA' ? 'Pronto p/ retirada' : 'Marcar entregue'}
            </BotaoAcao>
          ))}
          {['AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO', 'PAGO'].includes(p.status) && (
            <BotaoAcao variante="perigo" tamanho="md" pedirTexto="Motivo do cancelamento" acao={async (m) => { 'use server'; return cancelarPedidoAdmin(p.id, m ?? ''); }}>Cancelar</BotaoAcao>
          )}
        </div>
      </div>
      {temPrescricao && p.status === 'PAGO' && u.papel !== 'FARMACEUTICO' && <Aviso tipo="alerta">Este pedido contém medicamento sob prescrição: a separação deve ser feita por um farmacêutico.</Aviso>}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="cartao overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Produto</th><th>Qtd</th><th>Unit.</th><th>Lotes (FEFO)</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {p.itens.map((i) => (
                  <tr key={i.id}>
                    <td>{i.nome}<span className="block text-xs text-slate-500">{i.sku} <SeloClassificacao c={i.classificacao} /></span></td>
                    <td>{i.quantidade}</td><td>{brl(i.precoUnitario)}</td>
                    <td className="text-xs">{alocacoesDe(i.alocacoes).map((a) => <span key={a.loteId} className="block">{a.codigo} × {a.quantidade} (val. {data(a.validade)})</span>)}</td>
                    <td className="text-right font-semibold">{brl(i.total)}{i.desconto > 0 && <span className="block text-xs text-emerald-700">−{brl(i.desconto)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="space-y-1 border-t border-slate-100 p-4 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{brl(p.subtotal)}</dd></div>
              {p.descontoPromocoes > 0 && <div className="flex justify-between"><dt>Promoções</dt><dd>−{brl(p.descontoPromocoes)}</dd></div>}
              {p.descontoCupom > 0 && <div className="flex justify-between"><dt>Cupom {p.cupom?.codigo}</dt><dd>−{brl(p.descontoCupom)}</dd></div>}
              {p.descontoPontos > 0 && <div className="flex justify-between"><dt>Pontos ({p.pontosUsados})</dt><dd>−{brl(p.descontoPontos)}</dd></div>}
              <div className="flex justify-between"><dt>Frete</dt><dd>{brl(p.frete)}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{brl(p.total)}</dd></div>
            </dl>
          </section>
          <section className="cartao p-5">
            <h2 className="mb-3 font-semibold">Linha do tempo</h2>
            <ol className="space-y-3">{p.eventos.map((e) => <li key={e.id} className="text-sm"><Badge cor={STATUS_PEDIDO[e.status].cor}>{STATUS_PEDIDO[e.status].rotulo}</Badge> <span className="text-slate-700">{e.descricao}</span> <span className="text-xs text-slate-400">{dataHora(e.criadoEm)}</span></li>)}</ol>
          </section>
        </div>
        <aside className="space-y-4">
          <div className="cartao space-y-1 p-5 text-sm">
            <h2 className="mb-2 font-semibold">Cliente</h2>
            <p>{p.usuario?.nome ?? p.clienteNome ?? 'Consumidor'}</p>
            {p.usuario && <p className="text-slate-500">{p.usuario.email} · {telefone(p.usuario.telefone)}</p>}
            {end && <p className="pt-2 text-slate-600">{end.logradouro}, {end.numero}{end.complemento ? ` — ${end.complemento}` : ''}<br />{end.bairro} · {end.cidade}/{end.uf} · {end.cep}</p>}
            {p.observacao && <p className="pt-2"><strong>Obs.:</strong> {p.observacao}</p>}
          </div>
          <div className="cartao space-y-2 p-5 text-sm">
            <h2 className="font-semibold">Pagamentos</h2>
            {p.pagamentos.map((pg) => (
              <div key={pg.id} className="flex justify-between gap-2"><span>{METODO_PAGAMENTO[pg.metodo]}{pg.cartaoFinal ? ` •••• ${pg.cartaoFinal} ${pg.parcelas}x` : ''}<span className="block text-xs text-slate-500">{dataHora(pg.criadoEm)}{pg.motivoRecusa ? ` · ${pg.motivoRecusa}` : ''}</span></span><Badge cor={pg.status === 'APROVADO' ? 'emerald' : pg.status === 'PENDENTE' ? 'amber' : 'rose'}>{pg.status}</Badge></div>
            ))}
            {!p.pagamentos.length && <p className="text-slate-500">Nenhum pagamento ainda.</p>}
          </div>
          {p.receitas.length > 0 && (
            <div className="cartao space-y-2 p-5 text-sm">
              <h2 className="font-semibold">Receitas</h2>
              {p.receitas.map((r) => (
                <div key={r.id}>
                  <Badge cor={r.status === 'APROVADA' ? 'emerald' : r.status === 'PENDENTE' ? 'amber' : 'rose'}>{r.status}</Badge> {r.registroPrescritor} · emitida {data(r.dataEmissao)}
                  {r.farmaceutico && <span className="block text-xs text-slate-500">por {r.farmaceutico.nome} ({r.farmaceutico.crf}){r.observacao ? ` — ${r.observacao}` : ''}</span>}
                </div>
              ))}
              <Link href="/admin/receitas" className="link">Abrir fila de receitas →</Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function DetalhePedido(props: PageProps<'/admin/pedidos/[id]'>) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo params={props.params} /></Suspense>;
}
