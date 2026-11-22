'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { sairAcao } from '@/app/acoes/conta';
import { cx } from '@/components/ui';

const ITENS = [
  ['/conta', '🏠', 'Resumo'],
  ['/conta/pedidos', '📦', 'Meus pedidos'],
  ['/conta/fidelidade', '⭐', 'Pontos e níveis'],
  ['/conta/assinaturas', '🔁', 'Uso contínuo'],
  ['/conta/lembretes', '⏰', 'Lembretes de remédio'],
  ['/conta/favoritos', '♥', 'Favoritos'],
  ['/conta/enderecos', '📍', 'Endereços'],
  ['/conta/dados', '👤', 'Dados e privacidade'],
] as const;

export function MenuConta() {
  const atual = usePathname();
  return (
    <nav className="cartao sem-barra flex gap-1 overflow-x-auto p-2 lg:flex-col" aria-label="Minha conta">
      {ITENS.map(([href, ic, rot]) => (
        <Link key={href} href={href} aria-current={atual === href ? 'page' : undefined} className={cx('flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium', atual === href ? 'bg-marca-50 text-marca-800' : 'text-slate-700 hover:bg-slate-50')}>
          <span aria-hidden>{ic}</span>{rot}
        </Link>
      ))}
      <form action={sairAcao}><button className="flex w-full shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50">↩ Sair</button></form>
    </nav>
  );
}
