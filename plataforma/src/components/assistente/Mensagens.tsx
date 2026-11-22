import Link from 'next/link';
import { Badge, cx } from '@/components/ui';
import { Icone, IconeProduto } from '@/components/icones';
import { AVISO_FIXO, CONTATOS_EMERGENCIA } from '@/server/assistente/regras';
import { brl, dataHora } from '@/lib/formato';
import type { DadosMensagem, ProdutoSugerido } from '@/server/assistente/conversas';

export type MensagemChat = { id: string; autor: string; texto: string; criadoEm: Date | string; teveImagem: boolean; dados: DadosMensagem | null; previaImagem?: string | null };

const VENDA: Record<string, { rotulo: string; cor: string }> = {
  isento_de_prescricao: { rotulo: 'Venda sem receita', cor: 'emerald' },
  exige_receita: { rotulo: 'Precisa de receita', cor: 'red' },
  antibiotico_receita_retida: { rotulo: 'Antibiótico: receita retida', cor: 'orange' },
  controlado_so_na_loja: { rotulo: 'Controlado: só na loja', cor: 'zinc' },
  nao_sei: { rotulo: 'Confirme com o farmacêutico', cor: 'slate' },
};

export function Emergencia() {
  return (
    <div className="rounded-2xl border-2 border-oferta-600 bg-oferta-50 p-4 text-oferta-700" role="alert">
      <p className="flex items-center gap-2 font-extrabold"><Icone nome="emergencia" className="h-5 w-5" />Em caso de emergência, não espere:</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {CONTATOS_EMERGENCIA.map((c) => (
          <li key={c.numero}><a href={`tel:${c.numero.replace(/\D/g, '')}`} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 font-bold hover:bg-oferta-100"><Icone nome="telefone" />{c.nome}: {c.numero}</a><span className="ml-1 text-xs">{c.quando}</span></li>
        ))}
      </ul>
    </div>
  );
}

function CardsProdutos({ produtos }: { produtos: ProdutoSugerido[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {produtos.map((p) => (
        <li key={p.slug}>
          <Link href={`/produto/${p.slug}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 hover:border-marca-400">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-600"><IconeProduto emoji={p.icone} className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="line-clamp-2 text-xs font-semibold text-slate-800">{p.nome}</span><span className="text-xs font-extrabold text-oferta-600">{p.classificacao === 'CONTROLADO' ? 'Somente na loja' : p.disponivel > 0 ? brl(p.preco) : 'Esgotado'}</span></span>
            <Icone nome="seta" className="text-slate-300" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ListaMensagens({ mensagens, nomeCliente, nomeAssistente = 'Clara', linkWhats }: { mensagens: MensagemChat[]; nomeCliente?: string; nomeAssistente?: string; linkWhats?: string | null }) {
  return (
    <ol className="space-y-5">
      {mensagens.map((m) => {
        const cliente = m.autor === 'CLIENTE';
        if (m.autor === 'SISTEMA') return <li key={m.id} className="text-center text-xs text-slate-500">{m.texto}</li>;
        const d = m.dados;
        return (
          <li key={m.id} className={cx('flex gap-3', cliente ? 'justify-end' : 'justify-start')}>
            {!cliente && <span className={cx('mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', m.autor === 'FARMACEUTICO' ? 'bg-emerald-100 text-emerald-700' : 'bg-marca-600 text-white')}><Icone nome={m.autor === 'FARMACEUTICO' ? 'atendimento' : 'assistente'} /></span>}
            <div className={cx('max-w-[88%] space-y-3 text-sm sm:max-w-[78%]', cliente ? 'rounded-2xl rounded-br-md bg-marca-600 px-4 py-3 text-white' : 'min-w-0 flex-1')}>
              {!cliente && <p className="text-xs font-bold text-slate-500">{m.autor === 'FARMACEUTICO' ? 'Farmacêutico(a)' : nomeAssistente}</p>}
              {cliente && nomeCliente && <p className="text-xs font-bold text-marca-100">{nomeCliente}</p>}
              {m.previaImagem && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.previaImagem} alt="Foto enviada" className="max-h-48 rounded-xl" />
              )}
              {cliente && m.teveImagem && !m.previaImagem && <p className="flex items-center gap-1.5 text-xs text-marca-100"><Icone nome="camera" className="h-3.5 w-3.5" />foto enviada</p>}
              <p className={cx('whitespace-pre-line leading-relaxed', !cliente && 'text-[15px] text-slate-800')}>{m.texto}</p>
              {d?.emergencia && <Emergencia />}
              {!!d?.medicamentos?.length && (
                <ul className="space-y-2">
                  {d.medicamentos.map((x, i) => (
                    <li key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="font-bold text-slate-900">{x.nome}{x.concentracao ? ` ${x.concentracao}` : ''}</p>
                      {x.principio_ativo && <p className="text-xs text-slate-500">{x.principio_ativo}</p>}
                      {x.indicacao && <p className="mt-1.5 text-slate-700"><span className="font-semibold">Para que serve:</span> {x.indicacao}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge cor={VENDA[x.venda]?.cor}>{VENDA[x.venda]?.rotulo}</Badge>
                        {x.confianca !== 'alta' && <Badge cor="amber">Confira a embalagem: leitura {x.confianca === 'baixa' ? 'incerta' : 'parcial'}</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!!d?.produtos?.length && <div><p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Na nossa loja</p><CardsProdutos produtos={d.produtos} /></div>}
              {d?.sugestoes && (
                <div className="rounded-xl border border-amarelo-300 bg-amarelo-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amarelo-700">Opções sem receita para {d.sugestoes.sintoma}</p>
                  <CardsProdutos produtos={d.sugestoes.produtos} />
                  <p className="mt-2 text-xs text-amarelo-700">Antes de usar, confirme com o farmacêutico, principalmente se você tem alergia, doença crônica ou usa outros remédios.</p>
                </div>
              )}
              {!cliente && m.autor === 'ASSISTENTE' && !d?.emergencia && (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  {!!d?.informacoes?.length && (
                    <>
                      <p className="mb-1 font-bold text-slate-700">Informações importantes</p>
                      <ul className="mb-2 list-disc space-y-0.5 pl-4">{d.informacoes.map((i, k) => <li key={k}>{i}</li>)}</ul>
                    </>
                  )}
                  <p className="text-[11px] leading-snug text-slate-500">{AVISO_FIXO}</p>
                </div>
              )}
              {d?.encaminhado && linkWhats && !d.emergencia && (
                <a href={linkWhats} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"><Icone nome="whatsapp" />Falar com o farmacêutico</a>
              )}
              <p className={cx('text-[10px]', cliente ? 'text-marca-200' : 'text-slate-400')}>{dataHora(m.criadoEm)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
