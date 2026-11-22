import Link from 'next/link';
import { Badge, cx } from '@/components/ui';
import { AVISO_FIXO, CONTATOS_EMERGENCIA } from '@/server/assistente/regras';
import { brl, dataHora } from '@/lib/formato';
import type { DadosMensagem } from '@/server/assistente/conversas';

type M = { id: string; autor: string; texto: string; criadoEm: Date; teveImagem: boolean; dados: DadosMensagem | null };

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
      <p className="font-extrabold">🚨 Em caso de emergência, não espere:</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {CONTATOS_EMERGENCIA.map((c) => (
          <li key={c.numero}><a href={`tel:${c.numero.replace(/\D/g, '')}`} className="block rounded-xl bg-white px-3 py-2 font-bold hover:bg-oferta-100">{c.nome}: {c.numero}<span className="block text-xs font-normal">{c.quando}</span></a></li>
        ))}
      </ul>
    </div>
  );
}

export function ListaMensagens({ mensagens, nomeCliente }: { mensagens: M[]; nomeCliente?: string }) {
  return (
    <ol className="space-y-4">
      {mensagens.map((m) => {
        const cliente = m.autor === 'CLIENTE';
        if (m.autor === 'SISTEMA') return <li key={m.id} className="text-center text-xs text-slate-500">{m.texto}</li>;
        return (
          <li key={m.id} className={cx('flex', cliente ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[90%] space-y-3 rounded-2xl px-4 py-3 text-sm sm:max-w-[75%]', cliente ? 'rounded-br-md bg-marca-600 text-white' : m.autor === 'FARMACEUTICO' ? 'rounded-bl-md border-2 border-emerald-300 bg-emerald-50' : 'rounded-bl-md border border-slate-200 bg-white')}>
              <p className={cx('text-xs font-bold', cliente ? 'text-marca-100' : 'text-slate-500')}>
                {cliente ? nomeCliente ?? 'Você' : m.autor === 'FARMACEUTICO' ? '🧑‍⚕️ Farmacêutico(a)' : '🤖 Assistente virtual'}{m.teveImagem ? ' · 📷 foto' : ''}
              </p>
              <p className="whitespace-pre-line leading-relaxed">{m.texto}</p>
              {m.dados?.emergencia && <Emergencia />}
              {!!m.dados?.medicamentos?.length && (
                <ul className="space-y-2">
                  {m.dados.medicamentos.map((d, i) => (
                    <li key={i} className="rounded-xl bg-slate-50 p-3">
                      <p className="font-bold text-slate-900">{d.nome}{d.concentracao ? ` · ${d.concentracao}` : ''}</p>
                      {d.principio_ativo && <p className="text-xs text-slate-500">Princípio ativo: {d.principio_ativo}</p>}
                      {d.para_que_serve_segundo_a_bula && <p className="mt-1 text-slate-700"><strong>Segundo a bula:</strong> {d.para_que_serve_segundo_a_bula}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge cor={VENDA[d.venda]?.cor}>{VENDA[d.venda]?.rotulo}</Badge>
                        {d.confianca !== 'alta' && <Badge cor="amber">Leitura {d.confianca === 'baixa' ? 'incerta' : 'parcial'}: confira a embalagem</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!!m.dados?.produtos?.length && (
                <div>
                  <p className="mb-1 text-xs font-bold text-slate-500">Na nossa loja</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {m.dados.produtos.map((p) => (
                      <li key={p.slug}>
                        <Link href={`/produto/${p.slug}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 hover:border-marca-400">
                          <span className="text-2xl">{p.icone}</span>
                          <span className="min-w-0 flex-1"><span className="line-clamp-2 text-xs font-semibold">{p.nome}</span><span className="text-xs font-extrabold text-oferta-600">{p.classificacao === 'CONTROLADO' ? 'Somente na loja' : p.disponivel > 0 ? brl(p.preco) : 'Esgotado'}</span></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {m.autor === 'ASSISTENTE' && !m.dados?.emergencia && <p className="border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-500">{AVISO_FIXO}</p>}
              <p className={cx('text-[10px]', cliente ? 'text-marca-200' : 'text-slate-400')}>{dataHora(m.criadoEm)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
