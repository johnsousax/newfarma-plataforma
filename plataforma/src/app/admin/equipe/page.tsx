import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Badge, Esqueleto, TituloPagina } from '@/components/ui';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { salvarMembroEquipe, alternarAtivoUsuario } from '@/app/acoes/admin';
import { PAPEL, PERMISSOES, EQUIPE } from '@/lib/dominio';
import { data } from '@/lib/formato';

export const metadata = { title: 'Equipe' };

function Selects({ lojas, papel, lojaId }: { lojas: { id: string; nome: string }[]; papel?: string; lojaId?: string | null }) {
  return (
    <>
      <label><span className="rotulo">Papel</span><select name="papel" defaultValue={papel ?? 'ATENDENTE'} className="campo">{EQUIPE.map((p) => <option key={p} value={p}>{PAPEL[p]}</option>)}</select></label>
      <label><span className="rotulo">Loja</span><select name="lojaId" defaultValue={lojaId ?? ''} className="campo"><option value="">Todas (rede)</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
    </>
  );
}

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('equipe');
  const [membros, lojas] = await Promise.all([
    db.usuario.findMany({ where: { papel: { not: 'CLIENTE' } }, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }], include: { loja: { select: { nome: true } } } }),
    db.loja.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' } }),
  ]);
  return (
    <div className="space-y-6">
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>Papel</th><th>Loja</th><th>CRF</th><th>Desde</th><th /></tr></thead>
          <tbody>{membros.map((m) => (
            <tr key={m.id} className={m.ativo ? '' : 'opacity-50'}>
              <td className="font-medium">{m.nome}<span className="block text-xs text-slate-500">{m.email}</span></td>
              <td><Badge cor={m.papel === 'ADMIN' ? 'zinc' : m.papel === 'FARMACEUTICO' ? 'emerald' : 'slate'}>{PAPEL[m.papel]}</Badge></td>
              <td>{m.loja?.nome ?? 'Rede'}</td><td>{m.crf ?? '—'}</td><td>{data(m.criadoEm)}</td>
              <td className="text-right">
                <details className="inline-block text-left">
                  <summary className="cursor-pointer text-sm text-marca-700">Editar</summary>
                  <FormAcao acao={salvarMembroEquipe} className="absolute right-8 z-10 mt-2 w-80 space-y-2 rounded-2xl border bg-white p-4 shadow-xl">
                    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="email" value={m.email} />
                    <label><span className="rotulo">Nome</span><input name="nome" defaultValue={m.nome} className="campo" /></label>
                    <Selects lojas={lojas} papel={m.papel} lojaId={m.lojaId} />
                    <label><span className="rotulo">CRF</span><input name="crf" defaultValue={m.crf ?? ''} className="campo" /></label>
                  </FormAcao>
                </details>
                {m.id !== u.id && <span className="ml-3"><BotaoAcao acao={alternarAtivoUsuario.bind(null, m.id)} confirmar={m.ativo ? 'Desativar acesso?' : undefined}>{m.ativo ? 'Desativar' : 'Reativar'}</BotaoAcao></span>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <FormAcao acao={salvarMembroEquipe} rotulo="Adicionar à equipe" className="cartao grid gap-3 p-5 md:grid-cols-3">
        <h2 className="font-semibold md:col-span-3">Novo membro</h2>
        <label><span className="rotulo">Nome completo</span><input name="nome" required className="campo" /></label>
        <label><span className="rotulo">E-mail</span><input name="email" type="email" required className="campo" /></label>
        <label><span className="rotulo">Senha inicial</span><input name="senha" type="password" required minLength={10} className="campo" /></label>
        <Selects lojas={lojas} />
        <label><span className="rotulo">CRF (farmacêutico)</span><input name="crf" placeholder="CRF-SP 12345" className="campo" /></label>
      </FormAcao>
      <section className="cartao overflow-x-auto p-5">
        <h2 className="mb-3 font-semibold">Matriz de permissões</h2>
        <table className="tabela text-xs">
          <thead><tr><th>Área</th>{EQUIPE.map((p) => <th key={p} className="text-center">{PAPEL[p]}</th>)}</tr></thead>
          <tbody>{Object.entries(PERMISSOES).map(([k, ps]) => <tr key={k}><td className="font-medium">{k}</td>{EQUIPE.map((p) => <td key={p} className="text-center">{(ps as readonly string[]).includes(p) ? '✓' : ''}</td>)}</tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

export default function Equipe() {
  return <><TituloPagina titulo="Equipe e permissões" subtitulo="Acesso por papel (RBAC). Alterar papel encerra as sessões do usuário." /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
