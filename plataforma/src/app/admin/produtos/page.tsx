import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { disponibilidade } from '@/server/estoque';
import { Badge, BotaoLink, Esqueleto, Paginacao, SeloClassificacao, TituloPagina } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { alternarProdutoAtivo } from '@/app/acoes/admin';
import { BiparCodigo } from '@/components/admin/BiparCodigo';
import { brl } from '@/lib/formato';
import { normalizar } from '@/lib/texto';
import type { Prisma } from '@/generated/prisma/client';

export const metadata = { title: 'Produtos' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/admin/produtos'>['searchParams'] }) {
  await connection();
  await paginaAdmin('produtos');
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const where: Prisma.ProdutoWhereInput = { ...(q ? { OR: [{ busca: { contains: normalizar(q) } }, { sku: q.toUpperCase() }, { ean: q }] } : {}), ...(sp.inativos ? { ativo: false } : {}) };
  const [total, produtos] = await Promise.all([
    db.produto.count({ where }),
    db.produto.findMany({ where, orderBy: { nome: 'asc' }, skip: (pagina - 1) * 40, take: 40, include: { marca: { select: { nome: true } }, categoria: { select: { nome: true } } } }),
  ]);
  const disp = await disponibilidade(produtos.map((p) => p.id));
  // Pendências regulatórias: medicamento ativo sem registro MS, sem PMC ou com preço acima do PMC (CMED)
  const pendencias = await db.$queryRaw<{ id: string; nome: string; motivo: string }[]>`
    SELECT id, nome, CASE WHEN "registroAnvisa" IS NULL OR length(regexp_replace("registroAnvisa", '\D', '', 'g')) <> 13 THEN 'sem registro MS (13 dígitos)'
      WHEN pmc IS NULL THEN 'sem PMC (CMED)' ELSE 'preço acima do PMC' END AS motivo
    FROM "Produto" WHERE ativo AND classificacao <> 'NAO_MEDICAMENTO'
      AND ("registroAnvisa" IS NULL OR length(regexp_replace("registroAnvisa", '\D', '', 'g')) <> 13 OR pmc IS NULL OR preco > pmc)
    ORDER BY nome LIMIT 50`;
  return (
    <>
      {pendencias.length > 0 && (
        <details className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-amber-900">{pendencias.length}{pendencias.length === 50 ? '+' : ''} medicamento(s) com pendência regulatória (registro MS / PMC da CMED)</summary>
          <ul className="mt-2 space-y-1">{pendencias.map((x) => <li key={x.id}><Link href={`/admin/produtos/${x.id}`} className="hover:underline">{x.nome}</Link> — <span className="text-amber-800">{x.motivo}</span></li>)}</ul>
          <p className="mt-2 text-xs text-amber-800">Medicamento não pode ser vendido acima do PMC. Ao salvar o produto, o sistema exige registro e PMC e bloqueia preço acima do teto.</p>
        </details>
      )}
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Nome, princípio ativo, SKU ou EAN" className="campo max-w-sm" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inativos" value="1" defaultChecked={!!sp.inativos} /> Só inativos</label>
        <button className="rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Buscar</button>
      </form>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Produto</th><th>Classificação</th><th>Categoria</th><th className="text-right">Preço</th><th className="text-right">Margem</th><th className="text-right">Estoque (rede)</th><th className="text-right">Vendas</th><th /></tr></thead>
          <tbody>
            {produtos.map((p) => {
              const margem = p.custo ? ((p.preco - p.custo) / p.preco) * 100 : null;
              const d = disp.get(p.id) ?? 0;
              return (
                <tr key={p.id} className={p.ativo ? '' : 'opacity-50'}>
                  <td><Link href={`/admin/produtos/${p.id}`} className="font-medium hover:text-marca-700">{p.nome}</Link><span className="block text-xs text-slate-500">{p.sku} · {p.marca.nome}</span></td>
                  <td><SeloClassificacao c={p.classificacao} />{p.classificacao === 'NAO_MEDICAMENTO' && <Badge>Livre</Badge>}</td>
                  <td>{p.categoria.nome}</td>
                  <td className="text-right font-semibold">{brl(p.preco)}{p.pmc && <span className="block text-xs font-normal text-slate-500">PMC {brl(p.pmc)}</span>}</td>
                  <td className={`text-right ${margem != null && margem < 20 ? 'text-rose-700' : ''}`}>{margem != null ? `${margem.toFixed(0)}%` : '—'}</td>
                  <td className={`text-right ${d < p.estoqueMinimo ? 'font-semibold text-amber-700' : ''}`}>{d}</td>
                  <td className="text-right">{p.vendas}</td>
                  <td className="text-right"><BotaoAcao acao={alternarProdutoAtivo.bind(null, p.id)}>{p.ativo ? 'Desativar' : 'Ativar'}</BotaoAcao></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginacao pagina={pagina} paginas={Math.ceil(total / 40)} href={(n) => `/admin/produtos?q=${encodeURIComponent(q)}&pagina=${n}${sp.inativos ? '&inativos=1' : ''}`} />
    </>
  );
}

export default function Produtos(props: PageProps<'/admin/produtos'>) {
  return <><TituloPagina titulo="Produtos e preços" subtitulo="Catálogo, classificação sanitária, preços (CMED) e margens" acoes={<div className="flex flex-wrap items-center gap-2"><BiparCodigo /><BotaoLink href="/admin/produtos/novo">+ Novo produto</BotaoLink></div>} /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
