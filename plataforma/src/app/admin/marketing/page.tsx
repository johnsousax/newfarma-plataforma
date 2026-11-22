import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Badge, Esqueleto, TituloPagina } from '@/components/ui';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { salvarCupom, salvarPromocao, salvarBanner, alternarMarketing } from '@/app/acoes/admin';
import { brl, data } from '@/lib/formato';

export const metadata = { title: 'Promoções e cupons' };

async function Conteudo() {
  await connection();
  await paginaAdmin('marketing');
  const [cupons, promos, banners, categorias, marcas, usoCupom] = await Promise.all([
    db.cupom.findMany({ orderBy: { criadoEm: 'desc' } }),
    db.promocao.findMany({ orderBy: { fim: 'desc' }, include: { categoria: { select: { nome: true } }, marca: { select: { nome: true } } } }),
    db.banner.findMany({ orderBy: { ordem: 'asc' } }),
    db.categoria.findMany({ orderBy: { nome: 'asc' } }),
    db.marca.findMany({ orderBy: { nome: 'asc' } }),
    db.pedido.groupBy({ by: ['cupomId'], where: { cupomId: { not: null }, status: { not: 'CANCELADO' } }, _sum: { descontoCupom: true, total: true } }),
  ]);
  const agora = new Date();
  const uso = new Map(usoCupom.map((u) => [u.cupomId, u._sum]));
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Promoções</h2>
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Nome</th><th>Regra</th><th>Aplica em</th><th>Vigência</th><th>Status</th><th /></tr></thead>
            <tbody>{promos.map((p) => {
              const vigente = p.ativa && p.inicio <= agora && p.fim >= agora;
              return <tr key={p.id}><td className="font-medium">{p.nome}</td><td>{p.tipo === 'PERCENTUAL' ? `${p.percentual}% OFF` : `Leve ${p.leve} pague ${p.pague}`}</td><td>{p.categoria ? `Categoria ${p.categoria.nome}` : p.marca ? `Marca ${p.marca.nome}` : 'Produtos selecionados'}</td><td>{data(p.inicio)} – {data(p.fim)}</td><td><Badge cor={vigente ? 'emerald' : 'slate'}>{vigente ? 'No ar' : p.ativa ? 'Fora da vigência' : 'Pausada'}</Badge></td><td><BotaoAcao acao={alternarMarketing.bind(null, 'promocao', p.id)}>{p.ativa ? 'Pausar' : 'Ativar'}</BotaoAcao></td></tr>;
            })}</tbody>
          </table>
        </div>
        <details className="cartao p-5"><summary className="cursor-pointer font-semibold">+ Nova promoção</summary>
          <FormAcao acao={salvarPromocao} rotulo="Criar promoção" className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="md:col-span-2"><span className="rotulo">Nome</span><input name="nome" required className="campo" /></label>
            <label><span className="rotulo">Tipo</span><select name="tipo" className="campo"><option value="PERCENTUAL">% de desconto</option><option value="LEVE_PAGUE">Leve X pague Y</option></select></label>
            <label><span className="rotulo">% (se percentual)</span><input name="percentual" type="number" min={1} max={80} className="campo" /></label>
            <label><span className="rotulo">Leve</span><input name="leve" type="number" min={2} className="campo" /></label>
            <label><span className="rotulo">Pague</span><input name="pague" type="number" min={1} className="campo" /></label>
            <label><span className="rotulo">Aplicar em</span><select name="alvo" className="campo"><option value="categoria">Categoria</option><option value="marca">Marca</option></select></label>
            <label><span className="rotulo">Categoria</span><select name="categoriaId" className="campo">{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
            <label><span className="rotulo">Marca</span><select name="marcaId" className="campo">{marcas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
            <label><span className="rotulo">Início</span><input name="inicio" type="datetime-local" required className="campo" /></label>
            <label><span className="rotulo">Fim</span><input name="fim" type="datetime-local" required className="campo" /></label>
          </FormAcao>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Cupons</h2>
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Código</th><th>Benefício</th><th>Regras</th><th className="text-right">Usos</th><th className="text-right">Desconto dado</th><th className="text-right">Vendas geradas</th><th /></tr></thead>
            <tbody>{cupons.map((c) => <tr key={c.id} className={c.ativo ? '' : 'opacity-50'}><td className="font-mono font-bold">{c.codigo}</td><td>{c.tipo === 'PERCENTUAL' ? `${c.valor}%` : c.tipo === 'VALOR_FIXO' ? brl(c.valor) : 'Frete grátis'}<span className="block text-xs text-slate-500">{c.descricao}</span></td><td className="text-xs">{c.minimoPedido ? `mín. ${brl(c.minimoPedido)} · ` : ''}{c.usoPorCliente}x/cliente{c.primeiraCompra ? ' · 1ª compra' : ''}{c.fim ? ` · até ${data(c.fim)}` : ''}</td><td className="text-right">{c.usos}{c.usoMaximo ? `/${c.usoMaximo}` : ''}</td><td className="text-right">{brl(uso.get(c.id)?.descontoCupom ?? 0)}</td><td className="text-right">{brl(uso.get(c.id)?.total ?? 0)}</td><td><BotaoAcao acao={alternarMarketing.bind(null, 'cupom', c.id)}>{c.ativo ? 'Desativar' : 'Ativar'}</BotaoAcao></td></tr>)}</tbody>
          </table>
        </div>
        <details className="cartao p-5"><summary className="cursor-pointer font-semibold">+ Novo cupom</summary>
          <FormAcao acao={salvarCupom} rotulo="Criar cupom" className="mt-4 grid gap-3 md:grid-cols-4">
            <label><span className="rotulo">Código</span><input name="codigo" required className="campo uppercase" /></label>
            <label className="md:col-span-3"><span className="rotulo">Descrição</span><input name="descricao" required className="campo" /></label>
            <label><span className="rotulo">Tipo</span><select name="tipo" className="campo"><option value="PERCENTUAL">Percentual</option><option value="VALOR_FIXO">Valor fixo</option><option value="FRETE_GRATIS">Frete grátis</option></select></label>
            <label><span className="rotulo">Valor (% ou R$)</span><input name="valor" className="campo" /></label>
            <label><span className="rotulo">Pedido mínimo (R$)</span><input name="minimoPedido" className="campo" /></label>
            <label><span className="rotulo">Usos totais (vazio = ilimitado)</span><input name="usoMaximo" type="number" min={1} className="campo" /></label>
            <label><span className="rotulo">Usos por cliente</span><input name="usoPorCliente" type="number" min={1} defaultValue={1} className="campo" /></label>
            <label><span className="rotulo">Válido até</span><input name="fim" type="date" className="campo" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="primeiraCompra" /> Só primeira compra</label>
          </FormAcao>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Banners da home</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {banners.map((b) => (
            <div key={b.id} className={`flex items-center justify-between gap-3 rounded-2xl p-4 text-white ${b.ativo ? '' : 'opacity-40'}`} style={{ background: `linear-gradient(120deg, ${b.corDe}, ${b.corPara})` }}>
              <div><p className="font-bold">{b.titulo}</p><p className="text-xs text-white/80">{b.link} · ordem {b.ordem}</p></div>
              <BotaoAcao acao={alternarMarketing.bind(null, 'banner', b.id)}>{b.ativo ? 'Ocultar' : 'Exibir'}</BotaoAcao>
            </div>
          ))}
        </div>
        <details className="cartao p-5"><summary className="cursor-pointer font-semibold">+ Novo banner</summary>
          <FormAcao acao={salvarBanner} rotulo="Publicar banner" className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="md:col-span-2"><span className="rotulo">Título</span><input name="titulo" required className="campo" /></label>
            <label className="md:col-span-2"><span className="rotulo">Subtítulo</span><input name="subtitulo" className="campo" /></label>
            <label><span className="rotulo">Texto do botão</span><input name="textoBotao" defaultValue="Aproveitar" className="campo" /></label>
            <label><span className="rotulo">Link</span><input name="link" defaultValue="/ofertas" className="campo" /></label>
            <input type="hidden" name="icone" value="" />
            <label><span className="rotulo">Ordem</span><input name="ordem" type="number" defaultValue={9} className="campo" /></label>
            <label><span className="rotulo">Cor inicial</span><input name="corDe" type="color" defaultValue="#088372" className="h-11 w-full rounded-xl" /></label>
            <label><span className="rotulo">Cor final</span><input name="corPara" type="color" defaultValue="#27bfa6" className="h-11 w-full rounded-xl" /></label>
          </FormAcao>
        </details>
      </section>
    </div>
  );
}

export default function Marketing() {
  return <><TituloPagina titulo="Promoções, cupons e banners" subtitulo="Tudo o que aparece na vitrine e no carrinho" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
