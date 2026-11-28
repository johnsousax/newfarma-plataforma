import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { verificarCadeia } from '@/server/auditoria';
import { Aviso, Esqueleto, Paginacao, TituloPagina } from '@/components/ui';
import { dataHora } from '@/lib/formato';

export const metadata = { title: 'Auditoria' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/admin/auditoria'>['searchParams'] }) {
  await connection();
  await paginaAdmin('auditoria');
  const sp = await searchParams;
  const acao = typeof sp.acao === 'string' ? sp.acao : '';
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const where = acao ? { acao: { startsWith: acao } } : {};
  const [total, registros, cadeia] = await Promise.all([db.auditoria.count({ where }), db.auditoria.findMany({ where, orderBy: { seq: 'desc' }, skip: (pagina - 1) * 50, take: 50 }), verificarCadeia()]);
  const ids = [...new Set(registros.map((r) => r.usuarioId).filter((x): x is string => !!x))];
  const nomes = new Map((await db.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  return (
    <div className="space-y-4">
      {cadeia.integra ? <Aviso tipo="sucesso">Cadeia íntegra: {cadeia.total} registros verificados por hash encadeado (SHA-256). Nenhuma adulteração detectada.{cadeia.naoConferidos ? ` ${cadeia.naoConferidos} registro(s) antigos (antes de 27/11/2026) têm o encadeamento conferido, mas não o conteúdo (formato antigo do hash, já corrigido); a tabela é protegida contra alterações no banco.` : ''}</Aviso> : <Aviso tipo="erro">Cadeia QUEBRADA no registro #{cadeia.falhaEm}: o histórico foi alterado fora do sistema. Acione a segurança.</Aviso>}
      <form className="flex gap-2"><input name="acao" defaultValue={acao} placeholder="Filtrar por ação (ex.: receita, login, pedido)" className="campo max-w-sm" /><button className="rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Filtrar</button></form>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>#</th><th>Quando</th><th>Ação</th><th>Usuário</th><th>Alvo</th><th>IP</th><th>Detalhes</th><th>Hash</th></tr></thead>
          <tbody>{registros.map((r) => <tr key={r.seq}><td>{r.seq}</td><td className="whitespace-nowrap">{dataHora(r.criadoEm)}</td><td className="font-mono text-xs">{r.acao}</td><td>{r.usuarioId ? nomes.get(r.usuarioId) ?? r.usuarioId.slice(0, 8) : 'sistema'}</td><td className="font-mono text-xs">{r.alvo?.slice(0, 8) ?? ''}</td><td className="text-xs">{r.ip ?? ''}</td><td className="max-w-xs truncate font-mono text-xs">{r.detalhes ? JSON.stringify(r.detalhes) : ''}</td><td className="font-mono text-xs text-slate-400">{r.hash.slice(0, 10)}…</td></tr>)}</tbody>
        </table>
      </div>
      <Paginacao pagina={pagina} paginas={Math.ceil(total / 50)} href={(n) => `/admin/auditoria?acao=${encodeURIComponent(acao)}&pagina=${n}`} />
    </div>
  );
}

export default function Auditoria(props: PageProps<'/admin/auditoria'>) {
  return <><TituloPagina titulo="Trilha de auditoria" subtitulo="Registro imutável de ações sensíveis (LGPD, ANVISA, financeiro)" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
