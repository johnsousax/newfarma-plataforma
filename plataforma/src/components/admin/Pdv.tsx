'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { buscarProdutoPdv, finalizarVendaPdv } from '@/app/acoes/admin';
import { buscarContasPdv, carregarPreVendaAcao, salvarOrcamentoAcao } from '@/app/acoes/gestao';
import { Aviso, Botao, SeloClassificacao, cx } from '@/components/ui';
import { REGRAS, METODO_PAGAMENTO } from '@/lib/dominio';
import { brl } from '@/lib/formato';
import type { Classificacao, MetodoPagamento } from '@/generated/prisma/enums';
import { Icone, IconeProduto } from '@/components/icones';

type Prod = { id: string; nome: string; preco: number; icone: string; classificacao: Classificacao; ean: string | null; disponivel: number };
type Item = Prod & { quantidade: number };
type Conta = Awaited<ReturnType<typeof buscarContasPdv>>[number];

export function Pdv({ farmaceutico, usuarioId, vendedores = [], podeCrediario = false, modo = 'caixa' }: { farmaceutico: boolean; usuarioId?: string; vendedores?: { id: string; nome: string }[]; podeCrediario?: boolean; modo?: 'caixa' | 'prevenda' }) {
  const [vendedorId, setVendedorId] = useState(usuarioId ?? '');
  const [conta, setConta] = useState<Conta | null>(null);
  const [qConta, setQConta] = useState('');
  const [contas, setContas] = useState<Conta[]>([]);
  const [numPre, setNumPre] = useState('');
  const [orcamentoId, setOrcamentoId] = useState<string | null>(null);
  const [cliente, setCliente] = useState('');
  const [telCliente, setTelCliente] = useState('');
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
  const aPrazo = metodo === 'CREDIARIO' || metodo === 'CONVENIO';
  useEffect(() => {
    if (!aPrazo || qConta.trim().length < 2) return;
    const t = setTimeout(async () => setContas(await buscarContasPdv(qConta, metodo as 'CREDIARIO' | 'CONVENIO')), 250);
    return () => clearTimeout(t);
  }, [qConta, metodo, aPrazo]);
  const trocarMetodo = (m: MetodoPagamento) => { setMetodo(m); setConta(null); setContas([]); setQConta(''); };
  const limpar = () => { setItens([]); setRecebido(''); setCpf(''); setReceitaOk(false); setCrm(''); setConta(null); setQConta(''); setContas([]); setOrcamentoId(null); setNumPre(''); setCliente(''); setTelCliente(''); setVendedorId(usuarioId ?? ''); };
  const carregarPre = () => iniciar(async () => {
    const r = await carregarPreVendaAcao(numPre);
    if (r.ok && r.dados) { setItens(r.dados.itens.map((i) => ({ ...i, quantidade: Math.min(i.quantidade, Math.max(i.disponivel, 0)) })).filter((i) => i.quantidade > 0)); setOrcamentoId(r.dados.id); setVendedorId(r.dados.vendedorId); setMsg({ ok: true, t: `Pré-venda nº ${r.dados.numero} carregada${r.dados.clienteNome ? ` (${r.dados.clienteNome})` : ''}. Confira e finalize.` }); }
    else if (!r.ok) setMsg({ ok: false, t: r.erro });
  });
  const salvarOrc = (tipo: 'ORCAMENTO' | 'PRE_VENDA') => iniciar(async () => {
    const r = await salvarOrcamentoAcao({ tipo, itens: itens.map((i) => ({ produtoId: i.id, quantidade: i.quantidade })), clienteNome: cliente || undefined, telefone: telCliente || undefined });
    if (r.ok && r.dados) { setMsg({ ok: true, t: `${tipo === 'PRE_VENDA' ? 'Pré-venda' : 'Orçamento'} nº ${r.dados.numero} salvo · ${brl(r.dados.total)}. ${tipo === 'PRE_VENDA' ? 'Informe este número no caixa.' : 'Imprima ou envie em Orçamentos.'}` }); limpar(); }
    else if (!r.ok) setMsg({ ok: false, t: r.erro });
  });
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
    const r = await finalizarVendaPdv({ itens: itens.map((i) => ({ produtoId: i.id, quantidade: i.quantidade })), metodo, valorRecebido: metodo === 'DINHEIRO' ? recebidoC : undefined, cpf: cpf || undefined, receitaConferida: receitaOk, registroPrescritor: crm || undefined, vendedorId: vendedorId || undefined, contaCrediarioId: aPrazo ? conta?.id : undefined, orcamentoId: orcamentoId ?? undefined });
    if (r.ok && r.dados) {
      setMsg({ ok: true, t: `Venda #${r.dados.numero} concluída · ${brl(r.dados.total)}${r.dados.descontoConvenio ? ` (desconto convênio ${brl(r.dados.descontoConvenio)})` : ''}${r.dados.troco ? ` · TROCO ${brl(r.dados.troco)}` : ''}${aPrazo && conta ? ` · lançado na conta de ${conta.nome}` : ''}${r.dados.cliente ? ` · pontos para ${r.dados.cliente}` : ''}` });
      limpar();
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
                  <IconeProduto emoji={p.icone} className="h-6 w-6 text-marca-600" /><span className="flex-1 text-sm">{p.nome} <SeloClassificacao c={p.classificacao} /><span className="block text-xs text-slate-500">{p.disponivel} em estoque · {p.ean}</span></span><strong>{brl(p.preco)}</strong>
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
                  <td>{i.nome} <SeloClassificacao c={i.classificacao} /></td>
                  <td><input type="number" min={1} max={i.disponivel} value={i.quantidade} onChange={(e) => setItens((xs) => xs.map((x) => (x.id === i.id ? { ...x, quantidade: Math.max(1, Math.min(i.disponivel, Number(e.target.value))) } : x)))} className="campo w-20 py-1.5" /></td>
                  <td className="text-right">{brl(i.preco)}</td><td className="text-right font-semibold">{brl(i.preco * i.quantidade)}</td>
                  <td><button onClick={() => setItens((xs) => xs.filter((x) => x.id !== i.id))} className="text-rose-600" aria-label="Remover"><Icone nome="excluir" /></button></td>
                </tr>
              ))}
              {!itens.length && <tr><td colSpan={5} className="py-12 text-center text-slate-400">Nenhum item. Bipe um produto para começar.</td></tr>}
            </tbody>
          </table>
        </div>
        {msg && <Aviso tipo={msg.ok ? 'sucesso' : 'erro'}>{msg.t}</Aviso>}
      </div>
      {modo === 'prevenda' ? (
      <aside className="cartao space-y-4 p-5">
        <p className="text-sm text-slate-500">Total estimado</p>
        <p className="text-4xl font-extrabold">{brl(total)}</p>
        <p className="text-xs text-slate-500">Promoções vigentes são aplicadas ao salvar. O cliente paga no caixa informando o número da pré-venda.</p>
        <label className="block"><span className="rotulo">Nome do cliente (opcional)</span><input value={cliente} onChange={(e) => setCliente(e.target.value)} className="campo" /></label>
        <label className="block"><span className="rotulo">WhatsApp do cliente (para orçamento)</span><input value={telCliente} onChange={(e) => setTelCliente(e.target.value)} inputMode="tel" className="campo" /></label>
        <Botao bloco tamanho="lg" disabled={pendente || !itens.length} onClick={() => salvarOrc('PRE_VENDA')}>{pendente ? 'Salvando…' : 'Salvar pré-venda (caixa finaliza)'}</Botao>
        <Botao bloco variante="secundario" disabled={pendente || !itens.length} onClick={() => salvarOrc('ORCAMENTO')}>Salvar como orçamento (7 dias)</Botao>
      </aside>
      ) : (
      <aside className="cartao space-y-4 p-5">
        <p className="text-sm text-slate-500">Total da venda</p>
        <p className="text-4xl font-extrabold">{brl(total)}</p>
        <p className="text-xs text-slate-500">Promoções vigentes (inclusive leve-pague){metodo === 'CONVENIO' && conta?.descontoBp ? ` e o desconto do convênio (${conta.descontoBp / 100}%)` : ''} são aplicadas ao finalizar.</p>
        <div className="flex gap-2">
          <input value={numPre} onChange={(e) => setNumPre(e.target.value.replace(/\D/g, ''))} placeholder="Nº da pré-venda" inputMode="numeric" className="campo py-2" aria-label="Número da pré-venda" />
          <Botao variante="secundario" tamanho="sm" disabled={!numPre || pendente} onClick={carregarPre}>Carregar</Botao>
        </div>
        {orcamentoId && <p className="text-xs font-semibold text-marca-700">Finalizando pré-venda nº {numPre}.</p>}
        {vendedores.length > 1 && (
          <label className="block"><span className="rotulo">Vendedor (comissão)</span><select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="campo">{vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select></label>
        )}
        <label className="block"><span className="rotulo">CPF do cliente (pontos e nota)</span><input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" placeholder="Opcional" className="campo" /></label>
        <div className="grid grid-cols-2 gap-2">
          {(['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX', ...(podeCrediario ? (['CREDIARIO', 'CONVENIO'] as const) : [])] as const).map((m) => <button key={m} onClick={() => trocarMetodo(m)} className={cx('rounded-xl border-2 px-2 py-2 text-sm font-semibold', metodo === m ? 'border-marca-600 bg-marca-50' : 'border-slate-200')}>{METODO_PAGAMENTO[m]}</button>)}
        </div>
        {aPrazo && (
          <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
            {conta ? (
              <div>
                <p className="font-semibold">{conta.nome}{conta.convenio ? ` · ${conta.convenio}` : ''}</p>
                <p className="text-xs text-slate-600">Disponível {brl(conta.disponivel)} · devendo {brl(conta.saldo)}{conta.vencido ? ` · VENCIDO ${brl(conta.vencido)}` : ''}</p>
                {conta.vencido > 0 && <p className="mt-1 text-xs font-semibold text-rose-700">Cliente com parcela vencida: confirme com o gerente antes de vender.</p>}
                {conta.disponivel < total && <p className="mt-1 text-xs font-semibold text-rose-700">Limite insuficiente para esta compra.</p>}
                <button onClick={() => setConta(null)} className="mt-1 text-xs text-marca-700 underline">Trocar cliente</button>
              </div>
            ) : (
              <>
                <input value={qConta} onChange={(e) => setQConta(e.target.value)} placeholder={metodo === 'CONVENIO' ? 'Nome, CPF ou matrícula do conveniado' : 'Nome ou CPF do cliente'} className="campo py-2" aria-label="Buscar conta" />
                {contas.map((c) => <button key={c.id} disabled={c.bloqueada} onClick={() => { setConta(c); setContas([]); }} className="block w-full rounded-lg bg-white px-3 py-2 text-left hover:ring-1 hover:ring-sky-300 disabled:opacity-50">{c.nome}{c.convenio ? ` · ${c.convenio}` : ''}<span className="block text-xs text-slate-500">{c.bloqueada ? 'Bloqueada' : `disponível ${brl(c.disponivel)}`}{c.cpfFinal ? ` · CPF final ${c.cpfFinal}` : ''}</span></button>)}
                {qConta.length >= 2 && !contas.length && <p className="text-xs text-slate-500">Nenhuma conta. Abra em Painel › Crediário.</p>}
              </>
            )}
          </div>
        )}
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
        <Botao bloco tamanho="lg" disabled={pendente || !itens.length || (metodo === 'DINHEIRO' && recebidoC < total) || (aPrazo && (!conta || conta.disponivel < total))} onClick={finalizar}>{pendente ? 'Processando…' : 'Finalizar venda'}</Botao>
        {itens.length > 0 && <button onClick={() => salvarOrc('ORCAMENTO')} disabled={pendente} className="w-full text-center text-sm text-marca-700 underline">Salvar como orçamento</button>}
      </aside>
      )}
    </div>
  );
}
