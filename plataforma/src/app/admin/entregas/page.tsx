import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { matrizPermissoes } from '@/server/permissoes';
import { configuracoes, linkWhatsPara } from '@/server/configuracoes';
import { repasses } from '@/server/entregas';
import { Badge, Esqueleto, TituloPagina, Vazio, cx } from '@/components/ui';
import { Icone } from '@/components/icones';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { DespacharPedido } from '@/components/admin/Despacho';
import { salvarZonaAcao, excluirZonaAcao, salvarLocalLojaAcao, salvarMotoboyAcao, novoLinkMotoboyAcao, salvarConfiguracaoAcao } from '@/app/acoes/admin';
import { linhaEndereco, linkMapa, type EnderecoPedido } from '@/lib/endereco';
import { brl, dataHora } from '@/lib/formato';
import { minutosDesde } from '@/lib/tempo';
import { pode } from '@/lib/dominio';
import { lerPeriodo } from '@/lib/periodo';
import { FiltroPeriodo } from '@/components/FiltroPeriodo';

export const metadata = { title: 'Entregas' };

type SP = Promise<Record<string, string | string[] | undefined>>;
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const ABAS = [
  { id: 'despacho', rotulo: 'Despacho', icone: 'rota' },
  { id: 'motoboys', rotulo: 'Motoboys', icone: 'motoboy' },
  { id: 'bairros', rotulo: 'Bairros e taxas', icone: 'mapa' },
] as const;

