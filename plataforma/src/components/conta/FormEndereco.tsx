'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { salvarEndereco } from '@/app/acoes/conta';
import { Aviso, Botao, Campo } from '@/components/ui';

type End = { id?: string; apelido?: string; destinatario?: string; cep?: string; logradouro?: string; numero?: string; complemento?: string | null; bairro?: string; cidade?: string; uf?: string; principal?: boolean };

export function FormEndereco({ inicial, nomePadrao, aoSalvar }: { inicial?: End; nomePadrao?: string; aoSalvar?: () => void }) {
  const [estado, acao, pendente] = useActionState(salvarEndereco, null);
  const [e, setE] = useState<End>(inicial ?? { apelido: 'Casa', destinatario: nomePadrao ?? '' });
  const [buscando, setBuscando] = useState(false);
  const numeroRef = useRef<HTMLInputElement>(null);
  const campos = estado && !estado.ok && 'campos' in estado ? (estado.campos as Record<string, string>) : {};

  useEffect(() => { if (estado?.ok) aoSalvar?.(); }, [estado, aoSalvar]);

  // Autocompleta pelo CEP usando o ViaCEP (consulta pública feita direto pelo navegador)
  async function buscarCep(cep: string) {
    const c = cep.replace(/\D/g, '');
    if (c.length !== 8) return;
    setBuscando(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const j = await r.json();
      if (!j.erro) { setE((x) => ({ ...x, logradouro: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf })); numeroRef.current?.focus(); }
    } catch { /* preenchimento manual */ } finally { setBuscando(false); }
  }

  const set = (k: keyof End) => (ev: React.ChangeEvent<HTMLInputElement>) => setE((x) => ({ ...x, [k]: ev.target.value }));
  return (
    <form action={acao} className="space-y-3">
      {e.id && <input type="hidden" name="id" value={e.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Identificação" erro={campos.apelido}><input name="apelido" value={e.apelido ?? ''} onChange={set('apelido')} placeholder="Casa, Trabalho…" className="campo" required /></Campo>
        <Campo rotulo="Quem recebe" erro={campos.destinatario}><input name="destinatario" value={e.destinatario ?? ''} onChange={set('destinatario')} className="campo" required /></Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Campo rotulo={buscando ? 'CEP (buscando…)' : 'CEP'} erro={campos.cep}>
          <input name="cep" inputMode="numeric" value={e.cep ?? ''} onChange={(ev) => { const v = ev.target.value.replace(/\D/g, '').slice(0, 8); setE((x) => ({ ...x, cep: v.replace(/^(\d{5})(\d)/, '$1-$2') })); if (v.length === 8) buscarCep(v); }} placeholder="00000-000" className="campo" required />
        </Campo>
        <Campo rotulo="Rua / avenida" erro={campos.logradouro}><input name="logradouro" value={e.logradouro ?? ''} onChange={set('logradouro')} className="campo" required /></Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <Campo rotulo="Número" erro={campos.numero}><input ref={numeroRef} name="numero" value={e.numero ?? ''} onChange={set('numero')} className="campo" required /></Campo>
        <Campo rotulo="Complemento (opcional)"><input name="complemento" value={e.complemento ?? ''} onChange={set('complemento')} placeholder="Apto, bloco…" className="campo" /></Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px]">
        <Campo rotulo="Bairro" erro={campos.bairro}><input name="bairro" value={e.bairro ?? ''} onChange={set('bairro')} className="campo" required /></Campo>
        <Campo rotulo="Cidade" erro={campos.cidade}><input name="cidade" value={e.cidade ?? ''} onChange={set('cidade')} className="campo" required /></Campo>
        <Campo rotulo="UF" erro={campos.uf}><input name="uf" value={e.uf ?? ''} onChange={set('uf')} maxLength={2} className="campo uppercase" required /></Campo>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="principal" defaultChecked={e.principal} className="h-4 w-4 accent-marca-600" /> Usar como endereço principal</label>
      {estado && !estado.ok && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado?.ok && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
      <Botao disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar endereço'}</Botao>
    </form>
  );
}
