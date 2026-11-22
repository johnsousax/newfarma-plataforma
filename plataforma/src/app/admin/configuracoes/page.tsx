import { Suspense } from 'react';
import { connection } from 'next/server';
import { paginaAdmin } from '@/server/auth';
import { configuracoes } from '@/server/configuracoes';
import { Esqueleto, TituloPagina } from '@/components/ui';
import { Icone } from '@/components/icones';
import { FormAcao } from '@/components/admin/Acoes';
import { salvarConfiguracaoAcao } from '@/app/acoes/admin';

export const metadata = { title: 'Configurações' };

const Secao = ({ titulo, icone, children, descricao }: { titulo: string; icone: Parameters<typeof Icone>[0]['nome']; descricao?: string; children: React.ReactNode }) => (
  <section className="cartao space-y-4 p-6">
    <div>
      <h2 className="flex items-center gap-2 text-lg font-bold"><Icone nome={icone} className="h-5 w-5 text-marca-600" />{titulo}</h2>
      {descricao && <p className="text-sm text-slate-500">{descricao}</p>}
    </div>
    {children}
  </section>
);

async function Conteudo() {
  await connection();
  await paginaAdmin('configuracoes');
  const c = await configuracoes();
  return (
    <div className="max-w-4xl space-y-6">
      <Secao titulo="Contato e responsável técnico" icone="telefone" descricao="Aparecem no rodapé do site, nos botões de WhatsApp e na comanda impressa.">
        <FormAcao acao={salvarConfiguracaoAcao.bind(null, 'contato')} className="grid gap-3 sm:grid-cols-2">
          <label><span className="rotulo">WhatsApp da loja (com DDI e DDD)</span><input name="whatsapp" defaultValue={c.contato.whatsapp} placeholder="5511999990000" className="campo" /></label>
          <label><span className="rotulo">Telefone</span><input name="telefone" defaultValue={c.contato.telefone} className="campo" /></label>
          <label><span className="rotulo">E-mail</span><input name="email" type="email" defaultValue={c.contato.email} className="campo" /></label>
          <label><span className="rotulo">AFE / ANVISA</span><input name="afe" defaultValue={c.contato.afe} className="campo" /></label>
          <label><span className="rotulo">Farmacêutico(a) responsável</span><input name="rtNome" defaultValue={c.contato.rtNome} className="campo" /></label>
          <label><span className="rotulo">CRF</span><input name="rtCrf" defaultValue={c.contato.rtCrf} placeholder="CRF-SP 12345" className="campo" /></label>
        </FormAcao>
      </Secao>
      <Secao titulo="Assistente virtual" icone="assistente" descricao="Nome exibido para os clientes e quantas consultas cada cliente cadastrado pode fazer por dia.">
        <FormAcao acao={salvarConfiguracaoAcao.bind(null, 'assistente')} className="grid gap-3 sm:grid-cols-3">
          <label><span className="rotulo">Nome</span><input name="nome" defaultValue={c.assistente.nome} className="campo" /></label>
          <label><span className="rotulo">Consultas por dia</span><input name="limiteDiario" type="number" min={1} max={100} defaultValue={c.assistente.limiteDiario} className="campo" /></label>
          <label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" name="ativo" defaultChecked={c.assistente.ativo} className="h-4 w-4 accent-marca-600" />Assistente ativa no site</label>
        </FormAcao>
      </Secao>
      <Secao titulo="Impressão" icone="impressora" descricao="Comanda do pedido (impressora térmica de 58 ou 80 mm, pelo navegador).">
        <FormAcao acao={salvarConfiguracaoAcao.bind(null, 'impressao')} className="grid gap-3 sm:grid-cols-3">
          <label><span className="rotulo">Largura do papel</span><select name="larguraMm" defaultValue={c.impressao.larguraMm} className="campo"><option value={80}>80 mm</option><option value={58}>58 mm</option></select></label>
          <label><span className="rotulo">Vias</span><input name="vias" type="number" min={1} max={3} defaultValue={c.impressao.vias} className="campo" /></label>
          <div className="space-y-1 pt-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="automatica" defaultChecked={c.impressao.automatica} className="h-4 w-4 accent-marca-600" />Sugerir impressão automática</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="mostrarCpf" defaultChecked={c.impressao.mostrarCpf} className="h-4 w-4 accent-marca-600" />Mostrar CPF na comanda</label>
          </div>
          <label className="sm:col-span-3"><span className="rotulo">Texto do cabeçalho (opcional)</span><input name="cabecalho" defaultValue={c.impressao.cabecalho} className="campo" /></label>
          <label className="sm:col-span-3"><span className="rotulo">Texto do rodapé</span><input name="rodape" defaultValue={c.impressao.rodape} className="campo" /></label>
        </FormAcao>
      </Secao>
      <Secao titulo="Fiscal (NFC-e)" icone="notas" descricao="Dados do emitente para as notas fiscais. A transmissão à SEFAZ será ligada quando o provedor for contratado.">
        <FormAcao acao={salvarConfiguracaoAcao.bind(null, 'fiscal')} className="grid gap-3 sm:grid-cols-3">
          <label><span className="rotulo">Ambiente</span><select name="ambiente" defaultValue={c.fiscal.ambiente} className="campo"><option value="homologacao">Homologação (testes)</option><option value="producao">Produção</option></select></label>
          <label><span className="rotulo">Regime tributário</span><select name="regime" defaultValue={c.fiscal.regime} className="campo"><option value="simples_nacional">Simples Nacional</option><option value="simples_excesso">Simples — excesso de sublimite</option><option value="normal">Regime normal</option></select></label>
          <label><span className="rotulo">Provedor de emissão</span><select name="provedor" defaultValue={c.fiscal.provedor} className="campo"><option value="nenhum">Nenhum (só gerar)</option><option value="focusnfe">Focus NFe</option><option value="plugnotas">PlugNotas</option><option value="nfeio">NFE.io</option></select></label>
          <label><span className="rotulo">Inscrição estadual</span><input name="inscricaoEstadual" defaultValue={c.fiscal.inscricaoEstadual} className="campo" /></label>
          <label><span className="rotulo">Inscrição municipal</span><input name="inscricaoMunicipal" defaultValue={c.fiscal.inscricaoMunicipal} className="campo" /></label>
          <label><span className="rotulo">ID do CSC</span><input name="cscId" defaultValue={c.fiscal.cscId} className="campo" /></label>
          <label><span className="rotulo">Série da NFC-e</span><input name="serieNfce" type="number" min={1} defaultValue={c.fiscal.serieNfce} className="campo" /></label>
          <label><span className="rotulo">Próximo número</span><input name="proximoNumeroNfce" type="number" min={1} defaultValue={c.fiscal.proximoNumeroNfce} className="campo" /></label>
          <label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" name="emitirAutomaticamente" defaultChecked={c.fiscal.emitirAutomaticamente} className="h-4 w-4 accent-marca-600" />Gerar NFC-e ao concluir venda</label>
        </FormAcao>
      </Secao>
    </div>
  );
}

export default function Configuracoes() {
  return <><TituloPagina titulo="Configurações da loja" subtitulo="Painel do dono: contato, assistente, impressão e fiscal" /><Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense></>;
}
