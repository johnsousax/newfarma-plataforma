import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, lojaDoUsuario } from '@/server/auth';
import { alertas } from '@/server/estoque';
import { Badge, Esqueleto, TituloPagina } from '@/components/ui';
import { FormAcao } from '@/components/admin/Acoes';
import { entradaEstoque, ajustarLote } from '@/app/acoes/admin';
import { data, dataHora } from '@/lib/formato';
import { normalizar } from '@/lib/texto';

export const metadata = { title: 'Estoque' };

const COR = { VENCIDO: 'rose', RUPTURA: 'rose', VENCENDO: 'amber', REPOSICAO: 'sky' } as const;
const ROT = { VENCIDO: 'Vencido', RUPTURA: 'Ruptura', VENCENDO: 'Vencendo', REPOSICAO: 'Repor' } as const;
const TIPO_MOV: Record<string, string> = { ENTRADA: 'Entrada', SAIDA_VENDA: 'Venda', AJUSTE_POSITIVO: 'Ajuste +', AJUSTE_NEGATIVO: 'Ajuste −', PERDA: 'Perda', RESERVA: 'Reserva', LIBERACAO: 'Liberação' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/admin/estoque'>['searchParams'] }) {
  await connection();
  const u = await paginaAdmin('estoque');
  const sp = await searchParams;
  const lojas = await db.loja.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' } });
  const fixa = lojaDoUsuario(u);
  const lojaId = fixa ?? (typeof sp.loja === 'string' && sp.loja ? sp.loja : lojas.find((l) => !l.centroDistribuicao)?.id ?? lojas[0].id);
  const aba = typeof sp.aba === 'string' ? sp.aba : 'alertas';
  const produtoId = typeof sp.produto === 'string' && /^[0-9a-f-]{36}$/.test(sp.produto) ? sp.produto : null;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const loja = lojas.find((l) => l.id === lojaId)!;
  const link = (m: Record<string, string | null>) => { const x = new URLSearchParams({ loja: lojaId, aba }); for (const [k, v] of Object.entries(m)) { if (v === null) x.delete(k); else x.set(k, v); } return `/admin/estoque?${x}`; };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {!fixa && <form className="flex gap-2"><input type="hidden" name="aba" value={aba} /><select name="loja" defaultValue={lojaId} className="campo w-auto">{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select><button className="rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">Ver</button></form>}
        {fixa && <Badge cor="marca" className="px-3 py-1 text-sm">{loja.nome}</Badge>}
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
          {[['alertas', 'Alertas'], ['posicao', 'Posição'], ['movimentos', 'Movimentações'], ['entrada', '+ Entrada']].map(([k, r]) => <Link key={k} href={link({ aba: k, produto: null })} className={`rounded-lg px-3 py-1.5 ${aba === k && !produtoId ? 'bg-slate-900 font-semibold text-white' : 'text-slate-600'}`}>{r}</Link>)}
        </div>
      </div>

      {produtoId ? <Lotes produtoId={produtoId} lojaId={lojaId} voltar={link({ produto: null })} /> :
        aba === 'posicao' ? <Posicao lojaId={lojaId} q={q} link={link} /> :
        aba === 'movimentos' ? <Movimentos lojaId={lojaId} /> :
        aba === 'entrada' ? <Entrada lojaId={lojaId} /> :
        <Alertas lojaId={lojaId} link={link} />}
    </div>
  );
}

