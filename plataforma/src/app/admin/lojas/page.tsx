import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { Badge, Esqueleto, TituloPagina } from '@/components/ui';
import { FormAcao } from '@/components/admin/Acoes';
import { salvarLoja } from '@/app/acoes/admin';

export const metadata = { title: 'Lojas' };

async function Conteudo() {
  await connection();
  await paginaAdmin('lojas');
  const lojas = await db.loja.findMany({ orderBy: { nome: 'asc' }, include: { _count: { select: { equipe: true } } } });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {lojas.map((l) => (
        <FormAcao key={l.id} acao={salvarLoja} className="cartao space-y-3 p-5">
          <input type="hidden" name="id" value={l.id} />
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{l.nome}</h2>{l.centroDistribuicao ? <Badge cor="indigo">Centro de distribuição</Badge> : <Badge>{l._count.equipe} na equipe</Badge>}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="rotulo">Nome</span><input name="nome" defaultValue={l.nome} className="campo" /></label>
            <label className="block"><span className="rotulo">CNPJ</span><input name="cnpj" defaultValue={l.cnpj} className="campo" /></label>
            <label className="block"><span className="rotulo">CEP</span><input name="cep" defaultValue={l.cep} className="campo" /></label>
            <label className="block"><span className="rotulo">Rua</span><input name="logradouro" defaultValue={l.logradouro} className="campo" /></label>
            <label className="block"><span className="rotulo">Número</span><input name="numero" defaultValue={l.numero} className="campo" /></label>
            <label className="block"><span className="rotulo">Bairro</span><input name="bairro" defaultValue={l.bairro} className="campo" /></label>
            <label className="block"><span className="rotulo">Cidade</span><input name="cidade" defaultValue={l.cidade} className="campo" /></label>
            <label className="block"><span className="rotulo">UF</span><input name="uf" defaultValue={l.uf} maxLength={2} className="campo uppercase" /></label>
          </div>
          <label className="block"><span className="rotulo">Horário</span><input name="horario" defaultValue={l.horario} className="campo" /></label>
          <label className="block"><span className="rotulo">Telefone</span><input name="telefone" defaultValue={l.telefone} className="campo" /></label>
          <label className="block"><span className="rotulo">Faixas de CEP atendidas (entrega local)</span><input name="faixasCep" defaultValue={l.faixasCep.join(', ')} placeholder="01000-01599, 01300-01499" className="campo" /></label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="aceitaExpressa" defaultChecked={l.aceitaExpressa} /> Entrega expressa (2h)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="ativa" defaultChecked={l.ativa} /> Ativa</label>
          </div>
        </FormAcao>
      ))}
    </div>
  );
}

export default function Lojas() {
  return <><TituloPagina titulo="Lojas" subtitulo="Área de entrega, expressa e funcionamento de cada unidade" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
