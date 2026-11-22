import Link from 'next/link';
import { connection } from 'next/server';
import { buscar, ORDENS, type FiltrosBusca, type Ordem } from '@/server/catalogo';
import { GradeProdutos } from './CardProduto';
import { Paginacao, Vazio, BotaoLink, cx } from '@/components/ui';
import { REGRAS } from '@/lib/dominio';
import { menuCategorias } from './Cabecalho';
import type { Classificacao } from '@/generated/prisma/enums';

type SP = Record<string, string | string[] | undefined>;
const lista = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(',') : []).filter(Boolean);

export function filtrosDeParams(sp: SP, categoria?: string): FiltrosBusca {
  const n = (v: unknown) => (v ? Math.round(Number(v) * 100) || undefined : undefined);
  const ordem = String(sp.ordem ?? '') as Ordem;
  return {
    q: typeof sp.q === 'string' ? sp.q.slice(0, 80) : undefined,
    categoria: categoria ?? (typeof sp.categoria === 'string' ? sp.categoria : undefined),
    marcas: lista(sp.marca),
    classificacoes: lista(sp.tipo).filter((c): c is Classificacao => c in REGRAS),
    generico: sp.generico === '1',
    emEstoque: sp.estoque === '1',
    precoMin: n(sp.min),
    precoMax: n(sp.max),
    ordem: ordem in ORDENS ? ordem : 'relevancia',
    pagina: Number(sp.pagina) || 1,
  };
}

function urlCom(base: string, sp: SP, mudar: Record<string, string | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && v) u.set(k, v);
  for (const [k, v] of Object.entries(mudar)) { if (v === null || v === '') u.delete(k); else u.set(k, v); }
  if (!('pagina' in mudar)) u.delete('pagina');
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

const alternar = (atual: string[], v: string) => (atual.includes(v) ? atual.filter((x) => x !== v) : [...atual, v]).join(',');

