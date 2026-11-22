import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { produtoPorSlug, equivalentes, compradosJuntos, avaliacoesDoProduto } from '@/server/catalogo';
import { disponibilidadePorLoja } from '@/server/estoque';
import { usuarioAtual } from '@/server/auth';
import { Badge, Estrelas, Preco, SeloClassificacao, Aviso, Esqueleto } from '@/components/ui';
import { BotaoComprar } from '@/components/loja/BotaoComprar';
import { GaleriaProduto } from '@/components/loja/GaleriaProduto';
import { CalculoFrete } from '@/components/loja/CalculoFrete';
import { BotaoFavorito } from '@/components/loja/BotaoFavorito';
import { FormAvaliacao } from '@/components/loja/FormAvaliacao';
import { Prateleira } from '@/components/loja/CardProduto';
import { REGRAS, TIPO_MEDICAMENTO } from '@/lib/dominio';
import { brl, data, percentual } from '@/lib/formato';
import { FARMACIA, parcelasPara } from '@/lib/farmacia';
import { linkWhatsLoja } from '@/server/configuracoes';
import { Icone } from '@/components/icones';

export async function generateMetadata({ params }: PageProps<'/produto/[slug]'>) {
  const { slug } = await params;
  const p = await db.produto.findUnique({ where: { slug }, select: { nome: true, descricaoCurta: true } });
  return p ? { title: p.nome, description: p.descricaoCurta } : { title: 'Produto não encontrado' };
}

