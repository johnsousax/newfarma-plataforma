'use client';
import { useMemo, useState, useTransition } from 'react';
import { salvarContagemAcao, fecharInventarioAcao, cancelarInventarioAcao } from '@/app/acoes/gestao';
import { Aviso, Botao, cx } from '@/components/ui';

type Item = { id: string; produtoNome: string; loteCodigo: string; validade: string; esperado: number; contado: number | null; ean: string | null };

export function ContagemInventario({ inventarioId, itens, aberto }: { inventarioId: string; itens: Item[]; aberto: boolean }) {
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((i) => [i.id, i.contado == null ? '' : String(i.contado)])));
  const [sujos, setSujos] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState('');
  const [so, setSo] = useState<'todos' | 'faltam' | 'diferenca'>('todos');
  const [zerar, setZerar] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const num = (id: string) => (valores[id] === '' || valores[id] == null ? null : Number(valores[id]));
  const visiveis = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return itens.filter((i) => {
      if (t && !(i.ean === t || i.produtoNome.toLowerCase().includes(t) || i.loteCodigo.toLowerCase().includes(t))) return false;
      const c = num(i.id);
      if (so === 'faltam') return c == null;
      if (so === 'diferenca') return c != null && c !== i.esperado;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, filtro, so, valores]);
  const contados = itens.filter((i) => num(i.id) != null).length;
  const sobra = itens.reduce((s, i) => { const c = num(i.id); return s + (c != null && c > i.esperado ? c - i.esperado : 0); }, 0);
  const falta = itens.reduce((s, i) => { const c = num(i.id); return s + (c != null && c < i.esperado ? i.esperado - c : 0); }, 0);

  const salvar = (depois?: () => void) => iniciar(async () => {
    const lista = [...sujos].map((id) => ({ itemId: id, contado: num(id) }));
    if (lista.length) {
      const r = await salvarContagemAcao(inventarioId, lista);
      if (!r.ok) { setMsg({ ok: false, t: r.erro }); return; }
      setSujos(new Set());
    }
    if (depois) depois(); else setMsg({ ok: true, t: `Contagem salva (${contados} de ${itens.length} lotes).` });
  });
  const fechar = () => {
    if (!confirm(`Fechar o inventário e ajustar o estoque? Sobras: ${sobra} un. · Faltas: ${falta} un.${zerar ? ' Lotes não contados serão zerados.' : ' Lotes não contados ficam como estão.'}`)) return;
    salvar(async () => {
      const r = await fecharInventarioAcao(inventarioId, zerar);
      setMsg(r.ok ? { ok: true, t: `Inventário fechado: ${r.dados?.ajustes ?? 0} lote(s) ajustado(s).` } : { ok: false, t: r.erro });
    });
  };
  const cancelar = () => { if (confirm('Cancelar este inventário? Nada no estoque será alterado.')) iniciar(async () => { const r = await cancelarInventarioAcao(inventarioId); setMsg(r.ok ? { ok: true, t: 'Inventário cancelado.' } : { ok: false, t: r.erro }); }); };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[['Lotes contados', `${contados} / ${itens.length}`], ['Sobras', `${sobra} un.`], ['Faltas', `${falta} un.`], ['A salvar', String(sujos.size)]].map(([r, v]) => <div key={r} className="cartao p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Bipe o código de barras ou busque produto/lote" className="campo max-w-md" autoFocus />
        {(['todos', 'faltam', 'diferenca'] as const).map((k) => <button key={k} onClick={() => setSo(k)} className={cx('rounded-full px-3 py-1.5 text-sm', so === k ? 'bg-slate-900 font-semibold text-white' : 'bg-white ring-1 ring-slate-200')}>{k === 'todos' ? 'Todos' : k === 'faltam' ? 'Não contados' : 'Com diferença'}</button>)}
      </div>
      <div className="cartao max-h-[60vh] overflow-auto">
        <table className="tabela">
          <thead className="sticky top-0 bg-white"><tr><th>Produto</th><th>Lote</th><th>Validade</th><th className="text-right">No sistema</th><th className="w-32">Contado</th><th className="text-right">Diferença</th></tr></thead>
          <tbody>{visiveis.map((i) => {
            const c = num(i.id);
            const d = c == null ? null : c - i.esperado;
            return (
              <tr key={i.id}>
                <td>{i.produtoNome}</td><td className="font-mono text-xs">{i.loteCodigo}</td><td>{new Date(i.validade).toLocaleDateString('pt-BR')}</td>
                <td className="text-right">{i.esperado}</td>
                <td><input disabled={!aberto} type="number" min={0} inputMode="numeric" value={valores[i.id]} onChange={(e) => { setValores((v) => ({ ...v, [i.id]: e.target.value.replace(/\D/g, '') })); setSujos((s) => new Set(s).add(i.id)); }} className="campo w-24 py-1.5" aria-label={`Contagem de ${i.produtoNome} lote ${i.loteCodigo}`} /></td>
                <td className={cx('text-right font-semibold', d != null && d > 0 && 'text-emerald-700', d != null && d < 0 && 'text-rose-700')}>{d == null ? '—' : d > 0 ? `+${d}` : d}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {msg && <Aviso tipo={msg.ok ? 'sucesso' : 'erro'}>{msg.t}</Aviso>}
      {aberto && (
        <div className="flex flex-wrap items-center gap-3">
          <Botao disabled={pendente || !sujos.size} onClick={() => salvar()}>{pendente ? 'Salvando…' : 'Salvar contagem'}</Botao>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={zerar} onChange={(e) => setZerar(e.target.checked)} className="accent-marca-600" /> Zerar lotes não contados</label>
          <Botao variante="escuro" disabled={pendente || !contados} onClick={fechar}>Fechar e ajustar estoque</Botao>
          <Botao variante="fantasma" disabled={pendente} onClick={cancelar}>Cancelar inventário</Botao>
        </div>
      )}
    </div>
  );
}
