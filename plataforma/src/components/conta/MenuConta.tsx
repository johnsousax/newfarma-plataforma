'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { sairAcao } from '@/app/acoes/conta';
import { cx } from '@/components/ui';
import { Icone } from '@/components/icones';

const ITENS = [
  ['/conta', 'inicio', 'Resumo'],
  ['/conta/pedidos', 'pedidos', 'Meus pedidos'],
  ['/conta/fidelidade', 'estrela', 'Pontos e níveis'],
  ['/conta/assinaturas', 'repetir', 'Uso contínuo'],
  ['/conta/lembretes', 'lembrete', 'Lembretes de remédio'],
  ['/conta/favoritos', 'coracao', 'Favoritos'],
  ['/conta/enderecos', 'local', 'Endereços'],
  ['/conta/dados', 'usuario', 'Dados e privacidade'],
] as const satisfies readonly (readonly [string, import('@/components/icones').NomeIcone, string])[];

export function MenuConta() {
  const atual = usePathname();
  return (
    <nav className="cartao sem-barra flex gap-1 overflow-x-auto p-2 lg:flex-col" aria-label="Minha conta">
      {ITENS.map(([href, ic, rot]) => (
        <Link key={href} href={href} aria-current={atual === href ? 'page' : undefined} className={cx('flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium', atual === href ? 'bg-marca-50 text-marca-800' : 'text-slate-700 hover:bg-slate-50')}>
          <Icone nome={ic} className="h-[18px] w-[18px]" />{rot}
        </Link>
      ))}
      <form action={sairAcao}><button className="flex w-full shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"><Icone nome="seta" className="h-[18px] w-[18px] rotate-180" />Sair</button></form>
    </nav>
  );
}
