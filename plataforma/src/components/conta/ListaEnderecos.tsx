'use client';
import { useState, useTransition } from 'react';
import { removerEndereco } from '@/app/acoes/conta';
import { FormEndereco } from './FormEndereco';
import { Badge, Botao } from '@/components/ui';
import { cep } from '@/lib/formato';

type E = { id: string; apelido: string; destinatario: string; cep: string; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string; principal: boolean };

export function ListaEnderecos({ enderecos, nome }: { enderecos: E[]; nome: string }) {
  const [editando, setEditando] = useState<string | 'novo' | null>(enderecos.length ? null : 'novo');
  const [pendente, iniciar] = useTransition();
  return (
    <div className="space-y-3">
      {enderecos.map((e) => (
        <div key={e.id} className="cartao p-5">
          {editando === e.id ? <FormEndereco inicial={e} aoSalvar={() => setEditando(null)} /> : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-sm">
                <p className="font-semibold">{e.apelido} {e.principal && <Badge cor="marca">Principal</Badge>}</p>
                <p className="text-slate-600">{e.destinatario}<br />{e.logradouro}, {e.numero}{e.complemento ? ` — ${e.complemento}` : ''}<br />{e.bairro} · {e.cidade}/{e.uf} · {cep(e.cep)}</p>
              </div>
              <div className="flex gap-2">
                <Botao variante="secundario" tamanho="sm" onClick={() => setEditando(e.id)}>Editar</Botao>
                <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => iniciar(async () => { await removerEndereco(e.id); })}>Excluir</Botao>
              </div>
            </div>
          )}
        </div>
      ))}
      {editando === 'novo' ? <div className="cartao p-5"><h2 className="mb-3 font-semibold">Novo endereço</h2><FormEndereco nomePadrao={nome} aoSalvar={() => setEditando(null)} /></div> : <Botao onClick={() => setEditando('novo')}>+ Adicionar endereço</Botao>}
    </div>
  );
}
