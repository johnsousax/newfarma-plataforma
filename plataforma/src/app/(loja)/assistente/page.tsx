import { Suspense } from 'react';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { usuarioAtual } from '@/server/auth';
import { conversaAtiva, mensagensDa } from '@/server/assistente/conversas';
import { REGRAS_PUBLICAS } from '@/server/assistente/regras';
import { Aviso, BotaoLink, Esqueleto } from '@/components/ui';
import { FormPergunta, BotoesConversa, AceitarTermo, AtualizarSozinho } from '@/components/assistente/Controles';
import { ListaMensagens, Emergencia } from '@/components/assistente/Mensagens';
import { linkWhatsApp } from '@/lib/farmacia';

export const metadata = { title: 'Tire dúvidas sobre remédios', description: 'Mande a foto do remédio ou da receita e entenda para que ele serve, segundo a bula. Atendimento com farmacêutico.' };

function Regras() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
        <p className="mb-2 font-extrabold text-emerald-900">✅ O assistente pode</p>
        <ul className="space-y-1.5 text-sm text-emerald-950">{REGRAS_PUBLICAS.faz.map((r) => <li key={r}>• {r}</li>)}</ul>
      </div>
      <div className="rounded-2xl bg-oferta-50 p-5 ring-1 ring-oferta-100">
        <p className="mb-2 font-extrabold text-oferta-700">⛔ O assistente nunca</p>
        <ul className="space-y-1.5 text-sm text-oferta-700">{REGRAS_PUBLICAS.naoFaz.map((r) => <li key={r}>• {r}</li>)}</ul>
      </div>
    </div>
  );
}

async function Conteudo() {
  await connection();
  const u = await usuarioAtual();
  if (!u) {
    return (
      <div className="space-y-6">
        <Regras />
        <div className="cartao flex flex-wrap items-center justify-between gap-4 p-6">
          <p className="text-slate-700">Para conversar com o assistente e com o farmacêutico, entre na sua conta. É gratuito.</p>
          <div className="flex gap-2"><BotaoLink href="/entrar?voltar=/assistente">Entrar</BotaoLink><BotaoLink href="/cadastro?voltar=/assistente" variante="secundario">Criar conta</BotaoLink></div>
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
          <p className="text-sm text-slate-700">Suas mensagens são guardadas cifradas e só a equipe farmacêutica pode lê-las, para continuar seu atendimento. As fotos são analisadas e descartadas na hora. Para responder, a pergunta e a foto são processadas por um serviço de inteligência artificial contratado pela farmácia, que não as usa para treinar modelos. Você pode revogar este consentimento quando quiser em Minha conta › Dados e privacidade.</p>
          <AceitarTermo />
        </div>
      </div>
    );
  }
  const conversa = await conversaAtiva(u.id);
  const msgs = conversa ? await mensagensDa(conversa.id) : [];
  const esperando = conversa?.status === 'AGUARDANDO_FARMACEUTICO';
  const emAtendimento = conversa?.status === 'EM_ATENDIMENTO';
  const wa = linkWhatsApp('Olá! Quero falar com o farmacêutico sobre um remédio.');
  return (
    <div className="space-y-4">
      <AtualizarSozinho ativo={!!(esperando || emAtendimento)} />
      {conversa?.emergencia && <Emergencia />}
      {esperando && <Aviso tipo="alerta">🧑‍⚕️ Você está na fila do farmacêutico. Ele vai responder aqui mesmo; esta página se atualiza sozinha.{wa && <> Se preferir, <a href={wa} target="_blank" rel="noopener noreferrer" className="font-bold underline">chame no WhatsApp</a>.</>}</Aviso>}
      {emAtendimento && <Aviso tipo="sucesso">🧑‍⚕️ Um farmacêutico está atendendo você.</Aviso>}
      {msgs.length ? <ListaMensagens mensagens={msgs} /> : (
        <div className="cartao p-6 text-center text-sm text-slate-600">
          <p className="text-4xl">💊</p>
          <p className="mt-2 font-bold text-marca-600">Mande a foto da caixa do remédio, da bula ou da receita.</p>
          <p>Eu digo qual é o medicamento, para que ele é indicado segundo a bula, se precisa de receita e se temos na loja.</p>
        </div>
      )}
      <FormPergunta />
      <BotoesConversa podeChamar={!esperando && !emAtendimento} />
      <details className="cartao p-4 text-sm"><summary className="cursor-pointer font-semibold">Regras do assistente</summary><div className="mt-3"><Regras /></div></details>
    </div>
  );
}

export default function Assistente() {
  return (
    <div className="container-loja max-w-3xl py-6">
      <div className="mb-5 rounded-3xl bg-amarelo-400 p-6 text-marca-600">
        <h1 className="text-3xl font-extrabold"><span className="mr-2 font-normal text-oferta-600" style={{ fontFamily: 'var(--font-yellowtail)' }}>Dúvida</span>sobre um remédio?</h1>
        <p className="mt-1 text-marca-600/85">Mande uma foto e entenda o que é, segundo a bula. Para o seu caso, quem responde é o nosso farmacêutico.</p>
        <p className="mt-3 text-sm font-bold"><a href="tel:192" className="underline">Emergência? Ligue 192 (SAMU)</a> · Intoxicação: 0800 722 6001</p>
      </div>
      <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo /></Suspense>
    </div>
  );
}
