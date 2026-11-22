import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { vitrine } from '@/server/catalogo';
import { menuCategorias } from '@/components/loja/Cabecalho';
import { CarrosselBanners } from '@/components/loja/CarrosselBanners';
import { Prateleira } from '@/components/loja/CardProduto';
import { Esqueleto } from '@/components/ui';
import { FARMACIA, linkWhatsApp } from '@/lib/farmacia';

async function Banners() {
  await connection();
  const agora = new Date();
  const banners = await db.banner.findMany({
    where: { ativo: true, AND: [{ OR: [{ inicio: null }, { inicio: { lte: agora } }] }, { OR: [{ fim: null }, { fim: { gte: agora } }] }] },
    orderBy: { ordem: 'asc' },
  });
  return <CarrosselBanners banners={banners} />;
}

async function Categorias() {
  const cats = await menuCategorias();
  return (
    <section className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
      {cats.map((c) => (
        <Link key={c.id} href={`/categoria/${c.slug}`} className="cartao flex flex-col items-center gap-2 px-2 py-4 text-center transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl" style={{ background: `${c.cor}1a` }}>{c.icone}</span>
          <span className="text-xs font-semibold text-slate-800 sm:text-sm">{c.nome}</span>
        </Link>
      ))}
    </section>
  );
}

async function Vitrines() {
  await connection();
  const [ofertas, maisVendidos, destaques, dermo, vitaminas] = await Promise.all([
    vitrine('ofertas', { limite: 12 }),
    vitrine('mais-vendidos', { limite: 12 }),
    vitrine('destaques', { limite: 12 }),
    vitrine('categoria', { categoriaSlug: 'dermocosmeticos', limite: 12 }),
    vitrine('categoria', { categoriaSlug: 'vitaminas-e-suplementos', limite: 12 }),
  ]);
  return (
    <>
      <Prateleira titulo="🔥 Ofertas imperdíveis" subtitulo="Descontos por tempo limitado" produtos={ofertas} verMais="/ofertas" />
      <Prateleira titulo="Mais vendidos" subtitulo="Os favoritos dos nossos clientes" produtos={maisVendidos} verMais="/busca?ordem=mais-vendidos" />
      <BeneficiosFaixa />
      <Prateleira titulo="Dermocosméticos" subtitulo="Cuidados para a sua pele" produtos={dermo} verMais="/categoria/dermocosmeticos" />
      <Prateleira titulo="Vitaminas e suplementos" produtos={vitaminas} verMais="/categoria/vitaminas-e-suplementos" />
      <Prateleira titulo="Selecionados para você" produtos={destaques} verMais="/busca" />
    </>
  );
}

function BeneficiosFaixa() {
  const itens = [
    ['⚡', 'Entrega expressa', 'Em até 2 horas na sua região'],
    ['🏬', 'Retire na loja', 'Pronto em 1 hora, sem frete'],
    ['⭐', 'Programa de pontos', 'Ganhe pontos e troque por descontos'],
    ['🔁', 'Uso contínuo', '10% OFF assinando seus remédios'],
  ];
  return (
    <section className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {itens.map(([i, t, s]) => (
        <div key={t} className="flex items-center gap-3 rounded-2xl bg-amarelo-50 px-4 py-4 ring-1 ring-amarelo-100">
          <span className="text-3xl">{i}</span>
          <div><p className="font-extrabold text-marca-600">{t}</p><p className="text-xs text-marca-600/70">{s}</p></div>
        </div>
      ))}
    </section>
  );
}

function EsqueletoPrateleira() {
  return (
    <div className="mt-10">
      <Esqueleto className="mb-4 h-6 w-56" />
      <div className="flex gap-3">{Array.from({ length: 5 }, (_, i) => <Esqueleto key={i} className="h-80 flex-1" />)}</div>
    </div>
  );
}

