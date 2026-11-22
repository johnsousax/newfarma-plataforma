import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Badge, Esqueleto, TituloPagina } from '@/components/ui';
import { Icone } from '@/components/icones';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { BannerEstudio } from '@/components/admin/BannerEstudio';
import { salvarCupom, salvarPromocao, alternarMarketing, excluirBanner } from '@/app/acoes/admin';
import { brl, data } from '@/lib/formato';

export const metadata = { title: 'Promoções, cupons e banners' };

const paraInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');

type Promo = Awaited<ReturnType<typeof dados>>['promos'][number];
type Cupom = Awaited<ReturnType<typeof dados>>['cupons'][number];
type Opc = { id: string; nome: string }[];

async function dados() {
  const [cupons, promos, banners, categorias, marcas, usoCupom] = await Promise.all([
    db.cupom.findMany({ orderBy: { criadoEm: 'desc' } }),
    db.promocao.findMany({ orderBy: { fim: 'desc' }, include: { categoria: { select: { nome: true } }, marca: { select: { nome: true } } } }),
    db.banner.findMany({ orderBy: { ordem: 'asc' }, select: { id: true, titulo: true, subtitulo: true, textoBotao: true, link: true, ordem: true, ativo: true, corDe: true, corPara: true, imagemMime: true, svg: true } }),
    db.categoria.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    db.marca.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    db.pedido.groupBy({ by: ['cupomId'], where: { cupomId: { not: null }, status: { not: 'CANCELADO' } }, _sum: { descontoCupom: true, total: true } }),
  ]);
  return { cupons, promos, banners, categorias, marcas, usoCupom };
}

