'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { buscarProdutoPdv, finalizarVendaPdv } from '@/app/acoes/admin';
import { Aviso, Botao, SeloClassificacao, cx } from '@/components/ui';
import { REGRAS, METODO_PAGAMENTO } from '@/lib/dominio';
import { brl } from '@/lib/formato';
import type { Classificacao, MetodoPagamento } from '@/generated/prisma/enums';

type Prod = { id: string; nome: string; preco: number; icone: string; classificacao: Classificacao; ean: string | null; disponivel: number };
type Item = Prod & { quantidade: number };

export function Pdv({ farmaceutico }: { farmaceutico: boolean }) {
  const [q, setQ] = useState('');
  const [resBruto, setRes] = useState<Prod[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [metodo, setMetodo] = useState<MetodoPagamento>('DINHEIRO');
  const [recebido, setRecebido] = useState('');
  const [cpf, setCpf] = useState('');
  const [receitaOk, setReceitaOk] = useState(false);
  const [crm, setCrm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const busca = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => setRes(await buscarProdutoPdv(q)), 200);
    return () => clearTimeout(t);
  }, [q]);

  const res = q.trim().length >= 2 ? resBruto : [];
  const adicionar = (p: Prod) => {
    setItens((xs) => { const e = xs.find((x) => x.id === p.id); return e ? xs.map((x) => (x.id === p.id ? { ...x, quantidade: Math.min(x.quantidade + 1, p.disponivel) } : x)) : [...xs, { ...p, quantidade: 1 }]; });
    setQ(''); setRes([]); busca.current?.focus();
  };
  // Leitor de código de barras: Enter com EAN exato adiciona direto
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && res.length) { e.preventDefault(); adicionar(res.find((r) => r.ean === q.trim()) ?? res[0]); } };

  const total = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const exigeReceita = itens.some((i) => REGRAS[i.classificacao].exigeReceita);
  const escritura = itens.some((i) => REGRAS[i.classificacao].escrituracao);
  const recebidoC = Math.round(Number(recebido.replace(',', '.')) * 100) || 0;

  const finalizar = () => iniciar(async () => {
    const r = await finalizarVendaPdv({ itens: itens.map((i) => ({ produtoId: i.id, quantidade: i.quantidade })), metodo, valorRecebido: metodo === 'DINHEIRO' ? recebidoC : undefined, cpf: cpf || undefined, receitaConferida: receitaOk, registroPrescritor: crm || undefined });
    if (r.ok && r.dados) {
      setMsg({ ok: true, t: `Venda #${r.dados.numero} concluída · ${brl(r.dados.total)}${r.dados.troco ? ` · TROCO ${brl(r.dados.troco)}` : ''}${r.dados.cliente ? ` · pontos para ${r.dados.cliente}` : ''}` });
      setItens([]); setRecebido(''); setCpf(''); setReceitaOk(false); setCrm('');
    } else if (!r.ok) setMsg({ ok: false, t: r.erro });
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="relative">
          <input ref={busca} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={enter} placeholder="Bipe o código de barras ou digite o nome…" className="campo py-4 text-lg" aria-label="Buscar produto" />
          {res.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              {res.map((p) => (
                <li key={p.id}><button disabled={p.disponivel <= 0} onClick={() => adicionar(p)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 disabled:opacity-40">
                  <span className="text-2xl">{p.icone}</span><span className="flex-1 text-sm">{p.nome} <SeloClassificacao c={p.classificacao} /><span className="block text-xs text-slate-500">{p.disponivel} em estoque · {p.ean}</span></span><strong>{brl(p.preco)}</strong>
                </button></li>
              ))}
            </ul>
          )}
        </div>
        <div className="cartao overflow-hidden">
          <table className="tabela">
            <thead><tr><th>Produto</th><th className="w-32">Qtd</th><th className="text-right">Unit.</th><th className="text-right">Total</th><th /></tr></thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td>{i.icone} {i.nome} <SeloClassificacao c={i.classificacao} /></td>
                  <td><input type="number" min={1} max={i.disponivel} value={i.quantidade} onChange={(e) => setItens((xs) => xs.map((x) => (x.id === i.id ? { ...x, quantidade: Math.max(1, Math.min(i.disponivel, Number(e.target.value))) } : x)))} className="campo w-20 py-1.5" /></td>
                  <td className="text-right">{brl(i.preco)}</td><td className="text-right font-semibold">{brl(i.preco * i.quantidade)}</td>
                  <td><button onClick={() => setItens((xs) => xs.filter((x) => x.id !== i.id))} className="text-rose-600" aria-label="Remover">✕</button></td>
                </tr>
              ))}
              {!itens.length && <tr><td colSpan={5} className="py-12 text-center text-slate-400">Nenhum item. Bipe um produto para começar.</td></tr>}
            </tbody>
          </table>
        </div>
        {msg && <Aviso tipo={msg.ok ? 'sucesso' : 'erro'}>{msg.t}</Aviso>}
      </div>
      <aside className="cartao space-y-4 p-5">
        <p className="text-sm text-slate-500">Total da venda</p>
        <p className="text-4xl font-extrabold">{brl(total)}</p>
        <p className="text-xs text-slate-500">Promoções vigentes (inclusive leve-pague) são aplicadas ao finalizar.</p>
        <label className="block"><span className="rotulo">CPF do cliente (pontos e nota)</span><input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" placeholder="Opcional" className="campo" /></label>
        <div className="grid grid-cols-2 gap-2">
          {(['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX'] as const).map((m) => <button key={m} onClick={() => setMetodo(m)} className={cx('rounded-xl border-2 px-2 py-2 text-sm font-semibold', metodo === m ? 'border-marca-600 bg-marca-50' : 'border-slate-200')}>{METODO_PAGAMENTO[m]}</button>)}
        </div>
        {metodo === 'DINHEIRO' && (
          <label className="block"><span className="rotulo">Valor recebido (R$)</span><input value={recebido} onChange={(e) => setRecebido(e.target.value)} inputMode="decimal" className="campo text-lg" />{recebidoC >= total && total > 0 && <span className="mt-1 block text-lg font-bold text-emerald-700">Troco: {brl(recebidoC - total)}</span>}</label>
        )}
        {exigeReceita && (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
            <label className="flex items-start gap-2"><input type="checkbox" checked={receitaOk} onChange={(e) => setReceitaOk(e.target.checked)} className="mt-0.5 accent-marca-600" /> Receita conferida (paciente, medicamento, dose, validade, assinatura).</label>
            {escritura && (farmaceutico
              ? <input value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="CRM do prescritor (ex.: CRM-SP 123456)" className="campo py-2" />
              : <p className="font-semibold text-rose-700">Antimicrobiano/controlado: chame o farmacêutico para dispensar.</p>)}
          </div>
        )}
        <Botao bloco tamanho="lg" disabled={pendente || !itens.length || (metodo === 'DINHEIRO' && recebidoC < total)} onClick={finalizar}>{pendente ? 'Processando…' : 'Finalizar venda'}</Botao>
      </aside>
    </div>
  );
}
