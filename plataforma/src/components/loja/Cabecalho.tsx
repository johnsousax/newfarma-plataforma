import Link from 'next/link';
import { Suspense } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/server/db';
import { usuarioAtual } from '@/server/auth';
import { carrinhoAtual } from '@/server/carrinho';
import { FARMACIA, linkWhatsApp } from '@/lib/farmacia';
import { EQUIPE } from '@/lib/dominio';
import { brl } from '@/lib/formato';
import { config } from '@/server/config';
import { CaixaBusca } from './CaixaBusca';
import { LogoCompleto, SeloMarca } from '@/components/Logo';

export async function menuCategorias() {
  'use cache';
  cacheLife('hours');
  cacheTag('catalogo');
  return db.categoria.findMany({ where: { paiId: null }, orderBy: { ordem: 'asc' }, include: { filhas: { orderBy: { ordem: 'asc' } } } });
}

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center" aria-label={`${FARMACIA.nome} — página inicial`}>
      <SeloMarca className="h-10 w-10 sm:hidden" />
      <LogoCompleto className="hidden h-11 sm:block" />
    </Link>
  );
}

async function AreaUsuario() {
  const [u, c] = await Promise.all([usuarioAtual(), carrinhoAtual()]);
  const itens = c?.itens.reduce((s, i) => s + i.quantidade, 0) ?? 0;
  const primeiroNome = u?.nome.split(' ')[0];
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {u && EQUIPE.includes(u.papel) && (
        <Link href="/admin" className="hidden rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 md:block">Painel</Link>
      )}
      <Link href={u ? '/conta' : '/entrar'} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-100">
        <span className="text-xl" aria-hidden>👤</span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-xs text-slate-500">{u ? `Olá, ${primeiroNome}` : 'Olá! Entre'}</span>
          <span className="block text-sm font-semibold text-slate-800">{u ? `${u.pontos} pontos` : 'ou cadastre-se'}</span>
        </span>
      </Link>
      <Link href="/carrinho" className="flex h-11 items-center gap-2 rounded-full bg-oferta-600 pl-3.5 pr-2 font-extrabold text-white shadow-sm hover:bg-oferta-700" aria-label={`Carrinho com ${itens} itens`}>
        <span aria-hidden>🛒</span>
        <span className="hidden text-sm lg:block">Carrinho</span>
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs text-oferta-600">{itens}</span>
      </Link>
    </div>
  );
}

async function NavCategorias() {
  const cats = await menuCategorias();
  return (
    <nav className="hidden border-t border-slate-100 md:block" aria-label="Categorias">
      <ul className="container-loja flex items-center gap-1 text-sm">
        {cats.map((c) => (
          <li key={c.id} className="group relative">
            <Link href={`/categoria/${c.slug}`} className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-marca-50 hover:text-marca-800">
              <span aria-hidden>{c.icone}</span>{c.nome}
            </Link>
            {c.filhas.length > 0 && (
              <div className="invisible absolute left-0 top-full z-40 w-64 translate-y-1 rounded-2xl border border-slate-200 bg-white p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                {c.filhas.map((f) => (
                  <Link key={f.id} href={`/categoria/${f.slug}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">
                    <span aria-hidden>{f.icone}</span>{f.nome}
                  </Link>
                ))}
                <Link href={`/categoria/${c.slug}`} className="mt-1 block rounded-lg px-3 py-2 text-sm font-semibold text-marca-700 hover:bg-marca-50">Ver tudo em {c.nome} →</Link>
              </div>
            )}
          </li>
        ))}
        <li className="ml-auto"><Link href="/assistente" className="rounded-lg px-3 py-2.5 font-semibold text-marca-700 hover:bg-marca-50">🤖 Tire dúvidas</Link></li>
        <li><Link href="/ofertas" className="rounded-lg px-3 py-2.5 font-bold text-oferta-600 hover:bg-oferta-50">🔥 Ofertas</Link></li>
      </ul>
    </nav>
  );
}

async function MenuMobile() {
  const cats = await menuCategorias();
  return (
    <details className="relative md:hidden">
      <summary className="flex cursor-pointer list-none items-center rounded-xl p-2 text-2xl hover:bg-slate-100" aria-label="Menu">☰</summary>
      <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
        <Link href="/ofertas" className="block rounded-lg px-3 py-2 font-bold text-oferta-600">🔥 Ofertas</Link>
        <Link href="/assistente" className="block rounded-lg px-3 py-2 font-semibold text-marca-700">🤖 Tire dúvidas sobre remédios</Link>
        {cats.map((c) => <Link key={c.id} href={`/categoria/${c.slug}`} className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">{c.icone} {c.nome}</Link>)}
        <Link href="/lojas" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">📍 Nossas lojas</Link>
      </div>
    </details>
  );
}

export function Cabecalho() {
  return (
    <>
    {process.env.PAGAMENTOS_SIMULADOS === '1' && (
      <div className="bg-oferta-600 px-4 py-1.5 text-center text-xs font-bold text-white">
        🧪 Loja nova em fase de testes: os pagamentos são simulados e os produtos e preços são de demonstração. Para comprar de verdade, fale com a farmácia.
      </div>
    )}
    <header className="sticky top-0 z-30 border-b border-amarelo-100 bg-white/95 backdrop-blur">
      <div className="bg-amarelo-400 text-xs font-semibold text-marca-700">
        <div className="container-loja flex items-center justify-between gap-4 py-1.5">
          <p>💸 Preço popular · ⚡ Pix na hora · 🚚 Entrega em casa ou retire no balcão · frete grátis acima de {brl(config.frete.gratisAcimaDe)}</p>
          <div className="hidden gap-4 sm:flex">
            <Link href="/lojas" className="hover:underline">📍 Nossa loja</Link>
            {linkWhatsApp('Olá! Vim pelo site e tenho uma dúvida.') && <a href={linkWhatsApp('Olá! Vim pelo site e tenho uma dúvida.')!} className="hover:underline" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>}
          </div>
        </div>
      </div>
      <div className="container-loja flex items-center gap-3 py-3 sm:gap-6">
        <Suspense fallback={<span className="w-10 md:hidden" />}><MenuMobile /></Suspense>
        <Logo />
        <div className="flex-1"><Suspense fallback={<div className="h-12 rounded-2xl bg-slate-100" />}><CaixaBusca /></Suspense></div>
        <Suspense fallback={<div className="h-10 w-24 rounded-xl bg-slate-100 sm:w-48" />}><AreaUsuario /></Suspense>
      </div>
      <Suspense fallback={<div className="hidden h-[45px] border-t border-slate-100 md:block" />}><NavCategorias /></Suspense>
    </header>
    </>
  );
}
