'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { criarCompraAcao } from '@/app/acoes/admin';
import { Aviso, Botao } from '@/components/ui';
import { brl } from '@/lib/formato';
import { Icone } from '@/components/icones';

type Prod = { id: string; nome: string; sku: string; custo: number };
type Sug = { produtoId: string; sugerido: number; custo: number; disponivel: number; minimo: number; vendidos30: number };
type Linha = { produtoId: string; quantidade: number; custo: string };

export function NovaCompra({ fornecedores, lojas, produtos, sugestao, lojaId }: { fornecedores: { id: string; nome: string }[]; lojas: { id: string; nome: string }[]; produtos: Prod[]; sugestao: Sug[]; lojaId: string }) {
  const router = useRouter();
  const [fornecedorId, setF] = useState(fornecedores[0]?.id ?? '');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const mapa = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const c2r = (c: number) => (c / 100).toFixed(2).replace('.', ',');
  const r2c = (s: string) => Math.round(Number(s.replace(',', '.')) * 100) || 0;
  const total = linhas.reduce((s, l) => s + l.quantidade * r2c(l.custo), 0);
  const set = (i: number, m: Partial<Linha>) => setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...m } : l)));
  return (
    <div className="space-y-4">
      <div className="cartao grid gap-3 p-5 md:grid-cols-3">
        <label><span className="rotulo">Fornecedor</span><select value={fornecedorId} onChange={(e) => setF(e.target.value)} className="campo">{fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
        <label><span className="rotulo">Loja de entrega</span><select defaultValue={lojaId} onChange={(e) => { router.push(`/admin/compras/nova?loja=${e.target.value}`); }} className="campo">{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <div className="flex items-end"><Botao variante="secundario" onClick={() => setLinhas(sugestao.map((s) => ({ produtoId: s.produtoId, quantidade: s.sugerido, custo: c2r(s.custo) })))} disabled={!sugestao.length}><Icone nome="brilho" />Preencher com sugestão ({sugestao.length} itens abaixo do mínimo)</Botao></div>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Produto</th><th>Situação</th><th className="w-28">Qtd</th><th className="w-32">Custo un. (R$)</th><th className="text-right">Subtotal</th><th /></tr></thead>
          <tbody>
            {linhas.map((l, i) => {
              const s = sugestao.find((x) => x.produtoId === l.produtoId);
              return (
                <tr key={i}>
                  <td><select value={l.produtoId} onChange={(e) => set(i, { produtoId: e.target.value, custo: c2r(mapa.get(e.target.value)?.custo ?? 0) })} className="campo py-1.5">{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></td>
                  <td className="text-xs text-slate-500">{s ? `disp. ${s.disponivel} · mín. ${s.minimo} · vendeu ${s.vendidos30}/30d` : ''}</td>
                  <td><input type="number" min={0} value={l.quantidade} onChange={(e) => set(i, { quantidade: Number(e.target.value) })} className="campo py-1.5" /></td>
                  <td><input value={l.custo} onChange={(e) => set(i, { custo: e.target.value })} className="campo py-1.5" /></td>
                  <td className="text-right">{brl(l.quantidade * r2c(l.custo))}</td>
                  <td><button onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))} className="text-rose-600" aria-label="Remover"><Icone nome="excluir" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-100 p-4">
          <Botao variante="fantasma" onClick={() => setLinhas((ls) => [...ls, { produtoId: produtos[0].id, quantidade: 10, custo: c2r(produtos[0].custo) }])}>+ Adicionar item</Botao>
          <p className="text-lg font-bold">Total: {brl(total)}</p>
        </div>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Botao tamanho="lg" disabled={pendente || !linhas.length} onClick={() => iniciar(async () => {
        const r = await criarCompraAcao({ fornecedorId, lojaId, itens: linhas.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade, custoUnitario: r2c(l.custo) })) });
        if (r && !r.ok) setErro(r.erro);
      })}>{pendente ? 'Salvando…' : 'Salvar pedido de compra (rascunho)'}</Botao>
    </div>
  );
}
