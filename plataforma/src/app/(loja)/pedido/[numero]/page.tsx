import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { config } from '@/server/config';
import { Aviso, Badge, SeloClassificacao, BotaoLink } from '@/components/ui';
import { PagarPedido, CodigoPix, EnviarReceita, CancelarPedido, ComprarNovamente } from '@/components/checkout/AcoesPedido';
import { EsqueletoPagina } from '@/components/loja/Esqueletos';
import { STATUS_PEDIDO, MODALIDADE, METODO_PAGAMENTO } from '@/lib/dominio';
import { brl, dataHora, data } from '@/lib/formato';
import type { StatusPedido } from '@/generated/prisma/enums';

export const metadata = { title: 'Meu pedido' };

const ETAPAS: StatusPedido[] = ['AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_SEPARACAO', 'SAIU_PARA_ENTREGA', 'ENTREGUE'];

async function Conteudo({ params, searchParams }: PageProps<'/pedido/[numero]'>) {
  await connection();
  const { numero } = await params;
  const sp = await searchParams;
  const u = await exigirLogin(`/pedido/${numero}`);
  const n = Number(numero);
  if (!Number.isInteger(n)) notFound();
  // Somente o dono vê o pedido (evita IDOR); a equipe usa o painel
  const p = await db.pedido.findFirst({
    where: { numero: n, usuarioId: u.id },
    include: { itens: true, eventos: { orderBy: { criadoEm: 'desc' } }, pagamentos: { orderBy: { criadoEm: 'desc' } }, receitas: { orderBy: { criadoEm: 'desc' }, select: { id: true, status: true, observacao: true, criadoEm: true } }, loja: true },
  });
  if (!p) notFound();
  const st = STATUS_PEDIDO[p.status];
  const pixPendente = p.pagamentos.find((x) => x.metodo === 'PIX' && x.status === 'PENDENTE' && x.pixExpiraEm && x.pixExpiraEm > new Date());
  const ultimoRecusado = p.pagamentos[0]?.status === 'RECUSADO' ? p.pagamentos[0] : null;
  const etapas = p.modalidade === 'RETIRADA' ? ETAPAS.map((e) => (e === 'SAIU_PARA_ENTREGA' ? 'PRONTO_PARA_RETIRADA' : e)) : ETAPAS;
  const idx = etapas.indexOf(p.status === 'AGUARDANDO_RECEITA' ? 'AGUARDANDO_PAGAMENTO' : p.status);
  const end = p.enderecoEntrega as Record<string, string> | null;
  const receitaPendente = p.receitas.find((r) => r.status === 'PENDENTE');
  const receitaRecusada = !receitaPendente && p.receitas[0]?.status === 'REJEITADA' ? p.receitas[0] : null;

  return (
    <div className="space-y-6">
      {sp.novo && p.status !== 'CANCELADO' && (
        <div className="rounded-3xl bg-gradient-to-r from-marca-600 to-marca-500 p-6 text-white">
          <p className="text-3xl">🎉</p>
          <h2 className="mt-1 text-2xl font-bold">Pedido #{p.numero} recebido!</h2>
          <p className="text-white/90">{st.cliente}</p>
        </div>
      )}
      {sp.recusado && ultimoRecusado && <Aviso tipo="erro">Pagamento recusado: {ultimoRecusado.motivoRecusa}. Tente outro cartão ou PIX abaixo.</Aviso>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pedido #{p.numero}</h1>
          <p className="text-sm text-slate-500">Feito em {dataHora(p.criadoEm)} · {MODALIDADE[p.modalidade]}</p>
        </div>
        <Badge cor={st.cor} className="px-3 py-1 text-sm">{st.rotulo}</Badge>
      </div>

      {p.status !== 'CANCELADO' && (
        <ol className="cartao grid grid-cols-5 gap-1 p-4 text-center text-xs">
          {etapas.map((e, i) => (
            <li key={e} className="flex flex-col items-center gap-1.5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${i <= idx ? 'bg-marca-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{i < idx ? '✓' : i + 1}</span>
              <span className={i <= idx ? 'font-semibold text-slate-800' : 'text-slate-400'}>{STATUS_PEDIDO[e].rotulo}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {p.status === 'AGUARDANDO_RECEITA' && (
            <section className="cartao space-y-3 p-5">
              <h2 className="text-lg font-bold">📋 Envie sua receita</h2>
              {receitaPendente ? (
                <Aviso tipo="info">Recebemos sua receita em {dataHora(receitaPendente.criadoEm)}. Um farmacêutico está analisando — normalmente leva menos de 30 minutos no horário de atendimento.</Aviso>
              ) : (
                <>
                  {receitaRecusada && <Aviso tipo="erro">A receita anterior foi recusada: {receitaRecusada.observacao}</Aviso>}
                  <p className="text-sm text-slate-600">Os itens com prescrição ficam reservados para você. Após a aprovação, você paga e liberamos o pedido.</p>
                  <EnviarReceita pedidoId={p.id} />
                </>
              )}
            </section>
          )}
          {p.status === 'AGUARDANDO_PAGAMENTO' && (
            <section className="cartao space-y-3 p-5">
              <h2 className="text-lg font-bold">💳 Pagamento</h2>
              {pixPendente ? (
                <CodigoPix pagamentoId={pixPendente.id} codigo={pixPendente.pixCopiaECola ?? ''} expiraEm={pixPendente.pixExpiraEm!.toISOString()} dev={!config.producao} />
              ) : <PagarPedido pedidoId={p.id} total={p.total} />}
            </section>
          )}
          {p.status === 'PRONTO_PARA_RETIRADA' && <Aviso tipo="sucesso">🏬 Seu pedido está pronto na <strong>{p.loja.nome}</strong> ({p.loja.logradouro}, {p.loja.numero}). Apresente um documento com foto{p.itens.some((i) => i.classificacao === 'ANTIMICROBIANO') ? ' e a 2ª via da receita' : ''}.</Aviso>}

          <section className="cartao p-5">
            <h2 className="mb-3 text-lg font-bold">Itens</h2>
            <ul className="divide-y divide-slate-100">
              {p.itens.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>{i.quantidade}× {i.nome} <SeloClassificacao c={i.classificacao} /></span>
                  <strong>{brl(i.total)}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="cartao p-5">
            <h2 className="mb-3 text-lg font-bold">Histórico</h2>
            <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5">
              {p.eventos.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-marca-500" />
                  <p className="text-sm font-semibold">{STATUS_PEDIDO[e.status].rotulo}</p>
                  <p className="text-sm text-slate-600">{e.descricao}</p>
                  <p className="text-xs text-slate-400">{dataHora(e.criadoEm)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="cartao space-y-2 p-5 text-sm">
            <h2 className="text-lg font-bold">Resumo</h2>
            <div className="flex justify-between"><span>Produtos</span><span>{brl(p.subtotal)}</span></div>
            {p.descontoPromocoes > 0 && <div className="flex justify-between text-emerald-700"><span>Promoções</span><span>−{brl(p.descontoPromocoes)}</span></div>}
            {p.descontoCupom > 0 && <div className="flex justify-between text-emerald-700"><span>Cupom</span><span>−{brl(p.descontoCupom)}</span></div>}
            {p.descontoPontos > 0 && <div className="flex justify-between text-emerald-700"><span>Pontos ({p.pontosUsados})</span><span>−{brl(p.descontoPontos)}</span></div>}
            <div className="flex justify-between"><span>Frete</span><span>{p.frete ? brl(p.frete) : 'Grátis'}</span></div>
            <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{brl(p.total)}</span></div>
            {p.metodoPagamento && <p className="text-slate-500">{METODO_PAGAMENTO[p.metodoPagamento]}{p.pagamentos[0]?.cartaoFinal ? ` final ${p.pagamentos[0].cartaoFinal} · ${p.pagamentos[0].parcelas}x` : ''}</p>}
            {p.pontosGanhos > 0 && <p className="font-semibold text-emerald-700">⭐ +{p.pontosGanhos} pontos ganhos</p>}
          </div>
          <div className="cartao space-y-1 p-5 text-sm">
            <h2 className="mb-1 font-bold">{p.modalidade === 'RETIRADA' ? 'Retirada' : 'Entrega'}</h2>
            {end ? <p className="text-slate-600">{end.destinatario}<br />{end.logradouro}, {end.numero}{end.complemento ? ` — ${end.complemento}` : ''}<br />{end.bairro} · {end.cidade}/{end.uf}</p> : <p className="text-slate-600">{p.loja.nome}<br />{p.loja.logradouro}, {p.loja.numero} · {p.loja.bairro}<br />{p.loja.horario}</p>}
            {p.previsaoEntrega && !['ENTREGUE', 'CANCELADO'].includes(p.status) && <p className="pt-1 font-semibold">Previsão: {p.modalidade === 'ENTREGA_EXPRESSA' ? dataHora(p.previsaoEntrega) : data(p.previsaoEntrega)}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ComprarNovamente pedidoId={p.id} />
            {['AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO', 'PAGO'].includes(p.status) && <CancelarPedido pedidoId={p.id} />}
          </div>
          <BotaoLink href="/conta/pedidos" variante="fantasma" tamanho="sm">← Todos os pedidos</BotaoLink>
          <p className="text-xs text-slate-500">Precisa de ajuda? <Link href="/lojas" className="link">Fale com a loja</Link>.</p>
        </aside>
      </div>
    </div>
  );
}

export default function PaginaPedido(props: PageProps<'/pedido/[numero]'>) {
  return <div className="container-loja py-6"><Suspense fallback={<EsqueletoPagina />}><Conteudo {...props} /></Suspense></div>;
}
