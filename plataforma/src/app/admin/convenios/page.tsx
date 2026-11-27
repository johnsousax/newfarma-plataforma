import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { situacaoContas } from '@/server/crediario';
import { Badge, Esqueleto, TituloPagina, Vazio, Aviso } from '@/components/ui';
import { BotaoAcao } from '@/components/admin/Acoes';
import { FormConvenio } from '@/components/admin/FormConvenio';
import { alternarConvenioAcao } from '@/app/acoes/gestao';
import { brl } from '@/lib/formato';

export const metadata = { title: 'Convênios' };

async function Conteudo() {
  await connection();
  await paginaAdmin('convenios');
  const convenios = await db.convenio.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }], include: { contas: { where: { ativa: true }, select: { id: true } } } });
  const sit = await situacaoContas();
  return (
    <div className="space-y-5">
      <Aviso tipo="info">Como funciona: cadastre a empresa, depois abra em <Link href="/admin/crediario" className="link">Crediário</Link> uma conta para cada funcionário ligada ao convênio. No caixa, escolha <strong>Convênio</strong> como forma de pagamento: o desconto é aplicado e a compra vai para a fatura da empresa.</Aviso>
      {!convenios.length ? <Vazio icone="convenios" titulo="Nenhum convênio" texto="Cadastre a primeira empresa abaixo." /> : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Empresa</th><th className="text-right">Desconto</th><th className="text-right">Conveniados</th><th>Fecha / paga</th><th className="text-right">Em aberto</th><th /></tr></thead>
            <tbody>{convenios.map((c) => {
              const aberto = c.contas.reduce((s, x) => s + Math.max(0, sit.get(x.id)?.saldo ?? 0), 0);
              return (
                <tr key={c.id}>
                  <td><Link href={`/admin/convenios/${c.id}`} className="font-semibold hover:underline">{c.nome}</Link>{!c.ativo && <Badge className="ml-2">Inativo</Badge>}<span className="block text-xs text-slate-500">{c.contato ?? ''}{c.telefone ? ` · ${c.telefone}` : ''}</span></td>
                  <td className="text-right">{(c.descontoBp / 100).toLocaleString('pt-BR')}%</td>
                  <td className="text-right">{c.contas.length}</td>
                  <td>dia {c.diaFechamento} · +{c.prazoPagamentoDias} dias</td>
                  <td className="text-right font-semibold">{brl(aberto)}</td>
                  <td className="space-x-2 whitespace-nowrap"><Link href={`/admin/convenios/${c.id}`} className="text-sm text-marca-700 hover:underline">Fechamento</Link><BotaoAcao acao={alternarConvenioAcao.bind(null, c.id)} variante="fantasma">{c.ativo ? 'Desativar' : 'Ativar'}</BotaoAcao></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <details className="cartao p-5" open={!convenios.length}>
        <summary className="cursor-pointer font-semibold">Cadastrar convênio</summary>
        <div className="mt-4"><FormConvenio /></div>
      </details>
    </div>
  );
}

export default function Convenios() {
  return <><TituloPagina titulo="Convênios" subtitulo="Empresas parceiras: os funcionários compram com desconto e a empresa paga a fatura" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
