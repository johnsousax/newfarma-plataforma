'use client';
import { useEffect, useState, useTransition } from 'react';
import { buscarProdutoPdv } from '@/app/acoes/admin';
import { ajustarItemNotaAcao, lancarNotaAcao, descartarNotaAcao } from '@/app/acoes/gestao';
import { Aviso, Badge, Botao, cx } from '@/components/ui';
import { brl } from '@/lib/formato';

type Lote = { codigo: string; quantidade: number; validade: string | null };
type Item = { n: number; cProd: string; ean: string | null; nome: string; unidade: string; qCom: number; custoTotal: number; registroAnvisa: string | null; pmc: number | null; lotes: Lote[]; produtoId: string | null; produtoNome: string | null; fator: number; como: string | null; ignorar: boolean };
const COMO: Record<string, string> = { memoria: 'lembrado', ean: 'pelo código de barras', anvisa: 'pelo registro ANVISA', manual: 'ligado à mão' };
const fmt = (q: number) => q.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function LinhaItem({ notaId, item, aberta }: { notaId: string; item: Item; aberta: boolean }) {
  const [editar, setEditar] = useState(!item.produtoId || !item.lotes.length);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ id: string; nome: string }[]>([]);
  const [fator, setFator] = useState(String(item.fator));
  const [lotes, setLotes] = useState<Lote[]>(item.lotes.length ? item.lotes : [{ codigo: '', quantidade: item.qCom, validade: null }]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => setRes(await buscarProdutoPdv(q)), 250);
    return () => clearTimeout(t);
  }, [q]);
  const salvar = (d: Parameters<typeof ajustarItemNotaAcao>[2]) => iniciar(async () => { const r = await ajustarItemNotaAcao(notaId, item.n, d); setMsg(r.ok ? null : r.erro); if (r.ok) { setQ(''); setRes([]); } });
  const unidades = item.qCom * item.fator;
  const custoUnit = unidades ? Math.round(item.custoTotal / unidades) : 0;
  const novoProduto = `/admin/produtos/novo?${new URLSearchParams({ ...(item.ean ? { ean: item.ean } : {}), nome: item.nome })}`;
  return (
    <div className={cx('cartao space-y-3 p-4', item.ignorar && 'opacity-50', !item.ignorar && (!item.produtoId || !item.lotes.length) && 'ring-2 ring-amber-300')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{item.n}. {item.nome}</p>
          <p className="text-xs text-slate-500">Cód. fornecedor {item.cProd}{item.ean ? ` · EAN ${item.ean}` : ''}{item.registroAnvisa ? ` · MS ${item.registroAnvisa}` : ''} · {fmt(item.qCom)} {item.unidade} · {brl(item.custoTotal)}</p>
        </div>
        <div className="text-right text-sm">
          {item.produtoId ? <p><Badge cor="emerald">{item.produtoNome}</Badge><span className="block text-xs text-slate-500">{item.como ? COMO[item.como] : ''}</span></p> : <Badge cor="amber">Sem produto</Badge>}
          <p className="mt-1 text-xs">{fmt(unidades)} un. no estoque · custo {brl(custoUnit)}/un.{item.pmc ? ` · PMC na nota ${brl(item.pmc)}` : ''}</p>
        </div>
      </div>
      {!editar ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Lotes: {item.lotes.map((l) => `${l.codigo} (${fmt(l.quantidade)}, val. ${l.validade ? new Date(`${l.validade}T12:00`).toLocaleDateString('pt-BR') : '—'})`).join(' · ')}</span>
          {aberta && <button onClick={() => setEditar(true)} className="text-marca-700 underline">Ajustar</button>}
        </div>
      ) : aberta && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <span className="rotulo">Produto no nosso cadastro</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={item.produtoNome ?? 'Buscar por nome ou código de barras'} className="campo" />
              {q.trim().length >= 2 && res.length > 0 && <ul className="absolute inset-x-0 top-full z-10 mt-1 rounded-xl border bg-white shadow-lg">{res.map((p) => <li key={p.id}><button className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => salvar({ produtoId: p.id })}>{p.nome}</button></li>)}</ul>}
              <a href={novoProduto} target="_blank" className="mt-1 inline-block text-xs text-marca-700 underline">Não existe? Cadastrar produto novo (abre em outra aba; depois volte e busque)</a>
            </div>
            <label><span className="rotulo">Unidades por {item.unidade}</span><input value={fator} onChange={(e) => setFator(e.target.value.replace(/\D/g, ''))} onBlur={() => Number(fator) >= 1 && Number(fator) !== item.fator && salvar({ fator: Number(fator) })} className="campo w-28" /></label>
          </div>
          <div className="space-y-2">
            <span className="rotulo">Lotes (quantidade em {item.unidade}; total da nota {fmt(item.qCom)})</span>
            {lotes.map((l, k) => (
              <div key={k} className="flex flex-wrap gap-2">
                <input value={l.codigo} onChange={(e) => setLotes((x) => x.map((y, j) => (j === k ? { ...y, codigo: e.target.value } : y)))} placeholder="Lote" className="campo w-40 py-1.5" />
                <input value={String(l.quantidade)} onChange={(e) => setLotes((x) => x.map((y, j) => (j === k ? { ...y, quantidade: Number(e.target.value.replace(',', '.')) || 0 } : y)))} inputMode="decimal" className="campo w-24 py-1.5" aria-label="Quantidade do lote" />
                <input type="date" value={l.validade ?? ''} onChange={(e) => setLotes((x) => x.map((y, j) => (j === k ? { ...y, validade: e.target.value || null } : y)))} className="campo w-44 py-1.5" aria-label="Validade" />
                {lotes.length > 1 && <button onClick={() => setLotes((x) => x.filter((_, j) => j !== k))} className="text-xs text-rose-600">remover</button>}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Botao tamanho="sm" variante="secundario" onClick={() => setLotes((x) => [...x, { codigo: '', quantidade: 0, validade: null }])}>+ lote</Botao>
              <Botao tamanho="sm" disabled={pendente} onClick={() => salvar({ lotes, fator: Number(fator) || 1 })}>Salvar lotes</Botao>
              <label className="ml-auto flex items-center gap-2 text-xs"><input type="checkbox" checked={item.ignorar} onChange={(e) => salvar({ ignorar: e.target.checked })} className="accent-marca-600" /> Não entra no estoque (brinde, material de uso)</label>
              {item.produtoId && item.lotes.length > 0 && <button onClick={() => setEditar(false)} className="text-xs text-marca-700 underline">fechar</button>}
            </div>
          </div>
          {msg && <Aviso tipo="erro">{msg}</Aviso>}
        </div>
      )}
    </div>
  );
}

