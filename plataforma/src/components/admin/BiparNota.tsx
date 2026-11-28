'use client';
import { useActionState, useState, useTransition } from 'react';
import { biparChaveNotaAcao, importarXmlNotaAcao } from '@/app/acoes/gestao';
import { Aviso, Botao } from '@/components/ui';
import { Icone } from '@/components/icones';

type Precisa = { chave: string; numero: number; serie: number; uf: string | null; anoMes: string; cnpj: string; fornecedor: string | null; motivo: string };

export function BiparNota() {
  const [chave, setChave] = useState('');
  const [info, setInfo] = useState<Precisa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [estado, enviar, enviando] = useActionState(importarXmlNotaAcao, null);

  const bipar = (e: React.FormEvent) => {
    e.preventDefault();
    const c = chave.replace(/\D/g, '');
    setErro(null); setInfo(null);
    iniciar(async () => {
      const r = await biparChaveNotaAcao(c);
      if (r && !r.ok) setErro(r.erro);
      else if (r?.ok && r.dados?.tipo === 'precisa_xml') setInfo(r.dados);
      setChave('');
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="cartao space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-bold"><Icone nome="codigoBarras" className="h-5 w-5 text-marca-600" />1. Bipe o código de barras da nota</h2>
        <p className="text-sm text-slate-600">Passe o leitor no código de barras do <strong>DANFE</strong> (a nota em papel que chega com a mercadoria).</p>
        <form onSubmit={bipar} className="flex gap-2">
          <input value={chave} onChange={(e) => setChave(e.target.value)} autoFocus inputMode="numeric" placeholder="Chave de acesso (44 dígitos)" className="campo font-mono" aria-label="Chave de acesso da nota" />
          <Botao disabled={pendente || chave.replace(/\D/g, '').length < 44}>{pendente ? 'Lendo…' : 'Buscar'}</Botao>
        </form>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {info && (
          <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm">
            <p><strong>Nota {info.numero}</strong> série {info.serie} · {info.anoMes} · {info.uf}<br />Emitente: {info.fornecedor ?? 'fornecedor novo'} — CNPJ {info.cnpj}</p>
            <p className="text-slate-600">{info.motivo}</p>
            <form action={enviar} className="space-y-2">
              <input type="hidden" name="chave" value={info.chave} />
              <label className="block"><span className="rotulo">XML desta nota</span><input name="xml" type="file" accept=".xml,text/xml,application/xml" required className="campo" /></label>
              <Botao disabled={enviando}>{enviando ? 'Importando…' : 'Importar XML'}</Botao>
            </form>
          </div>
        )}
      </section>
      <section className="cartao space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-bold"><Icone nome="arquivo" className="h-5 w-5 text-marca-600" />Ou envie o XML</h2>
        <p className="text-sm text-slate-600">O distribuidor manda o XML por e-mail ou deixa no portal dele. Pode enviar vários de uma vez.</p>
        <form action={enviar} className="space-y-3">
          <input name="xml" type="file" multiple accept=".xml,text/xml,application/xml" required className="campo" />
          <Botao disabled={enviando}>{enviando ? 'Importando…' : 'Importar'}</Botao>
        </form>
        {estado && !estado.ok && <Aviso tipo="erro">{estado.erro}</Aviso>}
        {estado?.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
      </section>
    </div>
  );
}
