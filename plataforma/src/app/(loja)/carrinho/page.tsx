import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { carrinhoAtual, resumir } from '@/server/carrinho';
import { usuarioAtual } from '@/server/auth';
import { vitrine } from '@/server/catalogo';
import { config } from '@/server/config';
import { ImagemProduto, SeloClassificacao, Vazio, BotaoLink, Aviso } from '@/components/ui';
import { SeletorQuantidade, FormCupom } from '@/components/checkout/ControlesCarrinho';
import { CalculoFrete } from '@/components/loja/CalculoFrete';
import { Prateleira } from '@/components/loja/CardProduto';
import { EsqueletoPagina } from '@/components/loja/Esqueletos';
import { brl } from '@/lib/formato';

export const metadata = { title: 'Carrinho' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/carrinho'>['searchParams'] }) {
  await connection();
  const sp = await searchParams;
  const [c, u] = await Promise.all([carrinhoAtual(), usuarioAtual()]);
  const r = await resumir(c, { usuarioId: u?.id });
  if (!r.linhas.length) {
    const sugestoes = await vitrine('mais-vendidos', { limite: 10 });
    return (
      <>
        <Vazio icone="carrinho" titulo="Seu carrinho está vazio" texto="Que tal começar pelas ofertas da semana?" acao={<BotaoLink href="/ofertas">Ver ofertas</BotaoLink>} />
        <Prateleira titulo="Mais vendidos" produtos={sugestoes} />
      </>
    );
  }
  const faltaFrete = config.frete.gratisAcimaDe - (r.subtotal - r.descontoPromocoes);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {sp.indisponiveis && <Aviso tipo="alerta">{sp.indisponiveis} item(ns) do pedido anterior estão indisponíveis e não foram adicionados.</Aviso>}
        {faltaFrete > 0 ? (
          <div className="cartao p-4 text-sm">
            <p>Faltam <strong>{brl(faltaFrete)}</strong> para ganhar <strong>frete grátis</strong> na entrega padrão (Grande SP).</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-marca-500" style={{ width: `${Math.min(100, ((r.subtotal - r.descontoPromocoes) / config.frete.gratisAcimaDe) * 100)}%` }} /></div>
          </div>
        ) : <Aviso tipo="sucesso">Você ganhou <strong>frete grátis</strong> na entrega padrão!</Aviso>}
        {r.exigeReceita && <Aviso tipo="info">Seu carrinho tem medicamento que exige receita. Após finalizar, você envia a foto da receita e nosso farmacêutico valida antes do pagamento.</Aviso>}
        <ul className="cartao divide-y divide-slate-100">
          {r.linhas.map((l) => (
            <li key={l.produtoId} className="flex gap-4 p-4">
              <Link href={`/produto/${l.slug}`}><ImagemProduto icone={l.icone} imagemId={l.imagemId} alt={l.nome} tamanho="sm" /></Link>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase text-slate-500">{l.marca}</p>
                <Link href={`/produto/${l.slug}`} className="font-medium text-slate-900 hover:text-marca-700">{l.nome}</Link>
                <div className="mt-1 flex flex-wrap gap-1"><SeloClassificacao c={l.classificacao} />{l.oferta.leve && <span className="rounded bg-oferta-50 px-1.5 text-xs font-semibold text-oferta-700">Leve {l.oferta.leve} pague {l.oferta.pague}</span>}</div>
                {l.aviso && <p className="mt-1 text-xs font-semibold text-rose-600">{l.aviso}</p>}
                <div className="mt-3"><SeletorQuantidade produtoId={l.produtoId} quantidade={l.quantidade} max={l.disponivel} /></div>
              </div>
              <div className="text-right">
                {l.oferta.precoDe && <p className="text-xs text-slate-400 line-through">{brl(l.oferta.precoDe * l.quantidade)}</p>}
                <p className="font-bold">{brl(l.total)}</p>
                {l.descontoLevePague > 0 && <p className="text-xs font-semibold text-emerald-700">−{brl(l.descontoLevePague)} leve+</p>}
                <p className="text-xs text-slate-500">{brl(l.oferta.preco)} un.</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-40 lg:self-start">
        <div className="cartao space-y-4 p-5">
          <h2 className="text-lg font-bold">Resumo</h2>
          <FormCupom codigo={r.cupomCodigo} erroCupom={r.erroCupom} />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Subtotal ({r.quantidadeItens} itens)</dt><dd>{brl(r.subtotal)}</dd></div>
            {r.descontoPromocoes > 0 && <div className="flex justify-between text-emerald-700"><dt>Leve mais, pague menos</dt><dd>−{brl(r.descontoPromocoes)}</dd></div>}
            {r.descontoCupom > 0 && <div className="flex justify-between text-emerald-700"><dt>Cupom</dt><dd>−{brl(r.descontoCupom)}</dd></div>}
            {r.freteGratis && <div className="flex justify-between text-emerald-700"><dt>Frete</dt><dd>Grátis (cupom)</dd></div>}
            <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold"><dt>Total sem frete</dt><dd>{brl(r.total)}</dd></div>
            {r.economia > 0 && <p className="text-right text-xs font-semibold text-emerald-700">Você economiza {brl(r.economia)}</p>}
          </dl>
          {u && <p className="text-xs text-slate-600">Você ganha <strong>{r.pontosAGanhar} pontos</strong> e tem {u.pontos} para usar no checkout.</p>}
          <BotaoLink href={u ? '/checkout' : '/entrar?voltar=/checkout'} bloco tamanho="lg" className={r.temIndisponivel ? 'pointer-events-none opacity-50' : ''}>Continuar para o pagamento</BotaoLink>
          {r.temIndisponivel && <p className="text-xs text-rose-600">Ajuste os itens sem estoque para continuar.</p>}
          <Link href="/" className="block text-center text-sm text-slate-600 underline">Continuar comprando</Link>
        </div>
        <div className="cartao p-5">
          <h3 className="mb-3 font-semibold">Calcular frete</h3>
          <CalculoFrete cepInicial={c?.cep ?? ''} />
        </div>
      </aside>
    </div>
  );
}

export default function Carrinho(props: PageProps<'/carrinho'>) {
  return (
    <div className="container-loja py-6">
      <h1 className="mb-6 text-2xl font-bold">Meu carrinho</h1>
      <Suspense fallback={<EsqueletoPagina />}><Conteudo searchParams={props.searchParams} /></Suspense>
    </div>
  );
}
