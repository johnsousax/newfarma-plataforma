import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { mensagensDa } from '@/server/assistente/conversas';
import { Badge, Esqueleto, Aviso } from '@/components/ui';
import { BotaoAcao, FormAcao } from '@/components/admin/Acoes';
import { AtualizarSozinho } from '@/components/assistente/Controles';
import { ListaMensagens, Emergencia } from '@/components/assistente/Mensagens';
import { responderAtendimentoAcao, encerrarAtendimentoAcao, assumirAtendimentoAcao } from '@/app/acoes/assistente';
import { linkWhatsPara, configuracoes } from '@/server/configuracoes';
import { brl, data, telefone } from '@/lib/formato';
import { STATUS_PEDIDO } from '@/lib/dominio';
import { Icone } from '@/components/icones';

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const u = await paginaAdmin('atendimento');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await db.conversa.findUnique({ where: { id }, include: { usuario: { select: { id: true, nome: true, telefone: true, email: true, nascimento: true } }, farmaceutico: { select: { nome: true } } } });
  if (!c) notFound();
  const [msgs, pedidos] = await Promise.all([
    mensagensDa(c.id),
    db.pedido.findMany({ where: { usuarioId: c.usuario.id }, orderBy: { criadoEm: 'desc' }, take: 5, include: { itens: { select: { nome: true, quantidade: true } } } }),
  ]);
  const podeResponder = u.papel === 'FARMACEUTICO' && c.status !== 'ENCERRADA';
  const cfg = await configuracoes();
  const ultima = [...msgs].reverse().find((m) => m.autor === 'CLIENTE')?.texto ?? '';
  const whats = linkWhatsPara(c.usuario.telefone, `Olá, ${c.usuario.nome.split(' ')[0]}! Aqui é o farmacêutico da New Farma Popular. Vi sua dúvida com a ${cfg.assistente.nome}${ultima ? `: "${ultima.slice(0, 200)}"` : ''}. Posso ajudar?`);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <AtualizarSozinho ativo={c.status !== 'ENCERRADA'} />
      <div className="space-y-4">
        <Link href="/admin/atendimento" className="text-sm text-slate-500 hover:underline">← Fila</Link>
        <h1 className="text-2xl font-bold">{c.usuario.nome} <Badge cor={c.status === 'ENCERRADA' ? 'slate' : c.status === 'EM_ATENDIMENTO' ? 'emerald' : 'amber'} className="align-middle">{c.status}</Badge></h1>
        {c.motivoEncaminhamento && <Aviso tipo={c.emergencia ? 'erro' : 'info'}>Motivo do encaminhamento: <strong>{c.motivoEncaminhamento}</strong></Aviso>}
        {c.emergencia && <Emergencia />}
        <div className="flex flex-wrap gap-2">
          {whats ? <a href={whats} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"><Icone nome="whatsapp" />Atender no WhatsApp do cliente</a> : <Aviso tipo="alerta">Cliente sem telefone cadastrado: responda pelo campo abaixo.</Aviso>}
          {c.status === 'AGUARDANDO_FARMACEUTICO' && (u.papel === 'FARMACEUTICO' || u.papel === 'ADMIN') && <BotaoAcao variante="secundario" tamanho="md" acao={assumirAtendimentoAcao.bind(null, c.id)}>Assumir atendimento</BotaoAcao>}
        </div>
        <div className="rounded-2xl bg-slate-50 p-4"><ListaMensagens mensagens={msgs} nomeCliente={c.usuario.nome.split(' ')[0]} nomeAssistente={cfg.assistente.nome} /></div>
        {podeResponder ? (
          <FormAcao acao={responderAtendimentoAcao} rotulo="Responder pelo site" className="cartao space-y-3 p-4">
            <input type="hidden" name="conversaId" value={c.id} />
            <textarea name="texto" rows={4} required placeholder="Sua orientação ao cliente. Se necessário, peça que venha à loja ou procure o médico." className="campo" />
            <p className="text-xs text-slate-500">A resposta aparece na conversa do cliente no site e fica registrada com seu nome e CRF.</p>
          </FormAcao>
        ) : c.status !== 'ENCERRADA' && <Aviso tipo="info">Somente farmacêuticos respondem.</Aviso>}
        {podeResponder && <BotaoAcao variante="secundario" confirmar="Encerrar este atendimento?" acao={encerrarAtendimentoAcao.bind(null, c.id)}>Encerrar atendimento</BotaoAcao>}
      </div>
      <aside className="space-y-4">
        <div className="cartao space-y-1 p-5 text-sm">
          <h2 className="mb-2 font-semibold">Cliente</h2>
          <p>{c.usuario.nome}</p>
          <p className="text-slate-500">{c.usuario.email} · {telefone(c.usuario.telefone)}</p>
          {c.usuario.nascimento && <p className="text-slate-500">Nascimento: {data(c.usuario.nascimento)}</p>}
        </div>
        <div className="cartao space-y-2 p-5 text-sm">
          <h2 className="font-semibold">Últimos pedidos</h2>
          {pedidos.map((p) => <div key={p.id}><Link href={`/admin/pedidos/${p.id}`} className="link">#{p.numero}</Link> · {data(p.criadoEm)} · {brl(p.total)} <Badge cor={STATUS_PEDIDO[p.status].cor}>{STATUS_PEDIDO[p.status].rotulo}</Badge><p className="text-xs text-slate-500">{p.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}</p></div>)}
          {!pedidos.length && <p className="text-slate-500">Nenhum pedido.</p>}
        </div>
      </aside>
    </div>
  );
}

export default function DetalheAtendimento(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Esqueleto className="h-96" />}><Conteudo params={props.params} /></Suspense>;
}
