import { Suspense } from 'react';
import { connection } from 'next/server';
import { paginaAdmin } from '@/server/auth';
import { matrizPermissoes } from '@/server/permissoes';
import { Esqueleto, TituloPagina, Aviso } from '@/components/ui';
import { MatrizPermissoes } from '@/components/admin/MatrizPermissoes';
import { CARGOS_EDITAVEIS, DESCRICAO_PERMISSAO, PAPEL, type Permissao } from '@/lib/dominio';

export const metadata = { title: 'Permissões' };

async function Conteudo() {
  await connection();
  await paginaAdmin('configuracoes');
  const m = await matrizPermissoes();
  const inicial = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.filter((p) => p !== 'ADMIN')]));
  return (
    <div className="space-y-4">
      <Aviso tipo="info">Marque o que cada cargo pode fazer. O <strong>Administrador</strong> (dono) sempre tem acesso a tudo. Regras sanitárias continuam valendo: só farmacêutico com CRF aprova receitas e dispensa antibióticos e controlados, mesmo que outro cargo tenha a área liberada.</Aviso>
      <MatrizPermissoes linhas={(Object.keys(DESCRICAO_PERMISSAO) as Permissao[]).map((k) => ({ chave: k, descricao: DESCRICAO_PERMISSAO[k] }))} cargos={CARGOS_EDITAVEIS.map((c) => ({ chave: c, rotulo: PAPEL[c] }))} inicial={inicial} />
    </div>
  );
}

export default function Permissoes() {
  return <><TituloPagina titulo="Cargos e permissões" subtitulo="Permissões pré-definidas que você pode ajustar" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