function CamposPromocao({ p, categorias, marcas }: { p?: Promo; categorias: Opc; marcas: Opc }) {
  const agora = new Date();
  return (
    <FormAcao acao={salvarPromocao} rotulo={p ? 'Salvar alterações' : 'Criar promoção'} className="grid gap-3 md:grid-cols-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label className="md:col-span-2"><span className="rotulo">Nome</span><input name="nome" defaultValue={p?.nome} required className="campo" /></label>
      <label><span className="rotulo">Tipo</span><select name="tipo" defaultValue={p?.tipo ?? 'PERCENTUAL'} className="campo"><option value="PERCENTUAL">% de desconto</option><option value="LEVE_PAGUE">Leve X pague Y</option></select></label>
      <label><span className="rotulo">% (se percentual)</span><input name="percentual" type="number" min={1} max={80} defaultValue={p?.percentual ?? ''} className="campo" /></label>
      <label><span className="rotulo">Leve</span><input name="leve" type="number" min={2} defaultValue={p?.leve ?? ''} className="campo" /></label>
      <label><span className="rotulo">Pague</span><input name="pague" type="number" min={1} defaultValue={p?.pague ?? ''} className="campo" /></label>
      <label><span className="rotulo">Aplicar em</span><select name="alvo" defaultValue={p?.marcaId ? 'marca' : 'categoria'} className="campo"><option value="categoria">Categoria</option><option value="marca">Marca</option></select></label>
      <label><span className="rotulo">Categoria</span><select name="categoriaId" defaultValue={p?.categoriaId ?? ''} className="campo">{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label><span className="rotulo">Marca</span><select name="marcaId" defaultValue={p?.marcaId ?? ''} className="campo">{marcas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label><span className="rotulo">Início</span><input name="inicio" type="datetime-local" required defaultValue={paraInput(p?.inicio ?? agora)} className="campo" /></label>
      <label><span className="rotulo">Fim</span><input name="fim" type="datetime-local" required defaultValue={p ? paraInput(p.fim) : ''} className="campo" /></label>
    </FormAcao>
  );
}

function CamposCupom({ c }: { c?: Cupom }) {
  return (
    <FormAcao acao={salvarCupom} rotulo={c ? 'Salvar alterações' : 'Criar cupom'} className="grid gap-3 md:grid-cols-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <label><span className="rotulo">Código</span><input name="codigo" defaultValue={c?.codigo} required className="campo uppercase" /></label>
      <label className="md:col-span-3"><span className="rotulo">Descrição</span><input name="descricao" defaultValue={c?.descricao} required className="campo" /></label>
      <label><span className="rotulo">Tipo</span><select name="tipo" defaultValue={c?.tipo ?? 'PERCENTUAL'} className="campo"><option value="PERCENTUAL">Percentual</option><option value="VALOR_FIXO">Valor fixo</option><option value="FRETE_GRATIS">Frete grátis</option></select></label>
      <label><span className="rotulo">Valor (% ou R$)</span><input name="valor" defaultValue={c ? (c.tipo === 'VALOR_FIXO' ? reais(c.valor) : String(c.valor)) : ''} className="campo" /></label>
      <label><span className="rotulo">Pedido mínimo (R$)</span><input name="minimoPedido" defaultValue={c ? reais(c.minimoPedido) : ''} className="campo" /></label>
      <label><span className="rotulo">Usos totais (vazio = ilimitado)</span><input name="usoMaximo" type="number" min={1} defaultValue={c?.usoMaximo ?? ''} className="campo" /></label>
      <label><span className="rotulo">Usos por cliente</span><input name="usoPorCliente" type="number" min={1} defaultValue={c?.usoPorCliente ?? 1} className="campo" /></label>
      <label><span className="rotulo">Válido até</span><input name="fim" type="date" defaultValue={c?.fim ? c.fim.toISOString().slice(0, 10) : ''} className="campo" /></label>
      <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="primeiraCompra" defaultChecked={c?.primeiraCompra} className="h-4 w-4 accent-marca-600" />Só primeira compra</label>
    </FormAcao>
  );
}

const Novo = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <details className="cartao p-5"><summary className="flex cursor-pointer items-center gap-2 font-semibold text-marca-700"><Icone nome="mais" />{rotulo}</summary><div className="mt-4">{children}</div></details>
);

async function Conteudo() {
  await connection();
  await paginaAdmin('marketing');
  const { cupons, promos, banners, categorias, marcas, usoCupom } = await dados();
  const agora = new Date();
  const uso = new Map(usoCupom.map((u) => [u.cupomId, u._sum]));
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Banners da página inicial</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {banners.map((b) => (
            <article key={b.id} className={`cartao overflow-hidden ${b.ativo ? '' : 'opacity-50'}`}>
              {b.imagemMime || b.svg
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/banners/${b.id}?v=${(b.svg?.length ?? 0) + (b.imagemMime ? 1 : 0)}${b.titulo.length}`} alt={b.titulo} className="aspect-[16/5] w-full object-cover" />
                : <div className="flex aspect-[16/5] items-center px-6 text-white" style={{ background: `linear-gradient(120deg, ${b.corDe}, ${b.corPara})` }}><p className="text-xl font-extrabold">{b.titulo}</p></div>}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="text-slate-600">{b.link} · ordem {b.ordem} · {b.imagemMime ? 'imagem enviada' : b.svg ? 'arte criada com IA' : 'arte padrão'}</span>
                <span className="flex gap-2">
                  <BotaoAcao acao={alternarMarketing.bind(null, 'banner', b.id)}>{b.ativo ? 'Ocultar' : 'Exibir'}</BotaoAcao>
                  <BotaoAcao variante="perigo" confirmar="Excluir este banner?" acao={excluirBanner.bind(null, b.id)}><Icone nome="excluir" /></BotaoAcao>
                </span>
              </div>
              <details className="border-t border-slate-100 p-4"><summary className="cursor-pointer text-sm font-semibold text-marca-700">Editar</summary><div className="mt-4"><BannerEstudio banner={{ ...b, temArte: !!(b.imagemMime || b.svg) }} /></div></details>
            </article>
          ))}
        </div>
        <Novo rotulo="Novo banner"><BannerEstudio /></Novo>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Promoções</h2>
        <div className="space-y-2">
          {promos.map((p) => {
            const vigente = p.ativa && p.inicio <= agora && p.fim >= agora;
            return (
              <details key={p.id} className="cartao">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4">
                  <span><strong>{p.nome}</strong><span className="block text-sm text-slate-500">{p.tipo === 'PERCENTUAL' ? `${p.percentual}% OFF` : `Leve ${p.leve} pague ${p.pague}`} · {p.categoria ? `Categoria ${p.categoria.nome}` : p.marca ? `Marca ${p.marca.nome}` : 'Produtos selecionados'} · {data(p.inicio)} a {data(p.fim)}</span></span>
                  <span className="flex items-center gap-2"><Badge cor={vigente ? 'emerald' : 'slate'}>{vigente ? 'No ar' : p.ativa ? 'Fora da vigência' : 'Pausada'}</Badge><BotaoAcao acao={alternarMarketing.bind(null, 'promocao', p.id)}>{p.ativa ? 'Pausar' : 'Ativar'}</BotaoAcao></span>
                </summary>
                <div className="border-t border-slate-100 p-4"><CamposPromocao p={p} categorias={categorias} marcas={marcas} /></div>
              </details>
            );
          })}
        </div>
        <Novo rotulo="Nova promoção"><CamposPromocao categorias={categorias} marcas={marcas} /></Novo>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Cupons</h2>
        <div className="space-y-2">
          {cupons.map((c) => (
            <details key={c.id} className={`cartao ${c.ativo ? '' : 'opacity-60'}`}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4">
                <span><strong className="font-mono">{c.codigo}</strong> <span className="text-sm text-slate-600">· {c.tipo === 'PERCENTUAL' ? `${c.valor}%` : c.tipo === 'VALOR_FIXO' ? brl(c.valor) : 'Frete grátis'} · {c.descricao}</span><span className="block text-xs text-slate-500">{c.usos}{c.usoMaximo ? `/${c.usoMaximo}` : ''} usos · desconto dado {brl(uso.get(c.id)?.descontoCupom ?? 0)} · vendas {brl(uso.get(c.id)?.total ?? 0)}</span></span>
                <BotaoAcao acao={alternarMarketing.bind(null, 'cupom', c.id)}>{c.ativo ? 'Desativar' : 'Ativar'}</BotaoAcao>
              </summary>
              <div className="border-t border-slate-100 p-4"><CamposCupom c={c} /></div>
            </details>
          ))}
        </div>
        <Novo rotulo="Novo cupom"><CamposCupom /></Novo>
      </section>
    </div>
  );
}

export default function Marketing() {
  return <><TituloPagina titulo="Promoções, cupons e banners" subtitulo="Tudo pode ser editado mesmo depois de publicado" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