async function Conteudo({ params }: { params: PageProps<'/produto/[slug]'>['params'] }) {
  await connection();
  const { slug } = await params;
  const p = await produtoPorSlug(slug);
  if (!p) notFound();
  const u = await usuarioAtual();
  const [equiv, juntos, aval, porLoja, lojas, fav, carrinho] = await Promise.all([
    equivalentes(p),
    compradosJuntos(p.id, p.categoriaId),
    avaliacoesDoProduto(p.id),
    disponibilidadePorLoja([p.id]),
    db.loja.findMany({ where: { ativa: true, centroDistribuicao: false }, orderBy: { nome: 'asc' } }),
    u ? db.favorito.findUnique({ where: { usuarioId_produtoId: { usuarioId: u.id, produtoId: p.id } } }) : null,
    u ? db.carrinho.findUnique({ where: { usuarioId: u.id }, select: { cep: true } }) : null,
  ]);
  const regra = REGRAS[p.classificacao];
  const waProduto = await linkWhatsLoja(`Olá! Tenho uma dúvida sobre ${p.nome}.`);
  const parcelas = parcelasPara(p.oferta.preco);
  const usoContinuo = p.tags.includes('uso continuo') || p.categoria.nome === 'Vitaminas';
  const maisBarato = equiv.filter((e) => e.disponivel > 0).sort((a, b) => a.oferta.preco - b.oferta.preco)[0];
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.nome, sku: p.sku, gtin13: p.ean ?? undefined, brand: { '@type': 'Brand', name: p.marca.nome }, description: p.descricaoCurta,
    offers: { '@type': 'Offer', priceCurrency: 'BRL', price: (p.oferta.preco / 100).toFixed(2), availability: p.disponivel > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
    ...(p.nota ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.nota.toFixed(1), reviewCount: p.totalAvaliacoes } } : {}),
  };

  return (
    <div className="container-loja py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <nav className="mb-4 text-sm text-slate-500" aria-label="Trilha">
        <Link href="/" className="hover:text-marca-700">Início</Link>
        {p.categoria.pai && <> › <Link href={`/categoria/${p.categoria.pai.slug}`} className="hover:text-marca-700">{p.categoria.pai.nome}</Link></>}
        {' › '}<Link href={`/categoria/${p.categoria.slug}`} className="hover:text-marca-700">{p.categoria.nome}</Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr_340px]">
        <div className="relative">
          <GaleriaProduto icone={p.icone} cor={p.categoria.cor} imagens={p.imagens.map((i) => i.id)} nome={p.nome} />
          {p.oferta.selo && <span className="absolute left-4 top-4 rounded-xl bg-oferta-600 px-3 py-1 text-sm font-bold text-white shadow">{p.oferta.selo}</span>}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/busca?marca=${p.marca.slug}`} className="text-sm font-semibold uppercase tracking-wide text-marca-700 hover:underline">{p.marca.nome}</Link>
            <SeloClassificacao c={p.classificacao} />
            {p.tipo !== 'NAO_SE_APLICA' && <Badge cor={p.tipo === 'GENERICO' ? 'amber' : 'slate'}>{TIPO_MEDICAMENTO[p.tipo]}</Badge>}
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">{p.nome}</h1>
          <p className="mt-1 text-sm text-slate-500">Cód. {p.sku}{p.ean ? ` · EAN ${p.ean}` : ''}</p>
          {p.totalAvaliacoes > 0 && <a href="#avaliacoes" className="mt-2 inline-block"><Estrelas nota={p.nota} total={p.totalAvaliacoes} tamanho="md" /></a>}
          <p className="mt-4 text-slate-700">{p.descricaoCurta}</p>

          {regra.medicamento && (
            <div className="mt-5 space-y-2">
              {p.classificacao === 'CONTROLADO' ? (
                <Aviso tipo="alerta"><strong>Venda somente na loja.</strong> Medicamento de controle especial (Portaria 344/98): a RDC 44/2009 proíbe a venda pela internet. Leve a receita original (notificação) a uma de nossas lojas.</Aviso>
              ) : regra.exigeReceita ? (
                <Aviso tipo="info">
                  <strong>Exige receita médica{regra.retencao ? ' (retida)' : ''}.</strong> Depois de finalizar o pedido, envie a foto da receita: nosso farmacêutico valida antes do pagamento.
                  {p.classificacao === 'ANTIMICROBIANO' && ' Antimicrobianos: receita válida por 10 dias a partir da emissão (RDC 471/2021).'}
                </Aviso>
              ) : null}
              <p className="text-xs text-slate-500">Registro ANVISA nº {p.registroAnvisa} · {regra.rotulo}</p>
            </div>
          )}

          {maisBarato && maisBarato.oferta.preco < p.oferta.preco && (
            <Link href={`/produto/${maisBarato.slug}`} className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100">
              <Icone nome="ideia" className="h-6 w-6 shrink-0 text-amber-700" />
              <span className="text-sm text-amber-950"><strong>Economize {percentual(p.oferta.preco, maisBarato.oferta.preco)}%</strong> com {TIPO_MEDICAMENTO[maisBarato.tipo].toLowerCase() || 'a opção'} {maisBarato.marca.nome}: mesmo princípio ativo por {brl(maisBarato.oferta.preco)} →</span>
            </Link>
          )}

          <section className="mt-8 space-y-6">
            <div>
              <h2 className="mb-2 text-lg font-semibold">Descrição</h2>
              <p className="leading-relaxed text-slate-700">{p.descricao}</p>
            </div>
            <div>
              <h2 className="mb-2 text-lg font-semibold">Informações técnicas</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                {[
                  ['Marca / fabricante', `${p.marca.nome}${p.marca.fabricante ? ` — ${p.marca.fabricante}` : ''}`],
                  ['Princípio ativo', p.principioAtivo], ['Concentração', p.concentracao], ['Forma farmacêutica', p.formaFarmaceutica],
                  ['Apresentação', p.apresentacao], ['Tipo', TIPO_MEDICAMENTO[p.tipo] || null], ['Registro ANVISA', p.registroAnvisa],
                  ['Preço máximo (PMC/CMED)', p.pmc ? brl(p.pmc) : null], ['Código de barras', p.ean],
                ].filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v}</dd></div>)}
              </dl>
            </div>
            {regra.medicamento && (
              <div>
                <h2 className="mb-2 text-lg font-semibold">Bula resumida</h2>
                <div className="space-y-2">
                  {[['Indicações', p.indicacoes], ['Contraindicações', p.contraindicacoes], ['Modo de usar', p.modoDeUsar], ['Advertências', p.advertencias]].filter(([, v]) => v).map(([k, v]) => (
                    <details key={k} className="cartao px-4 py-3"><summary className="cursor-pointer font-medium">{k}</summary><p className="mt-2 text-sm text-slate-700">{v}</p></details>
                  ))}
                </div>
                <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Se persistirem os sintomas, o médico deverá ser consultado. Leia a bula.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-40 lg:self-start">
          <div className="cartao space-y-4 p-5">
            <Preco preco={p.oferta.preco} precoDe={p.oferta.precoDe} tamanho="lg" />
            {parcelas > 1 && <p className="text-sm text-slate-600">ou {parcelas}x de {brl(Math.ceil(p.oferta.preco / parcelas))} sem juros</p>}
            <p className="text-sm text-slate-600">Ganhe <strong>{Math.floor(p.oferta.preco / 100)} pontos</strong> nesta compra</p>
            {p.oferta.leve && <p className="rounded-xl bg-oferta-50 px-3 py-2 text-sm font-semibold text-oferta-700">Leve {p.oferta.leve}, pague {p.oferta.pague}: desconto aplicado no carrinho</p>}
            {p.disponivel > 0 && p.disponivel <= 5 && <p className="text-sm font-semibold text-amber-700">Restam só {p.disponivel} unidades!</p>}
            <BotaoComprar produtoId={p.id} disponivel={p.disponivel} controlado={p.classificacao === 'CONTROLADO'} comSeletor />
            <div className="flex gap-2">
              <BotaoFavorito produtoId={p.id} favorito={!!fav} logado={!!u} />
              {usoContinuo && p.classificacao !== 'CONTROLADO' && <Link href={`/conta/assinaturas?produto=${p.id}`} className="flex flex-1 items-center justify-center rounded-xl border border-marca-300 px-3 text-sm font-semibold text-marca-800 hover:bg-marca-50"><Icone nome="repetir" className="mr-1.5" />Assinar −10%</Link>}
            </div>
          </div>
          {p.classificacao !== 'CONTROLADO' && (
            <div className="cartao p-5">
              <h2 className="mb-3 font-semibold">Calcule o frete e o prazo</h2>
              <CalculoFrete produtoId={p.id} cepInicial={carrinho?.cep ?? ''} />
            </div>
          )}
          <div className="cartao p-5">
            <h2 className="mb-3 font-semibold">Disponibilidade nas lojas</h2>
            <ul className="space-y-2 text-sm">
              {lojas.map((l) => {
                const q = porLoja.get(l.id)?.get(p.id) ?? 0;
                return (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <span>{l.nome}<span className="block text-xs text-slate-500">{l.bairro}</span></span>
                    <span className={q > 5 ? 'font-semibold text-emerald-700' : q > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'}>{q > 5 ? 'Disponível' : q > 0 ? `Últimas ${q}` : 'Indisponível'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="cartao space-y-2 p-5 text-sm">
            <p className="font-semibold">Dúvidas sobre este produto?</p>
            <p className="text-slate-600">Fale com nosso farmacêutico{FARMACIA.rtNome ? ` (${FARMACIA.rtNome}${FARMACIA.rtCrf ? `, ${FARMACIA.rtCrf}` : ''})` : ''}. O assistente virtual explica para que o medicamento serve conforme a bula, mas não indica tratamento.</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/assistente" className="rounded-xl bg-marca-600 px-3 py-2 font-semibold text-white inline-flex items-center gap-1.5"><Icone nome="assistente" />Assistente</Link>
              {waProduto && <a href={waProduto} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-300 px-3 py-2 font-semibold inline-flex items-center gap-1.5"><Icone nome="whatsapp" />WhatsApp</a>}
            </div>
          </div>
        </aside>
      </div>

      {equiv.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-1 text-xl font-bold">Opções com o mesmo princípio ativo</h2>
          <p className="mb-4 text-sm text-slate-500">Genéricos são intercambiáveis com o medicamento de referência (Lei 9.787/99). Na dúvida, pergunte ao farmacêutico.</p>
          <div className="cartao overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Produto</th><th>Tipo</th><th>Laboratório</th><th className="text-right">Preço</th><th /></tr></thead>
              <tbody>
                {equiv.map((e) => (
                  <tr key={e.id}>
                    <td><Link href={`/produto/${e.slug}`} className="link">{e.nome}</Link></td>
                    <td><Badge cor={e.tipo === 'GENERICO' ? 'amber' : 'slate'}>{TIPO_MEDICAMENTO[e.tipo]}</Badge></td>
                    <td>{e.marca.nome}</td>
                    <td className="text-right font-semibold">{brl(e.oferta.preco)}{e.oferta.preco < p.oferta.preco && <span className="ml-2 text-xs text-emerald-700">−{percentual(p.oferta.preco, e.oferta.preco)}%</span>}</td>
                    <td className="text-right">{e.disponivel > 0 ? <Link href={`/produto/${e.slug}`} className="link text-sm">Ver</Link> : <span className="text-xs text-slate-400">Esgotado</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Prateleira titulo="Quem comprou, levou também" produtos={juntos} />

      <section id="avaliacoes" className="mt-12 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="cartao p-5">
            <h2 className="text-xl font-bold">Avaliações</h2>
            {p.nota ? (
              <>
                <p className="mt-2 text-4xl font-extrabold">{p.nota.toFixed(1)}<span className="text-lg font-medium text-slate-400"> / 5</span></p>
                <Estrelas nota={p.nota} total={p.totalAvaliacoes} tamanho="md" />
                <ul className="mt-4 space-y-1.5">
                  {aval.distribuicao.map((d) => (
                    <li key={d.nota} className="flex items-center gap-2 text-sm">
                      <span className="w-6">{d.nota}★</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${(d.total / p.totalAvaliacoes) * 100}%` }} /></span>
                      <span className="w-6 text-right text-slate-500">{d.total}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="mt-2 text-sm text-slate-500">Seja o primeiro a avaliar.</p>}
          </div>
          {u ? <FormAvaliacao produtoId={p.id} /> : <p className="text-sm text-slate-600"><Link href={`/entrar?voltar=/produto/${p.slug}`} className="link">Entre</Link> para avaliar este produto.</p>}
        </div>
        <ul className="space-y-3">
          {aval.lista.map((a) => (
            <li key={a.id} className="cartao p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Estrelas nota={a.nota} />
                <strong className="text-slate-900">{a.titulo}</strong>
                {a.compraVerificada && <Badge cor="emerald">✓ Compra verificada</Badge>}
              </div>
              <p className="mt-2 text-sm text-slate-700">{a.comentario}</p>
              <p className="mt-2 text-xs text-slate-500">{a.autor} · {data(a.criadoEm)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function EsqueletoProduto() {
  return (
    <div className="container-loja grid gap-8 py-6 lg:grid-cols-[1fr_1fr_340px]">
      <Esqueleto className="aspect-square" />
      <div className="space-y-3"><Esqueleto className="h-6 w-40" /><Esqueleto className="h-10" /><Esqueleto className="h-24" /></div>
      <Esqueleto className="h-96" />
    </div>
  );
}

export default function PaginaProduto(props: PageProps<'/produto/[slug]'>) {
  return <Suspense fallback={<EsqueletoProduto />}><Conteudo params={props.params} /></Suspense>;
}
