import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Esqueleto, TituloPagina } from '@/components/ui';
import { FormAcao } from '@/components/admin/Acoes';
import { salvarFornecedor } from '@/app/acoes/admin';
import { telefone } from '@/lib/formato';

export const metadata = { title: 'Fornecedores' };

function Campos({ f }: { f?: { id: string; razaoSocial: string; nomeFantasia: string; cnpj: string; email: string | null; telefone: string | null; contato: string | null; prazoEntregaDias: number } }) {
  return (
    <>
      {f && <input type="hidden" name="id" value={f.id} />}
      <div className="grid gap-3 md:grid-cols-3">
        <label><span className="rotulo">Razão social</span><input name="razaoSocial" defaultValue={f?.razaoSocial} required className="campo" /></label>
        <label><span className="rotulo">Nome fantasia</span><input name="nomeFantasia" defaultValue={f?.nomeFantasia} required className="campo" /></label>
        <label><span className="rotulo">CNPJ</span><input name="cnpj" defaultValue={f?.cnpj} required className="campo" /></label>
        <label><span className="rotulo">E-mail de pedidos</span><input name="email" type="email" defaultValue={f?.email ?? ''} className="campo" /></label>
        <label><span className="rotulo">Telefone</span><input name="telefone" defaultValue={f?.telefone ?? ''} className="campo" /></label>
        <div className="grid grid-cols-2 gap-3"><label><span className="rotulo">Contato</span><input name="contato" defaultValue={f?.contato ?? ''} className="campo" /></label><label><span className="rotulo">Prazo (dias)</span><input name="prazoEntregaDias" type="number" min={0} defaultValue={f?.prazoEntregaDias ?? 5} className="campo" /></label></div>
      </div>
    </>
  );
}

async function Conteudo() {
  await connection();
  await paginaAdmin('compras');
  const lista = await db.fornecedor.findMany({ orderBy: { nomeFantasia: 'asc' }, include: { _count: { select: { compras: true } } } });
  return (
    <div className="space-y-4">
      {lista.map((f) => (
        <details key={f.id} className="cartao p-5">
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2"><span><strong>{f.nomeFantasia}</strong> <span className="text-sm text-slate-500">· {f.cnpj} · {telefone(f.telefone)} · prazo {f.prazoEntregaDias}d</span></span><span className="text-sm text-slate-500">{f._count.compras} pedido(s)</span></summary>
          <FormAcao acao={salvarFornecedor} className="mt-4 space-y-3"><Campos f={f} /></FormAcao>
        </details>
      ))}
      <div className="cartao p-5"><h2 className="mb-3 font-semibold">Novo fornecedor</h2><FormAcao acao={salvarFornecedor} rotulo="Cadastrar"><Campos /></FormAcao></div>
    </div>
  );
}

export default function Fornecedores() {
  return <><TituloPagina titulo="Fornecedores" subtitulo="Distribuidoras e laboratórios" /><Suspense fallback={<Esqueleto className="h-64" />}><Conteudo /></Suspense></>;
}
