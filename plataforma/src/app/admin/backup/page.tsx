import Link from 'next/link';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, COOKIE_SESSAO } from '@/server/auth';
import { sha256 } from '@/server/cripto';
import { JANELA_REAUTENTICACAO_MIN } from '@/server/dois-fatores';
import { Aviso, Esqueleto, TituloPagina } from '@/components/ui';
import { Icone } from '@/components/icones';
import { dataHora } from '@/lib/formato';

export const metadata = { title: 'Backup' };
const recente = (d?: Date | null) => !!d && Date.now() - d.getTime() < JANELA_REAUTENTICACAO_MIN * 60_000;

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('backup');
  const [dono, ultimos] = await Promise.all([
    db.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { totpAtivoEm: true } }),
    db.auditoria.findMany({ where: { acao: 'backup.baixado' }, orderBy: { seq: 'desc' }, take: 5, select: { seq: true, criadoEm: true, usuarioId: true, detalhes: true } }),
  ]);
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  const s = token ? await db.sessao.findUnique({ where: { tokenHash: sha256(token) }, select: { reautenticadoEm: true } }) : null;
  const liberado = !dono.totpAtivoEm || recente(s?.reautenticadoEm);
  const nomes = await db.usuario.findMany({ where: { id: { in: ultimos.map((x) => x.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } });
  return (
    <div className="max-w-3xl space-y-5">
      <Aviso tipo="info">O banco do sistema fica num servidor gerenciado (Supabase) com cópias automáticas do provedor. Este botão gera uma cópia extra, sua, para guardar fora (pendrive, Google Drive). Recomendado: uma vez por semana.</Aviso>
      <section className="cartao space-y-3 p-6">
        <h2 className="text-lg font-bold">Baixar cópia de segurança</h2>
        <p className="text-sm text-slate-600">Inclui produtos, estoque e lotes, clientes, pedidos, financeiro, crediário, convênios, funcionários, escrituração ANVISA e auditoria. Ficam de fora fotos e arquivos de receita (pesados) e senhas. CPFs e dados de saúde continuam cifrados dentro do arquivo.</p>
        {!dono.totpAtivoEm && <Aviso tipo="alerta">Recomendado: ative a <Link href="/admin/seguranca" className="link">verificação em duas etapas</Link> — o arquivo contém dados de todos os clientes.</Aviso>}
        {liberado
          ? <a href="/api/admin/backup" className="inline-flex items-center gap-2 rounded-xl bg-marca-600 px-5 py-3 font-semibold text-white"><Icone nome="backup" className="h-5 w-5" />Baixar backup agora</a>
          : <Aviso tipo="alerta">Ação protegida. Confirme o código do app em <Link href="/admin/seguranca" className="link">Minha segurança</Link> e volte aqui (vale por {JANELA_REAUTENTICACAO_MIN} minutos).</Aviso>}
      </section>
      <section className="cartao p-5">
        <h2 className="mb-2 font-bold">Últimos backups baixados</h2>
        <ul className="divide-y divide-slate-100 text-sm">{ultimos.map((b) => { const d = b.detalhes as { registros?: number } | null; return <li key={b.seq} className="py-2">{dataHora(b.criadoEm)} · {nomes.find((n) => n.id === b.usuarioId)?.nome ?? '—'} · {d?.registros?.toLocaleString('pt-BR') ?? '?'} registros</li>; })}{!ultimos.length && <li className="py-2 text-slate-500">Nenhum ainda.</li>}</ul>
      </section>
    </div>
  );
}

export default function Backup() {
  return <><TituloPagina titulo="Backup" subtitulo="Cópia de segurança dos dados da farmácia" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