export async function ResultadoBusca({ base, sp, categoriaSlug, titulo }: { base: string; sp: SP; categoriaSlug?: string; titulo?: string }) {
  await connection();
  const f = filtrosDeParams(sp, categoriaSlug);
  const [r, cats] = await Promise.all([buscar(f), menuCategorias()]);
  const marcasSel = f.marcas ?? [];
  const tiposSel = (f.classificacoes ?? []) as string[];
  const cat = r.categoria;
  const tituloFinal = titulo ?? (cat ? cat.nome : f.q ? `Resultados para “${f.q}”` : 'Todos os produtos');
  const temFiltro = marcasSel.length || tiposSel.length || f.generico || f.emEstoque || f.precoMin || f.precoMax;

  return (
    <div className="container-loja py-6">
      <nav className="mb-3 text-sm text-slate-500" aria-label="Trilha">
        <Link href="/" className="hover:text-marca-700">Início</Link>
        {cat?.pai && <> › <Link href={`/categoria/${cat.pai.slug}`} className="hover:text-marca-700">{cat.pai.nome}</Link></>}
        {cat && <> › <span className="text-slate-800">{cat.nome}</span></>}
      </nav>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tituloFinal}</h1>
          <p className="text-sm text-slate-500">{r.total} produto(s)</p>
        </div>
        <form action={base} className="flex items-center gap-2 text-sm">
          {Object.entries(sp).filter(([k, v]) => k !== 'ordem' && k !== 'pagina' && typeof v === 'string').map(([k, v]) => <input key={k} type="hidden" name={k} value={v as string} />)}
          <label htmlFor="ordem" className="text-slate-500">Ordenar por</label>
          <select id="ordem" name="ordem" defaultValue={f.ordem} className="campo w-auto py-2">
            {Object.entries(ORDENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="rounded-xl bg-slate-900 px-3 py-2 font-semibold text-white">OK</button>
        </form>
      </div>

      {cat && cat.filhas.length > 0 && (
        <div className="sem-barra mb-5 flex gap-2 overflow-x-auto">
          {cat.filhas.map((c) => <Link key={c.id} href={`/categoria/${c.slug}`} className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:border-marca-400 hover:text-marca-800">{c.icone} {c.nome}</Link>)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <details className="cartao p-4 lg:open:block" open>
            <summary className="cursor-pointer text-sm font-semibold lg:cursor-default">Filtros {temFiltro ? <Link href={urlCom(base, { q: f.q, ordem: sp.ordem as string }, {})} className="ml-2 text-xs font-normal text-marca-700">limpar</Link> : null}</summary>
            <div className="mt-4 space-y-5 text-sm">
              {!categoriaSlug && (
                <div>
                  <h3 className="mb-2 font-semibold text-slate-800">Categorias</h3>
                  <ul className="space-y-1">
                    {cats.map((c) => <li key={c.id}><Link href={urlCom(`/categoria/${c.slug}`, { q: f.q }, {})} className="text-slate-600 hover:text-marca-700">{c.icone} {c.nome}</Link></li>)}
                  </ul>
                </div>
              )}
              <div className="space-y-1.5">
                <Link href={urlCom(base, sp, { estoque: f.emEstoque ? null : '1' })} className="flex items-center gap-2 text-slate-700"><Caixa marcada={!!f.emEstoque} /> Somente disponíveis</Link>
                <Link href={urlCom(base, sp, { generico: f.generico ? null : '1' })} className="flex items-center gap-2 text-slate-700"><Caixa marcada={!!f.generico} /> Somente genéricos</Link>
              </div>
              {r.facetas.marcas.length > 0 && (
                <div>
                  <h3 className="mb-2 font-semibold text-slate-800">Marca</h3>
                  <ul className="max-h-60 space-y-1.5 overflow-y-auto">
                    {r.facetas.marcas.map((m) => (
                      <li key={m.slug}><Link href={urlCom(base, sp, { marca: alternar(marcasSel, m.slug) || null })} className="flex items-center gap-2 text-slate-700"><Caixa marcada={marcasSel.includes(m.slug)} /> {m.nome} <span className="text-slate-400">({m.total})</span></Link></li>
                    ))}
                  </ul>
                </div>
              )}
              {r.facetas.classificacoes.length > 1 && (
                <div>
                  <h3 className="mb-2 font-semibold text-slate-800">Tipo de produto</h3>
                  <ul className="space-y-1.5">
                    {r.facetas.classificacoes.map((c) => (
                      <li key={c.valor}><Link href={urlCom(base, sp, { tipo: alternar(tiposSel, c.valor) || null })} className="flex items-center gap-2 text-slate-700"><Caixa marcada={tiposSel.includes(c.valor)} /> {REGRAS[c.valor].curto} <span className="text-slate-400">({c.total})</span></Link></li>
                    ))}
                  </ul>
                </div>
              )}
              <form action={base} className="space-y-2">
                {Object.entries(sp).filter(([k, v]) => !['min', 'max', 'pagina'].includes(k) && typeof v === 'string').map(([k, v]) => <input key={k} type="hidden" name={k} value={v as string} />)}
                <h3 className="font-semibold text-slate-800">Preço (R$)</h3>
                <div className="flex gap-2">
                  <input name="min" type="number" min={0} step="0.01" placeholder="Mín." defaultValue={f.precoMin ? f.precoMin / 100 : ''} className="campo py-2" />
                  <input name="max" type="number" min={0} step="0.01" placeholder="Máx." defaultValue={f.precoMax ? f.precoMax / 100 : ''} className="campo py-2" />
                </div>
                <button className="w-full rounded-xl border border-slate-300 py-2 font-semibold hover:bg-slate-50">Aplicar</button>
              </form>
            </div>
          </details>
        </aside>
        <div>
          {r.produtos.length ? (
            <>
              <GradeProdutos produtos={r.produtos} />
              <Paginacao pagina={r.pagina} paginas={r.paginas} href={(p) => urlCom(base, sp, { pagina: String(p) })} />
            </>
          ) : (
            <Vazio icone="🔍" titulo="Nenhum produto encontrado" texto="Tente outro termo, como o princípio ativo (ex.: “paracetamol”), ou remova alguns filtros." acao={<BotaoLink href="/busca">Ver todos os produtos</BotaoLink>} />
          )}
        </div>
      </div>
    </div>
  );
}

function Caixa({ marcada }: { marcada: boolean }) {
  return <span className={cx('flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] text-white', marcada ? 'border-marca-600 bg-marca-600' : 'border-slate-300 bg-white')}>{marcada ? '✓' : ''}</span>;
}
