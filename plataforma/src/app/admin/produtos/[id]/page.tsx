import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Aviso, Esqueleto, TituloPagina } from '@/components/ui';
import { FormProduto } from '@/components/admin/FormProduto';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { enviarFotosProduto, removerFotoProduto, tornarFotoPrincipal } from '@/app/acoes/admin';
import { brl, dataHora } from '@/lib/formato';

async function Conteudo({ params, searchParams }: PageProps<'/admin/produtos/[id]'>) {
  await connection();
  await paginaAdmin('produtos');
  const { id } = await params;
  const sp = await searchParams;
  const [marcas, categorias] = await Promise.all([
    db.marca.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    db.categoria.findMany({ orderBy: [{ paiId: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true, pai: { select: { nome: true } } } }),
  ]);
  const cats = categorias.map((c) => ({ id: c.id, nome: c.pai ? `${c.pai.nome} › ${c.nome}` : c.nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  if (id === 'novo') return <><TituloPagina titulo="Novo produto" /><FormProduto marcas={marcas} categorias={cats} /></>;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const p = await db.produto.findUnique({ where: { id }, include: { historicoPreco: { orderBy: { criadoEm: 'desc' }, take: 10 }, imagens: { select: { id: true, tamanho: true }, orderBy: { ordem: 'asc' } } } });
  if (!p) notFound();
  return (
    <>
      <TituloPagina titulo={p.nome} subtitulo={<><Link href={`/produto/${p.slug}`} className="link" target="_blank">Ver na loja ↗</Link> · <Link href={`/admin/estoque?produto=${p.id}`} className="link">Estoque e lotes</Link></>} />
      {sp.salvo && <Aviso tipo="sucesso" className="mb-4">Produto salvo.</Aviso>}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <FormProduto produto={p} marcas={marcas} categorias={cats} />
        <aside className="space-y-4">
        <div className="cartao p-5 text-sm">
          <h2 className="mb-3 font-semibold">Fotos ({p.imagens.length}/8)</h2>
          <div className="grid grid-cols-3 gap-2">
            {p.imagens.map((img, i) => (
              <div key={img.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/imagens/${img.id}`} alt="" className={`aspect-square w-full rounded-lg border object-contain ${i === 0 ? 'border-marca-600' : 'border-slate-200'}`} />
                <div className="flex flex-wrap gap-1">
                  {i > 0 && <BotaoAcao variante="fantasma" acao={tornarFotoPrincipal.bind(null, img.id)}>Principal</BotaoAcao>}
                  <BotaoAcao variante="perigo" confirmar="Remover foto?" acao={removerFotoProduto.bind(null, img.id)}>✕</BotaoAcao>
                </div>
              </div>
            ))}
          </div>
          <FormAcao acao={enviarFotosProduto} rotulo="Enviar fotos" className="mt-3 space-y-2">
            <input type="hidden" name="produtoId" value={p.id} />
            <input type="file" name="fotos" multiple accept="image/jpeg,image/png,image/webp" className="campo text-xs" />
            <p className="text-xs text-slate-500">JPG, PNG ou WEBP até 2 MB. Fundo branco, produto centralizado. A primeira é a principal.</p>
          </FormAcao>
        </div>
        <div className="cartao h-fit p-5 text-sm">
          <h2 className="mb-3 font-semibold">Histórico de preço</h2>
          {p.historicoPreco.length ? <ul className="space-y-2">{p.historicoPreco.map((h) => <li key={h.id}><strong>{brl(h.precoAnterior)} → {brl(h.precoNovo)}</strong><span className="block text-xs text-slate-500">{dataHora(h.criadoEm)}{h.motivo ? ` · ${h.motivo}` : ''}</span></li>)}</ul> : <p className="text-slate-500">Sem alterações registradas.</p>}
        </div>
        </aside>
      </div>
    </>
  );
}

export default function EditarProduto(props: PageProps<'/admin/produtos/[id]'>) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo {...props} /></Suspense>;
}