function Hero() {
  const wa = linkWhatsApp('Olá! Vim pelo site e tenho uma dúvida.');
  return (
    <section className="relative overflow-hidden bg-amarelo-400 text-marca-600">
      <div className="container-loja grid items-center gap-8 py-12 md:grid-cols-[1.1fr_.9fr] md:py-16">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
            <span className="mr-2 inline-block -rotate-3 font-normal text-oferta-600" style={{ fontFamily: 'var(--font-yellowtail)' }}>Remédio</span>
            com preço popular, <span className="text-oferta-600">pago no Pix</span> e entregue em casa.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-marca-600/85">Escolha seus produtos e pague pelo Pix ou no cartão em poucos segundos. A gente separa e entrega, ou deixa pronto para você retirar.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/ofertas" className="rounded-full bg-oferta-600 px-6 py-3.5 font-extrabold text-white shadow-lg hover:bg-oferta-700">Ver produtos e preços</Link>
            <Link href="/assistente" className="rounded-full bg-white px-6 py-3.5 font-extrabold text-marca-600 shadow hover:bg-amarelo-50">🤖 Tirar dúvida sobre um remédio</Link>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-full border-2 border-marca-600 px-6 py-3 font-extrabold hover:bg-marca-600 hover:text-white">💬 WhatsApp</a>}
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 text-sm">
          {[['⚡', 'Pix na hora', 'QR Code ou copia e cola'], ['🚚', 'Entrega em casa', 'ou retire no balcão'], ['🧑‍⚕️', 'Farmacêutico responsável', 'Orientação de verdade'], ['💳', 'Pix ou cartão', `Crédito em até ${FARMACIA.maxParcelas}x`]].map(([i, t, d]) => (
            <li key={t} className="rounded-2xl bg-white/90 p-4 shadow-sm">
              <span className="text-2xl">{i}</span>
              <p className="mt-1 font-extrabold">{t}</p>
              <p className="text-marca-600/70">{d}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="h-2 bg-oferta-600" />
    </section>
  );
}

function ComoComprar() {
  const passos = [['1', 'Escolha', 'Busque pelo nome ou princípio ativo e adicione ao carrinho.'], ['2', 'Entrega ou retirada', 'Informe o endereço ou escolha retirar no balcão.'], ['3', 'Pague no Pix', 'A confirmação é automática. Também aceitamos cartão.'], ['4', 'Receba ou retire', 'A gente separa na hora e avisa você.']];
  return (
    <section className="mt-12">
      <p className="text-sm font-bold uppercase tracking-wider text-oferta-600">Simples assim</p>
      <h2 className="text-2xl font-extrabold text-marca-600">Como comprar pelo site</h2>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {passos.map(([n, t, d]) => (
          <li key={n} className="cartao p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amarelo-400 font-extrabold text-marca-600">{n}</span>
            <p className="mt-3 font-extrabold text-marca-600">{t}</p>
            <p className="text-sm text-slate-600">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TemReceita() {
  return (
    <section className="mt-12 grid items-center gap-6 rounded-3xl bg-marca-600 p-8 text-white md:grid-cols-[1fr_auto]">
      <div>
        <h2 className="text-2xl font-extrabold sm:text-3xl">Tem receita? <span className="text-amarelo-400">Manda pra gente.</span></h2>
        <p className="mt-2 max-w-2xl text-marca-100">Antibióticos e remédios de pressão, diabetes, tireoide e outros de uso contínuo precisam de receita. Você compra pelo site, envia a foto e o farmacêutico confere antes do pagamento. Controlados (tarja preta), só na loja.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/assistente" className="rounded-full bg-amarelo-400 px-6 py-3 font-extrabold text-marca-600 hover:bg-amarelo-300">📷 Enviar foto da receita</Link>
        <Link href="/categoria/medicamentos" className="rounded-full border-2 border-white px-6 py-3 font-extrabold hover:bg-white hover:text-marca-600">Ver medicamentos</Link>
      </div>
    </section>
  );
}

export default function Inicio() {
  return (
    <>
    <Hero />
    <div className="container-loja py-6">
      <Suspense fallback={<Esqueleto className="h-56 sm:h-72" />}><Banners /></Suspense>
      <Suspense fallback={<Esqueleto className="mt-8 h-28" />}><Categorias /></Suspense>
      <ComoComprar />
      <Suspense fallback={<EsqueletoPrateleira />}><Vitrines /></Suspense>
      <TemReceita />
    </div>
    </>
  );
}
