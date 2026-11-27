import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin, COOKIE_SESSAO } from '@/server/auth';
import { sha256 } from '@/server/cripto';
import { JANELA_REAUTENTICACAO_MIN } from '@/server/dois-fatores';
import { Esqueleto, TituloPagina, Aviso } from '@/components/ui';
import { DoisFatores } from '@/components/admin/DoisFatores';
import { dataHora } from '@/lib/formato';

export const metadata = { title: 'Minha segurança' };

async function Conteudo() {
  await connection();
  const u = await paginaAdmin('painel');
  const dono = await db.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { totpAtivoEm: true, codigosRecuperacao: true } });
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  const s = token ? await db.sessao.findUnique({ where: { tokenHash: sha256(token) }, select: { reautenticadoEm: true } }) : null;
  const ate = s?.reautenticadoEm ? new Date(s.reautenticadoEm.getTime() + JANELA_REAUTENTICACAO_MIN * 60_000) : null;
  const sessoes = await db.sessao.findMany({ where: { usuarioId: u.id, mfaPendente: false, expiraEm: { gt: new Date() } }, orderBy: { criadoEm: 'desc' }, take: 10, select: { id: true, criadoEm: true, ip: true, userAgent: true } });
  return (
    <div className="max-w-3xl space-y-6">
      {!dono.totpAtivoEm && (u.papel === 'ADMIN' || u.papel === 'GERENTE') && <Aviso tipo="alerta">Você tem acesso a dados de clientes e ao financeiro. Ative a verificação em duas etapas: mesmo que alguém descubra sua senha, não consegue entrar sem o seu celular.</Aviso>}
      <DoisFatores ativo={!!dono.totpAtivoEm} recuperacaoRestantes={dono.codigosRecuperacao?.length ?? 0} reautenticadoAte={ate && ate > new Date() ? dataHora(ate) : null} />
      <section className="cartao p-5">
        <h2 className="mb-2 font-bold">Acessos ativos da sua conta</h2>
        <ul className="divide-y divide-slate-100 text-sm">{sessoes.map((x) => <li key={x.id} className="py-2"><strong>{dataHora(x.criadoEm)}</strong> · IP {x.ip ?? '—'}<span className="block truncate text-xs text-slate-500">{x.userAgent ?? ''}</span></li>)}</ul>
      </section>
    </div>
  );
}

export default function Seguranca() {
  return <><TituloPagina titulo="Minha segurança" subtitulo="Verificação em duas etapas (app autenticador) e acessos da sua conta" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