async function Despacho() {
  const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
  const sel = { id: true, numero: true, status: true, total: true, frete: true, criadoEm: true, despachadoEm: true, entregueEm: true, enderecoEntrega: true, previsaoEntrega: true, motoboyId: true, motoboy: { select: { nome: true } }, usuario: { select: { nome: true, telefone: true } }, _count: { select: { itens: true } } } as const;
  const [pedidos, entregues, motoboys] = await Promise.all([
    db.pedido.findMany({ where: { modalidade: { not: 'RETIRADA' }, status: { in: ['PAGO', 'EM_SEPARACAO', 'SAIU_PARA_ENTREGA'] } }, orderBy: { criadoEm: 'asc' }, select: sel }),
    db.pedido.findMany({ where: { modalidade: { not: 'RETIRADA' }, status: 'ENTREGUE', entregueEm: { gte: inicioDia } }, orderBy: { entregueEm: 'desc' }, take: 30, select: sel }),
    db.motoboy.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ]);
  const colunas = [
    { titulo: 'Aguardando separação', dica: 'Pagos. Separe no pedido para liberar o despacho.', lista: pedidos.filter((p) => p.status === 'PAGO') },
    { titulo: 'Prontos para sair', dica: 'Escolha o motoboy e despache.', lista: pedidos.filter((p) => p.status === 'EM_SEPARACAO') },
    { titulo: 'Em rota', dica: 'O motoboy confirma a entrega pelo link dele.', lista: pedidos.filter((p) => p.status === 'SAIU_PARA_ENTREGA') },
    { titulo: 'Entregues hoje', dica: '', lista: entregues },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
      {colunas.map((c) => (
        <section key={c.titulo} className="space-y-2 rounded-2xl bg-slate-100/70 p-3">
          <h2 className="flex items-center justify-between px-1 text-sm font-bold text-slate-700">{c.titulo}<span className="rounded-full bg-white px-2 text-xs">{c.lista.length}</span></h2>
          {c.dica && <p className="px-1 text-xs text-slate-500">{c.dica}</p>}
          {c.lista.map((p) => {
            const e = p.enderecoEntrega as EnderecoPedido | null;
            const atraso = p.previsaoEntrega && p.status !== 'ENTREGUE' && p.previsaoEntrega < new Date();
            return (
              <article key={p.id} className="cartao space-y-2 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Link href={`/admin/pedidos/${p.id}`} className="font-bold text-marca-700 hover:underline">#{p.numero}</Link>
                  <span className="text-xs text-slate-500">{p._count.itens} itens · {brl(p.total)}</span>
                </div>
                <p className="font-medium">{e?.bairro ?? '—'} {atraso && <Badge cor="red">Atrasado</Badge>}</p>
                <p className="text-xs text-slate-600">{linhaEndereco(e)}</p>
                <p className="text-xs text-slate-500">{p.usuario?.nome} · pedido há {minutosDesde(p.criadoEm)} min</p>
                {p.motoboy && <p className="flex items-center gap-1 text-xs font-semibold text-violet-700"><Icone nome="motoboy" className="h-3.5 w-3.5" />{p.motoboy.nome}{p.despachadoEm && ` · saiu ${dataHora(p.despachadoEm).slice(-5)}`}</p>}
                <div className="flex flex-wrap gap-3 text-xs">
                  {linkMapa(e) && <a href={linkMapa(e)!} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1"><Icone nome="local" className="h-3.5 w-3.5" />Rota</a>}
                  {linkWhatsPara(p.usuario?.telefone, `Olá! Aqui é da farmácia, sobre o pedido #${p.numero}.`) && <a href={linkWhatsPara(p.usuario?.telefone, `Olá! Aqui é da farmácia, sobre o pedido #${p.numero}.`)!} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1"><Icone nome="whatsapp" className="h-3.5 w-3.5" />Cliente</a>}
                  <a href={`/imprimir/pedido/${p.id}`} target="_blank" className="link inline-flex items-center gap-1"><Icone nome="impressora" className="h-3.5 w-3.5" />Imprimir</a>
                </div>
                {p.status === 'EM_SEPARACAO' && <DespacharPedido pedidoId={p.id} numero={p.numero} endereco={linhaEndereco(e)} mapa={linkMapa(e)} motoboys={motoboys} />}
                {p.status === 'SAIU_PARA_ENTREGA' && <details><summary className="cursor-pointer text-xs text-slate-500">Trocar motoboy</summary><div className="mt-2"><DespacharPedido pedidoId={p.id} numero={p.numero} endereco={linhaEndereco(e)} mapa={linkMapa(e)} motoboys={motoboys} atual={p.motoboyId} rotulo="Trocar" /></div></details>}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function CamposMotoboy({ m }: { m?: { id: string; nome: string; telefone: string; veiculo: string | null; placa: string | null; taxaPorEntrega: number; ativo: boolean } }) {
  return (
    <FormAcao acao={salvarMotoboyAcao} rotulo={m ? 'Salvar' : 'Cadastrar motoboy'} className="grid gap-3 md:grid-cols-6">
      {m && <input type="hidden" name="id" value={m.id} />}
      <label className="md:col-span-2"><span className="rotulo">Nome</span><input name="nome" defaultValue={m?.nome} required className="campo" /></label>
      <label><span className="rotulo">WhatsApp (DDD)</span><input name="telefone" defaultValue={m?.telefone} required placeholder="11999990000" className="campo" /></label>
      <label><span className="rotulo">Veículo</span><input name="veiculo" defaultValue={m?.veiculo ?? ''} className="campo" /></label>
      <label><span className="rotulo">Placa</span><input name="placa" defaultValue={m?.placa ?? ''} className="campo uppercase" /></label>
      <label><span className="rotulo">Repasse por entrega (R$)</span><input name="taxaPorEntrega" defaultValue={m ? reais(m.taxaPorEntrega) : ''} className="campo" /></label>
      {m && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inativo" defaultChecked={!m.ativo} className="h-4 w-4 accent-marca-600" />Inativo</label>}
    </FormAcao>
  );
}

async function Motoboys({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const per = lerPeriodo(sp, 'mes');
  const [lista, rep, loja] = await Promise.all([
    db.motoboy.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }], include: { pedidos: { where: { status: 'SAIU_PARA_ENTREGA' }, select: { numero: true } } } }),
    repasses(per.inicio, per.fim),
    db.loja.findFirst({ where: { ativa: true, centroDistribuicao: false }, orderBy: { criadoEm: 'asc' }, select: { latitude: true, longitude: true } }),
  ]);
  return (
    <div className="space-y-4">
      <FiltroPeriodo base="/admin/entregas" atual={per.chave} de={per.de} ate={per.ate} extras={{ aba: 'motoboys' }} />
      {!lista.length && <Vazio icone="motoboy" titulo="Nenhum motoboy cadastrado" />}
      <div className="grid gap-3 lg:grid-cols-2">
        {lista.map((m) => {
          const r = rep.get(m.id);
          const min = m.posicaoEm ? minutosDesde(m.posicaoEm) : null;
          const dist = m.latitude != null && loja?.latitude != null ? distanciaKm(loja.latitude, loja.longitude!, m.latitude, m.longitude!) : null;
          return (
            <article key={m.id} className={cx('cartao space-y-3 p-4', !m.ativo && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-bold"><Icone nome="motoboy" className="h-4 w-4 text-marca-600" />{m.nome} {!m.ativo && <Badge cor="slate">Inativo</Badge>}</p>
                  <p className="text-xs text-slate-500">{[m.veiculo, m.placa].filter(Boolean).join(' · ') || 'Veículo não informado'} · repasse {brl(m.taxaPorEntrega)}/entrega</p>
                </div>
                <Badge cor={m.pedidos.length ? 'violet' : 'emerald'}>{m.pedidos.length ? `Em rota: ${m.pedidos.map((p) => `#${p.numero}`).join(', ')}` : 'Livre'}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-slate-50 p-2"><p className="text-lg font-bold">{r?.entregas ?? 0}</p>entregas · {per.rotulo.toLowerCase()}</div>
                <div className="rounded-xl bg-slate-50 p-2"><p className="text-lg font-bold">{brl(r?.repasse ?? 0)}</p>a repassar</div>
                <div className="rounded-xl bg-slate-50 p-2"><p className="text-lg font-bold">{brl(r?.fretes ?? 0)}</p>fretes cobrados</div>
              </div>
              <p className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <Icone nome="local" className="h-3.5 w-3.5" />
                {m.latitude != null ? <>Última posição há {min} min{dist != null && ` · ${dist.toFixed(1)} km da loja`} · <a className="link" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${m.latitude},${m.longitude}`}>ver no mapa</a></> : 'Sem posição ainda (o motoboy compartilha pelo link dele)'}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <a href={`/entregador/${m.token}`} target="_blank" className="link">Abrir app do entregador</a>
                <a href={linkWhatsPara(m.telefone, 'Olá! Este é o seu link de entregas da farmácia:') ?? '#'} target="_blank" rel="noopener noreferrer" className="link">WhatsApp</a>
                <BotaoAcao confirmar="Gerar um novo link? O link atual deixa de funcionar." acao={novoLinkMotoboyAcao.bind(null, m.id)}>Renovar link</BotaoAcao>
              </div>
              <details><summary className="cursor-pointer text-sm font-semibold text-marca-700">Editar</summary><div className="mt-3"><CamposMotoboy m={m} /></div></details>
            </article>
          );
        })}
      </div>
      <details className="cartao p-5"><summary className="flex cursor-pointer items-center gap-2 font-semibold text-marca-700"><Icone nome="mais" />Novo motoboy</summary><div className="mt-4"><CamposMotoboy /></div></details>
    </div>
  );
}

function distanciaKm(a: number, b: number, c: number, d: number) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

async function Bairros() {
  const [{ entrega: cfg }, loja] = await Promise.all([
    configuracoes(),
    db.loja.findFirst({ where: { ativa: true, centroDistribuicao: false }, orderBy: { criadoEm: 'asc' }, include: { zonas: { orderBy: { bairro: 'asc' } } } }),
  ]);
  if (!loja) return <Vazio icone="lojas" titulo="Cadastre a loja primeiro" />;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <section className="space-y-3">
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Bairro</th><th>Taxa</th><th>Prazo</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {loja.zonas.map((z) => (
                <tr key={z.id} className={z.ativo ? '' : 'opacity-50'}>
                  <td className="font-medium">{z.bairro}</td><td>{brl(z.taxa)}</td><td>{z.prazoMinutos} min</td>
                  <td>{z.ativo ? <Badge cor="emerald">Atende</Badge> : <Badge cor="slate">Pausado</Badge>}</td>
                  <td className="text-right">
                    <details className="inline-block text-left"><summary className="cursor-pointer text-xs text-marca-700">Editar</summary>
                      <div className="mt-2 w-[min(90vw,560px)]">
                        <FormAcao acao={salvarZonaAcao} className="grid gap-2 sm:grid-cols-4">
                          <input type="hidden" name="id" value={z.id} />
                          <input name="bairro" defaultValue={z.bairro} className="campo sm:col-span-2" aria-label="Bairro" />
                          <input name="taxa" defaultValue={reais(z.taxa)} className="campo" aria-label="Taxa" />
                          <input name="prazoMinutos" type="number" defaultValue={z.prazoMinutos} className="campo" aria-label="Prazo" />
                          <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="inativo" defaultChecked={!z.ativo} />Pausar</label>
                        </FormAcao>
                      </div>
                    </details>
                    <span className="ml-2"><BotaoAcao variante="fantasma" confirmar={`Remover ${z.bairro}?`} acao={excluirZonaAcao.bind(null, z.id)}><Icone nome="excluir" /></BotaoAcao></span>
                  </td>
                </tr>
              ))}
              {!loja.zonas.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Nenhum bairro cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="cartao p-5">
          <h3 className="mb-3 font-semibold">Adicionar bairro</h3>
          <FormAcao acao={salvarZonaAcao} rotulo="Adicionar" className="grid gap-3 sm:grid-cols-4">
            <label className="sm:col-span-2"><span className="rotulo">Bairro (como nos Correios)</span><input name="bairro" required className="campo" /></label>
            <label><span className="rotulo">Taxa (R$)</span><input name="taxa" required placeholder="7,00" className="campo" /></label>
            <label><span className="rotulo">Prazo (min)</span><input name="prazoMinutos" type="number" defaultValue={60} className="campo" /></label>
          </FormAcao>
        </div>
      </section>
      <aside className="space-y-4">
        <section className="cartao space-y-3 p-5">
          <h3 className="font-semibold">Regras de entrega</h3>
          <FormAcao acao={salvarConfiguracaoAcao.bind(null, 'entrega')} className="grid gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ativa" defaultChecked={cfg.ativa} className="h-4 w-4 accent-marca-600" />Entrega ativa no site</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="retiradaAtiva" defaultChecked={cfg.retiradaAtiva} className="h-4 w-4 accent-marca-600" />Retirada na loja</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="somenteBairrosCadastrados" defaultChecked={cfg.somenteBairrosCadastrados} className="h-4 w-4 accent-marca-600" />Entregar só nos bairros cadastrados</label>
            <label><span className="rotulo">Taxa para bairro fora da lista (R$)</span><input name="taxaPadrao" defaultValue={reais(cfg.taxaPadrao)} className="campo" /></label>
            <label><span className="rotulo">Taxa máxima por entrega (R$, 0 = sem teto)</span><input name="taxaMaxima" defaultValue={reais(cfg.taxaMaxima)} className="campo" /></label>
            <label><span className="rotulo">Pedido mínimo para entrega (R$)</span><input name="pedidoMinimo" defaultValue={reais(cfg.pedidoMinimo)} className="campo" /></label>
            <label><span className="rotulo">Frete grátis acima de (R$, 0 = nunca)</span><input name="freteGratisAcima" defaultValue={reais(cfg.freteGratisAcima)} className="campo" /></label>
            <label><span className="rotulo">Prazo padrão (min)</span><input name="prazoPadraoMinutos" type="number" defaultValue={cfg.prazoPadraoMinutos} className="campo" /></label>
          </FormAcao>
        </section>
        <section className="cartao space-y-3 p-5">
          <h3 className="flex items-center gap-2 font-semibold"><Icone nome="local" className="h-4 w-4" />Localização da loja</h3>
          <p className="text-xs text-slate-500">{loja.nome} · {loja.logradouro}, {loja.numero} — {loja.bairro}. Usada para a distância dos motoboys. Copie do Google Maps (clique com o botão direito no ponto).</p>
          <FormAcao acao={salvarLocalLojaAcao} className="grid grid-cols-2 gap-3">
            <label><span className="rotulo">Latitude</span><input name="latitude" defaultValue={loja.latitude ?? ''} className="campo" /></label>
            <label><span className="rotulo">Longitude</span><input name="longitude" defaultValue={loja.longitude ?? ''} className="campo" /></label>
          </FormAcao>
        </section>
      </aside>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: SP }) {
  await connection();
  const u = await paginaAdmin('entregas');
  const matriz = await matrizPermissoes();
  const sp = await searchParams;
  const aba = sp.aba;
  const abas = ABAS.filter((a) => a.id !== 'bairros' || pode(u.papel, 'lojas', matriz));
  const atual = abas.find((a) => a.id === aba)?.id ?? 'despacho';
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-2">
        {abas.map((a) => <Link key={a.id} href={`/admin/entregas?aba=${a.id}`} className={cx('inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm', a.id === atual ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}><Icone nome={a.icone} className="h-4 w-4" />{a.rotulo}</Link>)}
      </nav>
      {atual === 'despacho' ? <Despacho /> : atual === 'motoboys' ? <Motoboys sp={sp} /> : <Bairros />}
    </div>
  );
}

export default function Entregas(props: { searchParams: SP }) {
  return <><TituloPagina titulo="Entregas" subtitulo="Despacho, motoboys e taxas por bairro" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
