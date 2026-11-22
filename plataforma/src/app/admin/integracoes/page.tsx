import { Suspense } from 'react';
import { connection } from 'next/server';
import { paginaAdmin } from '@/server/auth';
import { situacaoIntegracoes, pagamentosSimulados } from '@/server/integracoes';
import { Aviso, Badge, Esqueleto, TituloPagina } from '@/components/ui';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { salvarChaveAnthropic, removerChaveAnthropic } from '@/app/acoes/admin';
import { dataHora } from '@/lib/formato';
import { Icone } from '@/components/icones';

export const metadata = { title: 'Integrações' };

async function Conteudo() {
  await connection();
  await paginaAdmin('lojas');
  const [anthropic] = await situacaoIntegracoes();
  const getnet = ['GETNET_CLIENT_ID', 'GETNET_CLIENT_SECRET', 'GETNET_SELLER_ID'].every((k) => !!process.env[k]);
  return (
    <div className="max-w-3xl space-y-6">
      <section className="cartao space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Icone nome="assistente" className="h-5 w-5 text-marca-600" />Assistente virtual — chave da Anthropic (Claude)</h2>
          {anthropic.origem ? <Badge cor="emerald">Ativo · termina em …{anthropic.final}</Badge> : <Badge cor="amber">Não configurado</Badge>}
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Abra o <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="link">painel de chaves da Anthropic</a> e clique em <strong>Create Key</strong> (nome sugerido: “New Farma — assistente”).</li>
          <li>Copie a chave (começa com <code>sk-ant-</code>) e cole abaixo.</li>
          <li>Antes de salvar, validamos a chave com a Anthropic, sem custo. Depois ela fica <strong>cifrada no banco de dados</strong>, junto com as outras credenciais da farmácia, e nunca mais aparece por inteiro.</li>
        </ol>
        {anthropic.origem === 'painel' && anthropic.atualizadoEm && <p className="text-xs text-slate-500">Configurada pelo painel em {dataHora(anthropic.atualizadoEm)}.</p>}
        {anthropic.origem === 'ambiente' && <p className="text-xs text-slate-500">Usando a variável de ambiente ANTHROPIC_API_KEY da Vercel. Uma chave salva aqui tem prioridade.</p>}
        <FormAcao acao={salvarChaveAnthropic} rotulo={anthropic.origem ? 'Trocar chave' : 'Validar e salvar'} className="space-y-3">
          <input name="chave" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-..." required className="campo font-mono" />
        </FormAcao>
        {anthropic.origem === 'painel' && <BotaoAcao variante="perigo" confirmar="Remover a chave? O assistente passa a encaminhar tudo ao farmacêutico." acao={removerChaveAnthropic}>Remover chave</BotaoAcao>}
        <p className="text-xs text-slate-500">Custo estimado: US$ 0,01 a 0,02 por pergunta com foto. Defina um limite de gastos mensal no painel da Anthropic (Settings › Limits).</p>
      </section>

      <section className="cartao space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Icone nome="cartao" className="h-5 w-5 text-marca-600" />Pagamentos — Getnet</h2>
          <Badge cor={getnet ? 'emerald' : 'amber'}>{getnet ? 'Credenciais cadastradas' : 'Credenciais ausentes'}</Badge>
        </div>
        {pagamentosSimulados() ? (
          <Aviso tipo="alerta"><strong>Modo de teste ligado:</strong> o checkout usa pagamento simulado (cartão 4111 1111 1111 1111 ou PIX com botão de simular). Nenhum valor é cobrado. A integração real com a Getnet está em implantação.</Aviso>
        ) : (
          <Aviso tipo="info">Pagamento online desativado até a integração com a Getnet ser concluída. Os clientes são orientados a finalizar pelo WhatsApp ou na loja.</Aviso>
        )}
        <p className="text-xs text-slate-500">As credenciais da Getnet ficam nas variáveis de ambiente da Vercel (sensíveis), copiadas da tabela de segurança da farmácia.</p>
      </section>
    </div>
  );
}

export default function Integracoes() {
  return <><TituloPagina titulo="Integrações" subtitulo="Chaves de serviços externos usados pela farmácia" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