export function ConferenciaNota({ notaId, itens, aberta, bloqueios, atencao, compras }: { notaId: string; itens: Item[]; aberta: boolean; bloqueios: string[]; atencao: string[]; compras: { id: string; numero: number; total: number }[] }) {
  const [compraId, setCompraId] = useState(compras.length === 1 ? compras[0].id : '');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="space-y-4">
      {atencao.map((a) => <Aviso key={a} tipo="alerta">{a}</Aviso>)}
      {aberta && bloqueios.map((b) => <Aviso key={b} tipo="erro">{b}</Aviso>)}
      <div className="space-y-3">{itens.map((i) => <LinhaItem key={`${i.n}-${i.produtoId}-${i.fator}-${i.lotes.length}-${i.ignorar}`} notaId={notaId} item={i} aberta={aberta} />)}</div>
      {aberta && (
        <div className="cartao flex flex-wrap items-end gap-3 p-4">
          {compras.length > 0 && (
            <label><span className="rotulo">Baixar pedido de compra</span><select value={compraId} onChange={(e) => setCompraId(e.target.value)} className="campo"><option value="">Nenhum</option>{compras.map((c) => <option key={c.id} value={c.id}>Pedido #{c.numero} · {brl(c.total)}</option>)}</select></label>
          )}
          <Botao tamanho="lg" disabled={pendente || bloqueios.length > 0} onClick={() => iniciar(async () => { const r = await lancarNotaAcao(notaId, compraId || undefined); setMsg(r.ok ? { ok: true, t: r.mensagem ?? 'Lançada' } : { ok: false, t: r.erro }); })}>{pendente ? 'Lançando…' : 'Dar entrada no estoque'}</Botao>
          <Botao variante="fantasma" disabled={pendente} onClick={() => { if (confirm('Descartar esta nota? Nada entra no estoque.')) iniciar(async () => { const r = await descartarNotaAcao(notaId); setMsg(r.ok ? { ok: true, t: 'Nota descartada.' } : { ok: false, t: r.erro }); }); }}>Descartar</Botao>
        </div>
      )}
      {msg && <Aviso tipo={msg.ok ? 'sucesso' : 'erro'}>{msg.t}</Aviso>}
    </div>
  );
}