async function Alertas({ lojaId, link }: { lojaId: string; link: (m: Record<string, string | null>) => string }) {
  const al = await alertas(lojaId);
  return (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr><th>Tipo</th><th>Produto</th><th>Detalhe</th><th className="text-right">Qtd</th><th /></tr></thead>
        <tbody>
          {al.map((a, i) => (
            <tr key={i}>
              <td><Badge cor={COR[a.tipo]}>{ROT[a.tipo]}</Badge></td>
              <td>{a.produto}<span className="block text-xs text-slate-500">{a.sku}</span></td>
              <td>{a.detalhe}</td><td className="text-right">{a.quantidade}</td>
              <td className="text-right"><Link href={link({ produto: a.produtoId })} className="link text-sm">Lotes</Link>{(a.tipo === 'RUPTURA' || a.tipo === 'REPOSICAO') && <> · <Link href={`/admin/compras/nova?loja=${lojaId}`} className="link text-sm">Comprar</Link></>}</td>
            </tr>
          ))}
          {!al.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">Tudo em ordem: nenhum alerta nesta loja. ✅</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

async function Posicao({ lojaId, q, link }: { lojaId: string; q: string; link: (m: Record<string, string | null>) => string }) {
  const produtos = await db.produto.findMany({
    where: { ativo: true, ...(q ? { busca: { contains: normalizar(q) } } : {}) }, orderBy: { nome: 'asc' }, take: 200,
    select: { id: true, nome: true, sku: true, estoqueMinimo: true, lotes: { where: { lojaId }, select: { quantidade: true, reservado: true, validade: true } } },
  });
  const agora = new Date();
  return (
    <>
      <form className="flex gap-2"><input type="hidden" name="loja" value={lojaId} /><input type="hidden" name="aba" value="posicao" /><input name="q" defaultValue={q} placeholder="Filtrar produto" className="campo max-w-xs" /><button className="rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">Filtrar</button></form>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Produto</th><th className="text-right">Físico</th><th className="text-right">Reservado</th><th className="text-right">Disponível</th><th className="text-right">Mínimo</th><th>Próx. validade</th><th /></tr></thead>
          <tbody>
            {produtos.map((p) => {
              const validos = p.lotes.filter((l) => l.validade > agora && l.quantidade > 0);
              const fisico = p.lotes.reduce((s, l) => s + l.quantidade, 0);
              const reservado = p.lotes.reduce((s, l) => s + l.reservado, 0);
              const disp = validos.reduce((s, l) => s + l.quantidade - l.reservado, 0);
              const prox = validos.map((l) => l.validade).sort((a, b) => +a - +b)[0];
              return (
                <tr key={p.id}>
                  <td>{p.nome}<span className="block text-xs text-slate-500">{p.sku}</span></td>
                  <td className="text-right">{fisico}</td><td className="text-right text-slate-500">{reservado}</td>
                  <td className={`text-right font-semibold ${disp <= 0 ? 'text-rose-700' : disp < p.estoqueMinimo ? 'text-amber-700' : ''}`}>{disp}</td>
                  <td className="text-right text-slate-500">{p.estoqueMinimo}</td>
                  <td>{prox ? data(prox) : '—'}</td>
                  <td className="text-right"><Link href={link({ produto: p.id })} className="link text-sm">Lotes</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function Movimentos({ lojaId }: { lojaId: string }) {
  const mov = await db.movimentoEstoque.findMany({ where: { lojaId, tipo: { notIn: ['RESERVA', 'LIBERACAO'] } }, orderBy: { criadoEm: 'desc' }, take: 100, include: { produto: { select: { nome: true } }, lote: { select: { codigo: true } } } });
  return (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr><th>Quando</th><th>Tipo</th><th>Produto</th><th>Lote</th><th className="text-right">Qtd</th><th>Motivo</th></tr></thead>
        <tbody>{mov.map((m) => <tr key={m.id}><td className="whitespace-nowrap text-slate-500">{dataHora(m.criadoEm)}</td><td><Badge cor={m.tipo === 'ENTRADA' || m.tipo === 'AJUSTE_POSITIVO' ? 'emerald' : m.tipo === 'PERDA' ? 'rose' : 'slate'}>{TIPO_MOV[m.tipo]}</Badge></td><td>{m.produto.nome}</td><td>{m.lote?.codigo ?? '—'}</td><td className="text-right">{m.quantidade}</td><td className="text-slate-500">{m.motivo ?? (m.pedidoId ? 'Pedido' : '')}</td></tr>)}
          {!mov.length && <tr><td colSpan={6} className="py-10 text-center text-slate-500">Sem movimentações.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

async function Entrada({ lojaId, produtoId }: { lojaId: string; produtoId?: string }) {
  const produtos = produtoId ? [] : await db.produto.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, sku: true } });
  return (
    <FormAcao acao={entradaEstoque} rotulo="Registrar entrada" className="cartao grid gap-3 p-5 md:grid-cols-3">
      <input type="hidden" name="lojaId" value={lojaId} />
      {produtoId ? <input type="hidden" name="produtoId" value={produtoId} /> : <label className="md:col-span-3"><span className="rotulo">Produto</span><select name="produtoId" className="campo">{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.sku})</option>)}</select></label>}
      <label><span className="rotulo">Lote</span><input name="codigo" required className="campo uppercase" /></label>
      <label><span className="rotulo">Validade</span><input name="validade" type="date" required className="campo" /></label>
      <label><span className="rotulo">Quantidade</span><input name="quantidade" type="number" min={1} required className="campo" /></label>
      <label><span className="rotulo">Custo unitário (R$)</span><input name="custo" className="campo" /></label>
      <label className="md:col-span-2"><span className="rotulo">Motivo</span><input name="motivo" placeholder="Ex.: transferência do CD, devolução…" className="campo" /></label>
    </FormAcao>
  );
}

async function Lotes({ produtoId, lojaId, voltar }: { produtoId: string; lojaId: string; voltar: string }) {
  const p = await db.produto.findUniqueOrThrow({ where: { id: produtoId }, include: { lotes: { where: { lojaId }, orderBy: { validade: 'asc' } } } });
  const agora = new Date();
  return (
    <div className="space-y-4">
      <Link href={voltar} className="text-sm text-slate-500 hover:underline">← Voltar</Link>
      <h2 className="text-xl font-bold">{p.nome}</h2>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Lote</th><th>Validade</th><th className="text-right">Físico</th><th className="text-right">Reservado</th><th>Ajustar</th></tr></thead>
          <tbody>
            {p.lotes.map((l) => (
              <tr key={l.id} className={l.validade <= agora ? 'bg-rose-50' : ''}>
                <td className="font-mono">{l.codigo}</td>
                <td>{data(l.validade)} {l.validade <= agora && <Badge cor="rose">Vencido</Badge>}</td>
                <td className="text-right">{l.quantidade}</td><td className="text-right">{l.reservado}</td>
                <td>
                  <FormAcao acao={ajustarLote} rotulo="OK" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="loteId" value={l.id} />
                    <select name="tipo" className="campo w-auto py-1.5"><option value="AJUSTE_NEGATIVO">Ajuste −</option><option value="AJUSTE_POSITIVO">Ajuste +</option><option value="PERDA">Perda/avaria/vencido</option></select>
                    <input name="quantidade" type="number" min={1} required placeholder="Qtd" className="campo w-20 py-1.5" />
                    <input name="motivo" required placeholder="Motivo (inventário…)" className="campo w-48 py-1.5" />
                  </FormAcao>
                </td>
              </tr>
            ))}
            {!p.lotes.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Nenhum lote nesta loja.</td></tr>}
          </tbody>
        </table>
      </div>
      <h3 className="font-semibold">Nova entrada deste produto</h3>
      <Entrada lojaId={lojaId} produtoId={produtoId} />
    </div>
  );
}

export default function Estoque(props: PageProps<'/admin/estoque'>) {
  return <><TituloPagina titulo="Estoque" subtitulo="Lotes por loja, FEFO, validades e alertas calculados em tempo real" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
