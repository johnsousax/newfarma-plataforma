import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { MenuAdmin, type ItemMenu } from '@/components/admin/MenuAdmin';
import { Icone } from '@/components/icones';
import { sairAcao } from '@/app/acoes/conta';
import { pode, PAPEL, type Permissao } from '@/lib/dominio';
import { FARMACIA } from '@/lib/farmacia';

export const metadata = { title: { default: 'Painel', template: '%s · Painel' }, robots: { index: false } };

const ITENS: (Omit<ItemMenu, 'contador'> & { perm: Permissao })[] = [
  { href: '/admin', icone: 'painel', rotulo: 'Visão geral', grupo: 'Operação', perm: 'painel' },
  { href: '/admin/pedidos', icone: 'pedidos', rotulo: 'Pedidos', grupo: 'Operação', perm: 'pedidos' },
  { href: '/admin/receitas', icone: 'receitas', rotulo: 'Receitas', grupo: 'Operação', perm: 'verReceitas' },
  { href: '/admin/atendimento', icone: 'atendimento', rotulo: 'Atendimento', grupo: 'Operação', perm: 'atendimento' },
  { href: '/admin/pdv', icone: 'pdv', rotulo: 'PDV / Caixa', grupo: 'Operação', perm: 'pdv' },
  { href: '/admin/estoque', icone: 'estoque', rotulo: 'Estoque', grupo: 'Operação', perm: 'estoque' },
  { href: '/admin/produtos', icone: 'produtos', rotulo: 'Produtos e preços', grupo: 'Catálogo', perm: 'produtos' },
  { href: '/admin/marketing', icone: 'marketing', rotulo: 'Promoções e cupons', grupo: 'Catálogo', perm: 'marketing' },
  { href: '/admin/avaliacoes', icone: 'avaliacoes', rotulo: 'Avaliações', grupo: 'Catálogo', perm: 'avaliacoes' },
  { href: '/admin/compras', icone: 'compras', rotulo: 'Compras', grupo: 'Suprimentos', perm: 'compras' },
  { href: '/admin/fornecedores', icone: 'fornecedores', rotulo: 'Fornecedores', grupo: 'Suprimentos', perm: 'compras' },
  { href: '/admin/clientes', icone: 'clientes', rotulo: 'Clientes', grupo: 'Gestão', perm: 'clientes' },
  { href: '/admin/relatorios', icone: 'relatorios', rotulo: 'Relatórios', grupo: 'Gestão', perm: 'relatorios' },
  { href: '/admin/anvisa', icone: 'anvisa', rotulo: 'ANVISA / SNGPC', grupo: 'Gestão', perm: 'anvisa' },
  { href: '/admin/equipe', icone: 'equipe', rotulo: 'Equipe', grupo: 'Administração', perm: 'equipe' },
  { href: '/admin/lojas', icone: 'lojas', rotulo: 'Lojas', grupo: 'Administração', perm: 'lojas' },
  { href: '/admin/integracoes', icone: 'integracoes', rotulo: 'Integrações', grupo: 'Administração', perm: 'lojas' },
  { href: '/admin/auditoria', icone: 'auditoria', rotulo: 'Auditoria', grupo: 'Administração', perm: 'auditoria' },
];

async function Lateral() {
  await connection();
  const u = await paginaAdmin('painel');
  const [receitas, pagos, avaliacoes, loja, atendimento] = await Promise.all([
    db.receita.count({ where: { status: 'PENDENTE' } }),
    db.pedido.count({ where: { status: 'PAGO', ...(u.lojaId && u.papel !== 'ADMIN' ? { lojaId: u.lojaId } : {}) } }),
    db.avaliacao.count({ where: { status: 'PENDENTE' } }),
    u.lojaId ? db.loja.findUnique({ where: { id: u.lojaId }, select: { nome: true } }) : null,
    db.conversa.count({ where: { status: 'AGUARDANDO_FARMACEUTICO' } }),
  ]);
  const contadores: Record<string, number> = { '/admin/atendimento': atendimento, '/admin/receitas': receitas, '/admin/pedidos': pagos, '/admin/avaliacoes': avaliacoes };
  const itens = ITENS.filter((i) => pode(u.papel, i.perm)).map(({ perm: _p, ...i }) => ({ ...i, contador: contadores[i.href] }));
  return (
    <>
      <MenuAdmin itens={itens} />
      <div className="mt-6 border-t border-white/10 pt-4 text-sm">
        <p className="font-semibold text-white">{u.nome}</p>
        <p className="text-xs text-slate-400">{PAPEL[u.papel]}{u.crf ? ` · ${u.crf}` : ''}{loja ? ` · ${loja.nome}` : ''}</p>
        <form action={sairAcao}><button className="mt-2 text-xs text-slate-400 underline hover:text-white">Sair</button></form>
      </div>
    </>
  );
}

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto bg-slate-900 px-3 py-5 lg:block">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marca-500 text-lg font-black text-white">+</span>
          <span className="leading-tight"><span className="block text-sm font-bold text-white">{FARMACIA.nome}</span><span className="block text-xs text-slate-400">Painel de gestão</span></span>
        </Link>
        <Suspense fallback={<div className="space-y-2 px-3">{Array.from({ length: 10 }, (_, i) => <div key={i} className="h-7 animate-pulse rounded bg-white/5" />)}</div>}><Lateral /></Suspense>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
          <details className="relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center rounded-lg p-1.5 hover:bg-slate-100" aria-label="Menu"><Icone nome="menu" className="h-6 w-6" /></summary>
            <div className="absolute left-0 top-full z-50 mt-2 max-h-[80vh] w-72 overflow-y-auto rounded-2xl bg-slate-900 p-3 shadow-xl"><Suspense><Lateral /></Suspense></div>
          </details>
          <span className="text-sm text-slate-500">Painel administrativo</span>
          <Link href="/" className="text-sm font-semibold text-marca-700 hover:underline">Ver loja ↗</Link>
        </header>
        <main className="p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
