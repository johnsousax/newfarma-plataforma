'use client';
import { useState, useTransition } from 'react';
import { salvarPermissoesAcao, restaurarPermissoesAcao } from '@/app/acoes/admin';
import { Aviso, Botao } from '@/components/ui';
import { Icone } from '@/components/icones';

type Linha = { chave: string; descricao: string };

export function MatrizPermissoes({ linhas, cargos, inicial }: { linhas: Linha[]; cargos: { chave: string; rotulo: string }[]; inicial: Record<string, string[]> }) {
  const [m, setM] = useState(inicial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [p, iniciar] = useTransition();
  const alternar = (perm: string, cargo: string) => setM((x) => ({ ...x, [perm]: x[perm]?.includes(cargo) ? x[perm].filter((c) => c !== cargo) : [...(x[perm] ?? []), cargo] }));
  const exec = (f: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>) => iniciar(async () => { const r = await f(); setMsg({ ok: r.ok, t: r.ok ? r.mensagem ?? 'Pronto' : r.erro ?? 'Erro' }); });
  return (
    <div className="space-y-4">
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Área do sistema</th>{cargos.map((c) => <th key={c.chave} className="text-center">{c.rotulo}</th>)}<th className="text-center">Administrador</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave}>
                <td><span className="font-medium text-slate-800">{l.descricao}</span><span className="block font-mono text-[11px] text-slate-400">{l.chave}</span></td>
                {cargos.map((c) => (
                  <td key={c.chave} className="text-center">
                    <input type="checkbox" checked={!!m[l.chave]?.includes(c.chave)} onChange={() => alternar(l.chave, c.chave)} className="h-4 w-4 accent-marca-600" aria-label={`${c.rotulo}: ${l.descricao}`} />
                  </td>
                ))}
                <td className="text-center text-marca-600"><Icone nome="cadeado" className="mx-auto h-4 w-4" rotulo="Sempre liberado" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <Aviso tipo={msg.ok ? 'sucesso' : 'erro'}>{msg.t}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Botao disabled={p} onClick={() => exec(() => salvarPermissoesAcao(m))}>{p ? 'Salvando…' : 'Salvar permissões'}</Botao>
        <Botao variante="secundario" disabled={p} onClick={() => exec(restaurarPermissoesAcao)}>Restaurar padrão</Botao>
      </div>
    </div>
  );
}
