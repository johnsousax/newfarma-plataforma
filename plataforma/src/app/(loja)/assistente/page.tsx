import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { usuarioAtual } from '@/server/auth';
import { conversaUnica, historicoDoCliente, perguntasRestantes } from '@/server/assistente/conversas';
import { REGRAS_PUBLICAS } from '@/server/assistente/regras';
import { configuracoes, linkWhatsLoja } from '@/server/configuracoes';
import { BotaoLink, Esqueleto } from '@/components/ui';
import { Icone } from '@/components/icones';
import { AceitarTermo } from '@/components/assistente/Controles';
import { ChatAssistente } from '@/components/assistente/ChatAssistente';

export const metadata = { title: 'Tire dúvidas sobre remédios', description: 'Mande a foto do remédio ou da receita e entenda para que ele serve. Atendimento com farmacêutico pelo WhatsApp.' };

function Regras() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
        <p className="mb-2 flex items-center gap-2 font-extrabold text-emerald-900"><Icone nome="sucesso" />A assistente pode</p>
        <ul className="space-y-1.5 text-sm text-emerald-950">{REGRAS_PUBLICAS.faz.map((r) => <li key={r} className="flex gap-2"><Icone nome="ok" className="mt-0.5 h-3.5 w-3.5" />{r}</li>)}</ul>
      </div>
      <div className="rounded-2xl bg-oferta-50 p-5 ring-1 ring-oferta-100">
        <p className="mb-2 flex items-center gap-2 font-extrabold text-oferta-700"><Icone nome="proibido" />A assistente nunca</p>
        <ul className="space-y-1.5 text-sm text-oferta-700">{REGRAS_PUBLICAS.naoFaz.map((r) => <li key={r} className="flex gap-2"><Icone nome="fechar" className="mt-0.5 h-3.5 w-3.5" />{r}</li>)}</ul>
      </div>
    </div>
  );
}

async function Conteudo() {
  await connection();
  const [u, cfg] = await Promise.all([usuarioAtual(), configuracoes()]);
  const nome = cfg.assistente.nome;
  if (!u) {
    return (
      <div className="space-y-6">
        <Regras />
        <div className="cartao flex flex-wrap items-center justify-between gap-4 p-6">
          <p className="text-slate-700">A {nome} é exclusiva para clientes cadastrados: {cfg.assistente.limiteDiario} consultas grátis por dia. O cadastro leva 1 minuto.</p>
          <div className="flex gap-2"><BotaoLink href="/cadastro?voltar=/assistente">Criar conta</BotaoLink><BotaoLink href="/entrar?voltar=/assistente" variante="secundario">Entrar</BotaoLink></div>
        </div>
      </div>
    );
  }
  const dados = await db.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { consentimentoAssistenteEm: true } });
  if (!dados.consentimentoAssistenteEm) {
    return (
      <div className="space-y-6">
        <Regras />
        <div className="cartao space-y-3 p-6">
          <h2 className="text-lg font-extrabold text-marca-600">Antes de começar</h2>
          <p className="text-sm text-slate-700">Suas conversas ficam salvas e cifradas para você consultar depois; só a equipe farmacêutica pode lê-las. As fotos são analisadas e descartadas na hora. Para responder, a pergunta e a foto são processadas por um serviço de inteligência artificial contratado pela farmácia, que não as usa para treinar modelos.</p>
          <AceitarTermo />
        </div>
      </div>
    );
  }
  // Uma conversa só, para sempre: mostra todo o histórico do cliente
  const [conversa, msgs, cota] = await Promise.all([conversaUnica(u.id), historicoDoCliente(u.id), perguntasRestantes(u.id)]);
  const ultima = [...msgs].reverse().find((m) => m.autor === 'CLIENTE')?.texto;
  const linkWhats = await linkWhatsLoja(`Olá! Sou ${u.nome.split(' ')[0]} e falei com a ${nome} no site.${ultima && ultima !== '(enviou uma foto)' ? ` Minha dúvida: ${ultima.slice(0, 300)}` : ''}`);
  return (
    <ChatAssistente
      mensagens={msgs.map((m) => ({ ...m, previaImagem: null }))}
      nome={nome}
      restantes={cota.restantes}
      limite={cota.limite}
      linkWhats={linkWhats}
      whatsapp={cfg.contato.whatsapp || null}
      nomeCliente={u.nome}
      emAtendimento={conversa?.status === 'EM_ATENDIMENTO'}
    />
  );
}

export default function Assistente() {
  return (
    <div className="container-loja max-w-6xl py-6">
      <Suspense fallback={<Esqueleto className="h-[70vh]" />}><Conteudo /></Suspense>
      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <a href="tel:192" className="inline-flex items-center gap-1 font-semibold text-oferta-600"><Icone nome="emergencia" className="h-3.5 w-3.5" />Emergência: 192</a>
        <span>Intoxicação: 0800 722 6001</span>
        <span>Apoio emocional (CVV): 188</span>
      </p>
    </div>
  );
}
