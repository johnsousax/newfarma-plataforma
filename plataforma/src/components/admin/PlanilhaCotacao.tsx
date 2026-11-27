'use client';
import { useEffect, useState, useTransition } from 'react';
import { buscarProdutoPdv } from '@/app/acoes/admin';
import { salvarPrecosCotacaoAcao, adicionarItemCotacaoAcao, removerItemCotacaoAcao, fecharCotacaoAcao, cancelarCotacaoAcao } from '@/app/acoes/gestao';
import { Aviso, Botao, cx } from '@/components/ui';
import { Icone } from '@/components/icones';
import { brl } from '@/lib/formato';

type Preco = { fornecedorId: string; custoUnitario: number; prazoDias: number | null };
type Item = { id: string; produtoNome: string; quantidade: number; precos: Preco[] };
type Forn = { id: string; nome: string; telefone: string | null };
const reais = (c?: number | null) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
const centavos = (s: string) => { const n = Math.round(Number(s.replace(/\./g, '').replace(',', '.')) * 100); return Number.isFinite(n) && n > 0 ? n : null; };

export function PlanilhaCotacao({ cotacaoId, numero, itens, fornecedores, aberta }: { cotacaoId: string; numero: number; itens: Item[]; fornecedores: Forn[]; aberta: boolean }) {
  const comPreco = [...new Set(itens.flatMap((i) => i.precos.map((p) => p.fornecedorId)))];
  const [colunas, setColunas] = useState<string[]>(comPreco.length ? comPreco : fornecedores.slice(0, 2).map((f) => f.id));
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(itens.flatMap((i) => i.precos.map((p) => [`${i.id}|${p.fornecedorId}`, reais(p.custoUnitario)]))));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ id: string; nome: string }[]>([]);
  const [qtd, setQtd] = useState('10');

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => setRes(await buscarProdutoPdv(q)), 250);
    return () => clearTimeout(t);
  }, [q]);

  const v = (itemId: string, f: string) => centavos(valores[`${itemId}|${f}`] ?? '');
  const melhor = (it: Item) => colunas.map((f) => ({ f, c: v(it.id, f) })).filter((x) => x.c).sort((a, b) => a.c! - b.c!)[0]?.f;
  const totalForn = (f: string) => itens.reduce((s, i) => s + (v(i.id, f) ?? 0) * i.quantidade, 0);
  const totalMelhor = itens.reduce((s, i) => { const m = melhor(i); return s + (m ? v(i.id, m)! * i.quantidade : 0); }, 0);
  const rodar = (fn: () => Promise<{ ok: boolean; erro?: string; mensagem?: string } | void>) => iniciar(async () => { const r = await fn(); if (r) setMsg(r.ok ? (r.mensagem ? { ok: true, t: r.mensagem } : null) : { ok: false, t: r.erro ?? 'Erro' }); });
  const salvarColuna = (f: string) => rodar(() => salvarPrecosCotacaoAcao(cotacaoId, f, itens.map((i) => ({ itemId: i.id, custoUnitario: v(i.id, f) }))));
  const textoFornecedor = `Cotação nº ${numero} — favor informar preço unitário e prazo:\n${itens.map((i) => `• ${i.quantidade}x ${i.produtoNome}`).join('\n')}`;

  return (
    <div className="space-y-4">
      {aberta && (
        <div className="flex flex-wrap items-end gap-2">
          <label><span className="rotulo">Adicionar fornecedor à comparação</span>
            <select value="" onChange={(e) => e.target.value && setColunas((c) => [...new Set([...c, e.target.value])])} className="campo"><option value="">Escolher…</option>{fornecedores.filter((f) => !colunas.includes(f.id)).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
          </label>
          <Botao variante="secundario" onClick={() => { navigator.clipboard?.writeText(textoFornecedor); setMsg({ ok: true, t: 'Lista copiada. Cole no WhatsApp ou e-mail do fornecedor.' }); }}>Copiar lista para o fornecedor</Botao>
        </div>
      )}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Produto</th><th className="text-right">Qtd</th>{colunas.map((f) => <th key={f} className="min-w-36 text-right">{fornecedores.find((x) => x.id === f)?.nome ?? '—'}</th>)}{aberta && <th />}</tr></thead>
          <tbody>{itens.map((i) => {
            const m = melhor(i);
            return (
              <tr key={i.id}>
                <td>{i.produtoNome}</td><td className="text-right">{i.quantidade}</td>
                {colunas.map((f) => (
                  <td key={f} className={cx('text-right', m === f && 'bg-emerald-50')}>
                    {aberta ? <input value={valores[`${i.id}|${f}`] ?? ''} onChange={(e) => setValores((x) => ({ ...x, [`${i.id}|${f}`]: e.target.value }))} placeholder="R$ unit." inputMode="decimal" className={cx('campo w-28 py-1.5 text-right', m === f && 'ring-2 ring-emerald-400')} aria-label={`Preço de ${i.produtoNome}`} /> : <span className={cx(m === f && 'font-bold text-emerald-700')}>{reais(v(i.id, f)) || '—'}</span>}
                  </td>
                ))}
                {aberta && <td><button onClick={() => rodar(() => removerItemCotacaoAcao(i.id))} className="text-rose-600" aria-label="Remover item"><Icone nome="excluir" /></button></td>}
              </tr>
            );
          })}</tbody>
          <tfoot>
            <tr><td className="font-bold">Total por fornecedor</td><td />{colunas.map((f) => <td key={f} className="text-right font-semibold">{brl(totalForn(f))}</td>)}{aberta && <td />}</tr>
            {aberta && <tr><td /><td />{colunas.map((f) => <td key={f} className="text-right"><Botao tamanho="sm" variante="secundario" disabled={pendente} onClick={() => salvarColuna(f)}>Salvar</Botao></td>)}<td /></tr>}
          </tfoot>
        </table>
      </div>
      <p className="text-sm">Comprando o melhor preço de cada item: <strong className="text-lg">{brl(totalMelhor)}</strong> <span className="text-slate-500">(destacado em verde)</span></p>
      {aberta && (
        <div className="cartao flex flex-wrap items-end gap-2 p-4">
          <div className="relative min-w-64 flex-1">
            <span className="rotulo">Adicionar produto</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou código de barras" className="campo" />
            {q.trim().length >= 2 && res.length > 0 && <ul className="absolute inset-x-0 top-full z-10 mt-1 rounded-xl border bg-white shadow-lg">{res.map((p) => <li key={p.id}><button className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { rodar(() => adicionarItemCotacaoAcao(cotacaoId, p.id, Number(qtd) || 1)); setQ(''); setRes([]); }}>{p.nome}</button></li>)}</ul>}
          </div>
          <label><span className="rotulo">Quantidade</span><input value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ''))} className="campo w-24" /></label>
        </div>
      )}
      {msg && <Aviso tipo={msg.ok ? 'sucesso' : 'erro'}>{msg.t}</Aviso>}
      {aberta && (
        <div className="flex flex-wrap gap-2">
          <Botao disabled={pendente || !itens.length} onClick={() => { if (confirm('Salve os preços de cada fornecedor antes. Gerar os pedidos de compra com o melhor preço de cada item?')) rodar(() => fecharCotacaoAcao(cotacaoId)); }}>Fechar e gerar pedidos de compra</Botao>
          <Botao variante="fantasma" disabled={pendente} onClick={() => { if (confirm('Cancelar a cotação?')) rodar(() => cancelarCotacaoAcao(cotacaoId)); }}>Cancelar cotação</Botao>
        </div>
      )}
    </div>
  );
}
