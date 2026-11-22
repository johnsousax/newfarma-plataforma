import { Suspense } from 'react';
import { connection } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { indiceCpf } from '@/server/cripto';
import { Badge, Esqueleto, Paginacao, TituloPagina } from '@/components/ui';
import { nivelFidelidade } from '@/lib/dominio';
import { brl, data, telefone } from '@/lib/formato';

export const metadata = { title: 'Clientes' };

async function Conteudo({ searchParams }: { searchParams: PageProps<'/admin/clientes'>['searchParams'] }) {
  await connection();
  await paginaAdmin('clientes');
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const digitos = q.replace(/\D/g, '');
  const filtro = q ? (digitos.length === 11 ? Prisma.sql`AND u."cpfHash" = ${indiceCpf(digitos)}` : Prisma.sql`AND (u.nome ILIKE ${'%' + q + '%'} OR u.email ILIKE ${'%' + q + '%'})`) : Prisma.empty;
  const ordem = sp.ordem === 'recentes' ? Prisma.sql`u."criadoEm" DESC` : Prisma.sql`gasto DESC NULLS LAST`;
  const [linhas, [{ total }]] = await Promise.all([
    db.$queryRaw<{ id: string; nome: string; email: string; telefone: string | null; pontos: number; criadoEm: Date; pedidos: bigint; gasto: bigint | null; ultima: Date | null; gasto12: bigint | null }[]>`
      SELECT u.id, u.nome, u.email, u.telefone, u.pontos, u."criadoEm",
        COUNT(p.id) FILTER (WHERE p.status = 'ENTREGUE') AS pedidos, SUM(p.total) FILTER (WHERE p.status = 'ENTREGUE') AS gasto, MAX(p."criadoEm") AS ultima,
        SUM(p.total) FILTER (WHERE p.status = 'ENTREGUE' AND p."criadoEm" > now() - interval '365 days') AS gasto12
      FROM "Usuario" u LEFT JOIN "Pedido" p ON p."usuarioId" = u.id
      WHERE u.papel = 'CLIENTE' AND u.ativo ${filtro}
      GROUP BY u.id ORDER BY ${ordem} LIMIT 40 OFFSET ${(pagina - 1) * 40}`,
    db.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total FROM "Usuario" u WHERE u.papel = 'CLIENTE' AND u.ativo ${filtro}`,
  ]);
  return (
    <>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Nome, e-mail ou CPF completo" className="campo max-w-sm" />
        <select name="ordem" defaultValue={typeof sp.ordem === 'string' ? sp.ordem : ''} className="campo w-auto"><option value="">Maior valor (LTV)</option><option value="recentes">Cadastros recentes</option></select>
        <button className="rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Buscar</button>
      </form>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Cliente</th><th>Contato</th><th>Nível</th><th className="text-right">Pedidos</th><th className="text-right">Total gasto</th><th className="text-right">Pontos</th><th>Última compra</th><th>Cliente desde</th></tr></thead>
          <tbody>{linhas.map((c) => {
            const n = nivelFidelidade(Number(c.gasto12 ?? 0));
            return <tr key={c.id}><td className="font-medium">{c.nome}</td><td className="text-xs">{c.email}<span className="block text-slate-500">{telefone(c.telefone)}</span></td><td><Badge>{n.nome}</Badge></td><td className="text-right">{Number(c.pedidos)}</td><td className="text-right font-semibold">{brl(Number(c.gasto ?? 0))}</td><td className="text-right">{c.pontos}</td><td>{c.ultima ? data(c.ultima) : '—'}</td><td className="text-slate-500">{data(c.criadoEm)}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">CPF e dados de saúde não são exibidos nesta lista (minimização — LGPD art. 6º, III).</p>
      <Paginacao pagina={pagina} paginas={Math.ceil(Number(total) / 40)} href={(n) => `/admin/clientes?q=${encodeURIComponent(q)}&pagina=${n}`} />
    </>
  );
}

export default function Clientes(props: PageProps<'/admin/clientes'>) {
  return <><TituloPagina titulo="Clientes" subtitulo="Base de clientes, valor de vida (LTV) e fidelidade" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
