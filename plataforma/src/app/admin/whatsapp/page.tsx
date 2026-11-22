import { Suspense } from 'react';
import { connection } from 'next/server';
import { paginaAdmin } from '@/server/auth';
import { matrizPermissoes } from '@/server/permissoes';
import { situacaoIntegracoes } from '@/server/integracoes';
import { estadoConexao } from '@/server/whatsapp/evolution';
import { listarConversas } from '@/server/whatsapp/conversas';
import { Esqueleto, TituloPagina, Badge } from '@/components/ui';
import { FormAcao, BotaoAcao } from '@/components/admin/Acoes';
import { WhatsApp, ConectarWhats } from '@/components/whatsapp/Whats';
import { salvarEvolutionAcao, desconectarWhatsAcao } from '@/app/acoes/admin';
import { pode } from '@/lib/dominio';

export const metadata = { title: 'WhatsApp' };

const ROTULO: Record<string, [string, 'emerald' | 'amber' | 'red' | 'slate']> = {
  aberta: ['Conectado', 'emerald'], conectando: ['Conectando', 'amber'], fechada: ['Desconectado', 'red'], sem_instancia: ['Não conectado', 'slate'], nao_configurado: ['Não configurado', 'slate'],
};

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const u = await paginaAdmin('atendimento');
  const [estado, conversas, matriz, sp] = await Promise.all([estadoConexao(), listarConversas(), matrizPermissoes(), searchParams]);
  const dono = pode(u.papel, 'configuracoes', matriz);
  const config = dono && (sp.config === '1' || estado === 'nao_configurado' || estado === 'sem_instancia');
  const integ = dono ? (await situacaoIntegracoes()).filter((i) => i.chave.startsWith('EVOLUTION')) : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge cor={ROTULO[estado][1]}>{ROTULO[estado][0]}</Badge>
        {dono && <a href={config ? '/admin/whatsapp' : '/admin/whatsapp?config=1'} className="text-sm font-semibold text-marca-700 hover:underline">{config ? 'Fechar conexão' : 'Conexão'}</a>}
      </div>
      {config && (
        <section className="cartao grid gap-6 p-5 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="font-bold">1. Servidor do WhatsApp (Evolution API)</h2>
            <p className="text-sm text-slate-500">O mesmo servidor usado no Katalogu pode ser usado aqui: a farmácia ganha uma conexão própria nele.</p>
            <FormAcao acao={salvarEvolutionAcao} className="grid gap-3">
              <label><span className="rotulo">Endereço</span><input name="url" required placeholder="https://evolution.seudominio.com.br" className="campo" /></label>
              <label><span className="rotulo">Chave global (apikey){integ.find((i) => i.chave === 'EVOLUTION_API_KEY')?.final && ` · atual termina em ${integ.find((i) => i.chave === 'EVOLUTION_API_KEY')!.final}`}</span><input name="chave" type="password" autoComplete="off" className="campo" /></label>
            </FormAcao>
          </div>
          <div className="space-y-3">
            <h2 className="font-bold">2. Conectar o número da loja</h2>
            {estado === 'aberta' ? (
              <div className="space-y-2"><p className="text-sm text-emerald-700">Número conectado e recebendo mensagens.</p><BotaoAcao variante="perigo" confirmar="Desconectar o WhatsApp da loja do painel?" acao={desconectarWhatsAcao}>Desconectar</BotaoAcao></div>
            ) : <ConectarWhats />}
          </div>
        </section>
      )}
      <WhatsApp inicial={conversas.map((c) => ({ ...c, ultimaEm: c.ultimaEm.toISOString() }))} estado={estado} />
    </div>
  );
}

export default function Pagina(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><TituloPagina titulo="WhatsApp" subtitulo="Responda os clientes pelo número da loja, direto do painel" /><Suspense fallback={<Esqueleto className="h-[70vh]" />}><Conteudo searchParams={props.searchParams} /></Suspense></>;
}
