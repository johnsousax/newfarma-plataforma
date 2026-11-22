'use client';
import { useState } from 'react';
import { brl } from '@/lib/formato';
import { parcelasPara } from '@/lib/farmacia';
import { bandeiraCartao } from '@/lib/texto';
import type { CartaoDigitado } from '@/lib/tokenizacao';

export function FormCartao({ total, valor, onChange }: { total: number; valor: CartaoDigitado; onChange: (c: CartaoDigitado) => void }) {
  const max = parcelasPara(total);
  const [mostrarDica, setMostrarDica] = useState(true);
  const set = (k: keyof CartaoDigitado, v: string | number) => onChange({ ...valor, [k]: v });
  return (
    <div className="space-y-3">
      {mostrarDica && (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
          Ambiente de demonstração: use <strong>4111 1111 1111 1111</strong> (aprovado) ou <strong>4000 0000 0000 0002</strong> (recusado), validade futura e qualquer CVV.
          <button type="button" onClick={() => setMostrarDica(false)} className="ml-2 underline">ok</button>
        </p>
      )}
      <label className="block">
        <span className="rotulo">Número do cartão</span>
        <div className="relative">
          <input inputMode="numeric" autoComplete="cc-number" value={valor.numero} onChange={(e) => set('numero', e.target.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '))} placeholder="0000 0000 0000 0000" className="campo pr-24" />
          {valor.numero.length > 3 && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">{bandeiraCartao(valor.numero)}</span>}
        </div>
      </label>
      <label className="block"><span className="rotulo">Nome impresso no cartão</span><input autoComplete="cc-name" value={valor.nome} onChange={(e) => set('nome', e.target.value.toUpperCase())} className="campo" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="rotulo">Validade</span><input inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={valor.validade} onChange={(e) => set('validade', e.target.value.replace(/\D/g, '').slice(0, 4).replace(/^(\d{2})(\d)/, '$1/$2'))} className="campo" /></label>
        <label className="block"><span className="rotulo">CVV</span><input inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={valor.cvv} onChange={(e) => set('cvv', e.target.value.replace(/\D/g, '').slice(0, 4))} className="campo" /></label>
      </div>
      <label className="block">
        <span className="rotulo">Parcelas</span>
        <select value={valor.parcelas} onChange={(e) => set('parcelas', Number(e.target.value))} className="campo">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}x de {brl(Math.ceil(total / n))} sem juros</option>)}
        </select>
      </label>
      <p className="text-xs text-slate-500">🔒 Os dados do cartão são convertidos em um token no seu navegador e não ficam guardados na farmácia.</p>
    </div>
  );
}
