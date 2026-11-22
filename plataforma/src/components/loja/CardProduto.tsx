import Link from 'next/link';
import { Estrelas, ImagemProduto, Preco, SeloClassificacao, Badge } from '@/components/ui';
import { BotaoComprar } from './BotaoComprar';
import { TIPO_MEDICAMENTO } from '@/lib/dominio';
import { brl } from '@/lib/formato';
import { parcelasPara } from '@/lib/farmacia';
import type { ProdutoCard } from '@/server/catalogo';

export function CardProduto({ p }: { p: ProdutoCard }) {
  const parcelas = parcelasPara(p.oferta.preco);
  return (
    <article className="cartao group relative flex h-full flex-col p-3 transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/produto/${p.slug}`} className="relative block">
        <ImagemProduto icone={p.icone} cor={p.categoria.cor} imagemId={p.imagens[0]?.id} alt={p.nome} />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {p.oferta.selo && <span className="rounded-lg bg-oferta-600 px-2 py-0.5 text-xs font-bold text-white shadow">{p.oferta.selo}</span>}
          {p.tipo === 'GENERICO' && <span className="rounded-lg bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">G · Genérico</span>}
        </div>
      </Link>
      <div className="mt-3 flex flex-1 flex-col">
        <div className="mb-1 flex flex-wrap items-center gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{p.marca.nome}</span>
          <SeloClassificacao c={p.classificacao} />
          {p.tipo !== 'NAO_SE_APLICA' && p.tipo !== 'GENERICO' && <Badge>{TIPO_MEDICAMENTO[p.tipo]}</Badge>}
        </div>
        <Link href={`/produto/${p.slug}`} className="line-clamp-2 min-h-10 text-sm font-medium text-slate-900 group-hover:text-marca-800">{p.nome}</Link>
        <div className="mt-1 h-4">{p.avaliacoes > 0 && <Estrelas nota={p.nota} total={p.avaliacoes} />}</div>
        <div className="mt-auto pt-3">
          <Preco preco={p.oferta.preco} precoDe={p.oferta.precoDe} />
          <p className="h-4 text-xs text-slate-500">{parcelas > 1 ? `ou ${parcelas}x de ${brl(Math.ceil(p.oferta.preco / parcelas))} sem juros` : ''}</p>
          {p.disponivel > 0 && p.disponivel <= 5 && <p className="text-xs font-semibold text-amber-700">Últimas {p.disponivel} unidades!</p>}
          <div className="mt-2">
            <BotaoComprar produtoId={p.id} disponivel={p.disponivel} controlado={p.classificacao === 'CONTROLADO'} compacto />
          </div>
        </div>
      </div>
    </article>
  );
}

export function GradeProdutos({ produtos }: { produtos: ProdutoCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {produtos.map((p) => <CardProduto key={p.id} p={p} />)}
    </div>
  );
}

export function Prateleira({ titulo, subtitulo, produtos, verMais }: { titulo: string; subtitulo?: string; produtos: ProdutoCard[]; verMais?: string }) {
  if (!produtos.length) return null;
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{titulo}</h2>
          {subtitulo && <p className="text-sm text-slate-500">{subtitulo}</p>}
        </div>
        {verMais && <Link href={verMais} className="link shrink-0 text-sm">Ver todos →</Link>}
      </div>
      <div className="sem-barra -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {produtos.map((p) => <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23.5%] xl:w-[19%]"><CardProduto p={p} /></div>)}
      </div>
    </section>
  );
}
