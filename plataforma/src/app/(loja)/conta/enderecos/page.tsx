import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { exigirLogin } from '@/server/auth';
import { Esqueleto, TituloPagina } from '@/components/ui';
import { ListaEnderecos } from '@/components/conta/ListaEnderecos';

export const metadata = { title: 'Endereços' };

async function Conteudo() {
  await connection();
  const u = await exigirLogin('/conta/enderecos');
  const enderecos = await db.endereco.findMany({ where: { usuarioId: u.id }, orderBy: [{ principal: 'desc' }, { criadoEm: 'asc' }] });
  return <ListaEnderecos enderecos={enderecos} nome={u.nome} />;
}

export default function Enderecos() {
  return <><TituloPagina titulo="Endereços" subtitulo="Até 10 endereços de entrega" /><Suspense fallback={<Esqueleto className="h-64" />}><Conteudo /></Suspense></>;
}
