import Link from 'next/link';
import { Suspense } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/server/db';
import { usuarioAtual } from '@/server/auth';
import { carrinhoAtual } from '@/server/carrinho';
import { FARMACIA, linkWhatsApp } from '@/lib/farmacia';
import { EQUIPE } from '@/lib/dominio';
import { CaixaBusca } from './CaixaBusca';
import { LogoCompleto, SeloMarca } from '@/components/Logo';
import { MenuLoja } from './MenuLoja';
import { Icone } from '@/components/icones';

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
        <Icone nome="usuario" className="h-6 w-6 text-marca-600" />
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-xs text-slate-500">{u ? `Olá, ${primeiroNome}` : 'Olá! Entre'}</span>
          <span className="block text-sm font-semibold text-slate-800">{u ? `${u.pontos} pontos` : 'ou cadastre-se'}</span>
        </span>
      </Link>
      <Link href="/carrinho" className="flex h-11 items-center gap-2 rounded-full bg-oferta-600 pl-3.5 pr-2 font-extrabold text-white shadow-sm hover:bg-oferta-700" aria-label={`Carrinho com ${itens} itens`}>
        <Icone nome="carrinho" className="h-5 w-5" />
        <span className="hidden text-sm lg:block">Carrinho</span>
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs text-oferta-600">{itens}</span>
      </Link>
    </div>
  );
}

async function MenuPrincipal() {
  const cats = await menuCategorias();
  return <MenuLoja categorias={cats} whatsapp={linkWhatsApp('Olá! Vim pelo site e tenho uma dúvida.')} />;
}

export function Cabecalho() {
  return (
    <>
    {process.env.PAGAMENTOS_SIMULADOS === '1' && (
      <div className="bg-oferta-600 px-4 py-1.5 text-center text-xs font-bold text-white">
        Loja nova em fase de testes: os pagamentos são simulados e os produtos e preços são de demonstração. Para comprar de verdade, fale com a farmácia.
      </div>
    )}
    <header className="sticky top-0 z-30 border-b border-amarelo-100 bg-white/95 backdrop-blur">
      <div className="bg-amarelo-400 text-xs font-semibold text-marca-700">
        <div className="container-loja flex items-center justify-between gap-4 py-1.5">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1"><span className="inline-flex items-center gap-1.5"><Icone nome="etiqueta" className="h-3.5 w-3.5" />Preço popular</span><span className="inline-flex items-center gap-1.5"><Icone nome="pix" className="h-3.5 w-3.5" />Pix na hora</span><span className="inline-flex items-center gap-1.5"><Icone nome="entrega" className="h-3.5 w-3.5" />Entrega no bairro ou retire no balcão</span></p>
          <div className="hidden gap-4 sm:flex">
            <Link href="/lojas" className="inline-flex items-center gap-1.5 hover:underline"><Icone nome="local" className="h-3.5 w-3.5" />Nossa loja</Link>
            {linkWhatsApp('Olá! Vim pelo site e tenho uma dúvida.') && <a href={linkWhatsApp('Olá! Vim pelo site e tenho uma dúvida.')!} className="inline-flex items-center gap-1.5 hover:underline" target="_blank" rel="noopener noreferrer"><Icone nome="whatsapp" className="h-3.5 w-3.5" />WhatsApp</a>}
          </div>
        </div>
      </div>
      <div className="container-loja flex items-center gap-3 py-3 sm:gap-6">
        <Suspense fallback={<span className="h-11 w-11" />}><MenuPrincipal /></Suspense>
        <Logo />
        <div className="flex-1"><Suspense fallback={<div className="h-12 rounded-2xl bg-slate-100" />}><CaixaBusca /></Suspense></div>
        <Suspense fallback={<div className="h-10 w-24 rounded-xl bg-slate-100 sm:w-48" />}><AreaUsuario /></Suspense>
      </div>
    </header>
    </>
  );
}
