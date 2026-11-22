'use client';
import { useActionState, useState } from 'react';
import { salvarProduto } from '@/app/acoes/admin';
import { Aviso, Botao, Campo } from '@/components/ui';
import { REGRAS, TIPO_MEDICAMENTO } from '@/lib/dominio';
import { OPCOES_ICONE_PRODUTO } from '@/components/icones';

type Opc = { id: string; nome: string };
type P = Record<string, unknown> & { id?: string };
const r = (c: unknown) => (typeof c === 'number' ? (c / 100).toFixed(2).replace('.', ',') : '');

export function FormProduto({ produto, marcas, categorias }: { produto?: P; marcas: Opc[]; categorias: Opc[] }) {
  const [estado, acao, pendente] = useActionState(salvarProduto, null);
  const [cls, setCls] = useState(String(produto?.classificacao ?? 'NAO_MEDICAMENTO'));
  const med = REGRAS[cls as keyof typeof REGRAS]?.medicamento;
  const c = estado && !estado.ok && 'campos' in estado ? (estado.campos as Record<string, string>) : {};
  const v = (k: string) => (produto?.[k] == null ? '' : String(produto[k]));
  return (
    <form action={acao} className="space-y-6">
      {produto?.id && <input type="hidden" name="id" value={produto.id} />}
      <section className="cartao grid gap-4 p-5 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">Identificação</h2>
        <Campo rotulo="Nome" erro={c.nome} className="md:col-span-2"><input name="nome" defaultValue={v('nome')} required className="campo" /></Campo>
        <Campo rotulo="SKU" erro={c.sku}><input name="sku" defaultValue={v('sku')} required className="campo uppercase" /></Campo>
        <Campo rotulo="EAN (código de barras)" erro={c.ean}><input name="ean" defaultValue={v('ean')} inputMode="numeric" className="campo" /></Campo>
        <Campo rotulo="Marca"><select name="marcaId" defaultValue={v('marcaId')} className="campo">{marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></Campo>
        <Campo rotulo="Categoria"><select name="categoriaId" defaultValue={v('categoriaId')} className="campo">{categorias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></Campo>
        <Campo rotulo="Ícone (quando não há foto)"><select name="icone" defaultValue={v('icone') || '💊'} className="campo">{OPCOES_ICONE_PRODUTO.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
        <Campo rotulo="Tags (separadas por vírgula)" ajuda="Ajudam na busca. Use “uso continuo” para permitir assinatura."><input name="tags" defaultValue={(produto?.tags as string[] | undefined)?.join(', ') ?? ''} className="campo" /></Campo>
        <Campo rotulo="Descrição curta" erro={c.descricaoCurta} className="md:col-span-2"><input name="descricaoCurta" defaultValue={v('descricaoCurta')} required className="campo" /></Campo>
        <Campo rotulo="Descrição completa" erro={c.descricao} className="md:col-span-2"><textarea name="descricao" defaultValue={v('descricao')} required rows={4} className="campo" /></Campo>
      </section>

      <section className="cartao grid gap-4 p-5 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">Regulatório (ANVISA)</h2>
        <Campo rotulo="Classificação sanitária">
          <select name="classificacao" value={cls} onChange={(e) => setCls(e.target.value)} className="campo">{Object.entries(REGRAS).map(([k, x]) => <option key={k} value={k}>{x.rotulo}</option>)}</select>
        </Campo>
        {med ? <>
          <Campo rotulo="Tipo"><select name="tipo" defaultValue={v('tipo') || 'GENERICO'} className="campo">{Object.entries(TIPO_MEDICAMENTO).filter(([k]) => k !== 'NAO_SE_APLICA').map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></Campo>
          <Campo rotulo="Registro ANVISA (13 dígitos)"><input name="registroAnvisa" defaultValue={v('registroAnvisa')} inputMode="numeric" className="campo" /></Campo>
          <Campo rotulo="Princípio ativo (DCB)"><input name="principioAtivo" defaultValue={v('principioAtivo')} className="campo" /></Campo>
          <Campo rotulo="Concentração"><input name="concentracao" defaultValue={v('concentracao')} className="campo" /></Campo>
          <Campo rotulo="Forma farmacêutica"><input name="formaFarmaceutica" defaultValue={v('formaFarmaceutica')} className="campo" /></Campo>
          <Campo rotulo="Apresentação"><input name="apresentacao" defaultValue={v('apresentacao')} className="campo" /></Campo>
          {(['indicacoes', 'contraindicacoes', 'modoDeUsar', 'advertencias'] as const).map((k) => <Campo key={k} rotulo={{ indicacoes: 'Indicações', contraindicacoes: 'Contraindicações', modoDeUsar: 'Modo de usar', advertencias: 'Advertências' }[k]} className="md:col-span-2"><textarea name={k} defaultValue={v(k)} rows={2} className="campo" /></Campo>)}
        </> : <input type="hidden" name="tipo" value="NAO_SE_APLICA" />}
        {cls === 'CONTROLADO' && <Aviso tipo="alerta" className="md:col-span-2">Produtos controlados aparecem no site apenas como “somente na loja” e só podem ser vendidos no PDV por farmacêutico, com escrituração.</Aviso>}
      </section>

      <section className="cartao grid gap-4 p-5 md:grid-cols-4">
        <h2 className="font-semibold md:col-span-4">Preço e estoque</h2>
        <Campo rotulo="Preço de venda (R$)" erro={c.preco}><input name="preco" defaultValue={r(produto?.preco)} required className="campo" /></Campo>
        <Campo rotulo="Preço “de” (R$)" ajuda="Opcional, para mostrar desconto"><input name="precoDe" defaultValue={r(produto?.precoDe)} className="campo" /></Campo>
        <Campo rotulo="PMC / CMED (R$)" ajuda={med ? 'Obrigatório para medicamentos' : 'Opcional'}><input name="pmc" defaultValue={r(produto?.pmc)} className="campo" /></Campo>
        <Campo rotulo="Custo médio (R$)"><input name="custo" defaultValue={r(produto?.custo)} className="campo" /></Campo>
        <Campo rotulo="Estoque mínimo (por loja)"><input name="estoqueMinimo" type="number" min={0} defaultValue={v('estoqueMinimo') || '10'} className="campo" /></Campo>
        {produto?.id && <Campo rotulo="Motivo da alteração de preço" className="md:col-span-3"><input name="motivoPreco" placeholder="Ex.: reajuste CMED, campanha…" className="campo" /></Campo>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={produto ? !!produto.ativo : true} className="h-4 w-4 accent-marca-600" /> Ativo na loja</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="destaque" defaultChecked={!!produto?.destaque} className="h-4 w-4 accent-marca-600" /> Destaque na vitrine</label>
      </section>

      <section className="cartao grid gap-4 p-5 md:grid-cols-4">
        <h2 className="font-semibold md:col-span-4">Fiscal (nota fiscal)</h2>
        <Campo rotulo="NCM (8 dígitos)" erro={c.ncm} ajuda="Medicamentos: geralmente 3004.90.69"><input name="ncm" defaultValue={v('ncm')} inputMode="numeric" className="campo" /></Campo>
        <Campo rotulo="CEST" erro={c.cest} ajuda="Obrigatório em itens com ICMS-ST"><input name="cest" defaultValue={v('cest')} inputMode="numeric" className="campo" /></Campo>
        <Campo rotulo="CFOP" erro={c.cfop} ajuda="5102 normal · 5405 com ST"><input name="cfop" defaultValue={v('cfop') || '5405'} inputMode="numeric" className="campo" /></Campo>
        <Campo rotulo="CSOSN / CST ICMS" ajuda="Simples: 500 (ST) ou 102"><input name="cstIcms" defaultValue={v('cstIcms') || '500'} className="campo" /></Campo>
        <Campo rotulo="Origem"><select name="origemFiscal" defaultValue={v('origemFiscal') || '0'} className="campo"><option value="0">0 · Nacional</option><option value="1">1 · Importação direta</option><option value="2">2 · Importada no mercado interno</option><option value="5">5 · Nacional, importado ≤ 40%</option></select></Campo>
        <Campo rotulo="Unidade"><input name="unidade" defaultValue={v('unidade') || 'UN'} className="campo uppercase" /></Campo>
      </section>

      {Object.keys(c).length > 0 && <Aviso tipo="erro">{Object.entries(c).map(([k, m]) => `${k}: ${m}`).join(' · ')}</Aviso>}
      {estado && !estado.ok && !Object.keys(c).length && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <Botao tamanho="lg" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar produto'}</Botao>
    </form>
  );
}
