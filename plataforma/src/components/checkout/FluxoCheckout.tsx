'use client';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { finalizarPedido, simularCheckout } from '@/app/acoes/pedidos';
import { FormCartao } from './FormCartao';
import { FormEndereco } from '@/components/conta/FormEndereco';
import { Aviso, Botao, cx } from '@/components/ui';
import { brl, cep as fmtCep } from '@/lib/formato';
import { FARMACIA } from '@/lib/farmacia';
import { tokenizar, type CartaoDigitado } from '@/lib/tokenizacao';
import { Icone } from '@/components/icones';

type Endereco = { id: string; apelido: string; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string; cep: string; principal: boolean };
type Sim = Extract<Awaited<ReturnType<typeof simularCheckout>>, { ok: true }>['dados'];
type Modalidade = 'ENTREGA_PADRAO' | 'ENTREGA_EXPRESSA' | 'RETIRADA';

export function FluxoCheckout({ enderecos, nome, exigeReceita }: { enderecos: Endereco[]; nome: string; exigeReceita: boolean }) {
  const [enderecoId, setEnderecoId] = useState(enderecos.find((e) => e.principal)?.id ?? enderecos[0]?.id);
  const [modo, setModo] = useState<'entrega' | 'retirada'>(enderecos.length ? 'entrega' : 'retirada');
  const [modalidade, setModalidade] = useState<Modalidade>('ENTREGA_PADRAO');
  const [lojaId, setLojaId] = useState<string>();
  const [pontos, setPontos] = useState(0);
  const [metodo, setMetodo] = useState<'CARTAO_CREDITO' | 'PIX'>('PIX');
  const [cartao, setCartao] = useState<CartaoDigitado>({ numero: '', nome: '', validade: '', cvv: '', parcelas: 1 });
  const [novoEndereco, setNovoEndereco] = useState(!enderecos.length);
  const [sim, setSim] = useState<Sim | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [calculando, iniciarCalculo] = useTransition();
  const [enviando, iniciarEnvio] = useTransition();

  const mod: Modalidade = modo === 'retirada' ? 'RETIRADA' : modalidade;

  const recalcular = useCallback(() => {
    iniciarCalculo(async () => {
      const r = await simularCheckout({ modalidade: mod, enderecoId: modo === 'entrega' ? enderecoId : undefined, lojaId: modo === 'retirada' ? lojaId : undefined, pontos });
      if (!r.ok) { setErro(r.erro); return; }
      const d = r.dados!;
      setSim(d);
      setErro(null);
      // Escolhe automaticamente uma opção válida
      if (modo === 'entrega' && !d.entregas.find((e) => e.modalidade === modalidade && e.disponivel)) {
        const primeira = d.entregas.find((e) => e.disponivel);
        if (primeira && primeira.modalidade !== modalidade) setModalidade(primeira.modalidade as Modalidade);
      }
      if (modo === 'retirada' && !lojaId) { const l = d.retiradas.find((x) => x.disponivel); if (l) setLojaId(l.lojaId); }
    });
  }, [mod, modo, enderecoId, lojaId, pontos, modalidade]);

  useEffect(() => { recalcular(); }, [recalcular]);

  function confirmar() {
    setErro(null);
    let pagamento: unknown;
    if (!exigeReceita) {
      if (metodo === 'PIX') pagamento = { metodo: 'PIX' };
      else {
        try { pagamento = tokenizar(cartao); } catch (e) { setErro((e as Error).message); return; }
      }
    }
    iniciarEnvio(async () => {
      const r = await finalizarPedido({ modalidade: mod, enderecoId: modo === 'entrega' ? enderecoId : undefined, lojaId: modo === 'retirada' ? lojaId : undefined, pontos, pagamento });
      if (r && !r.ok) setErro(r.erro);
    });
  }

  const t = sim?.totais;
  const passo = 'cartao p-5 space-y-4';
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <section className={passo}>
          <h2 className="flex items-center gap-2 text-lg font-bold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-marca-600 text-sm text-white">1</span> Como você quer receber?</h2>
          <div className="grid grid-cols-2 gap-2">
            {(['entrega', 'retirada'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setModo(m)} className={cx('rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold', modo === m ? 'border-marca-600 bg-marca-50 text-marca-900' : 'border-slate-200 hover:border-slate-300')}>
                {m === 'entrega' ? 'Receber em casa' : 'Retirar na loja'}<span className="block text-xs font-normal text-slate-500">{m === 'entrega' ? 'Expressa em até 2h ou padrão' : 'Grátis · pronto em 1 hora'}</span>
              </button>
            ))}
          </div>

          {modo === 'entrega' && (
            <div className="space-y-3">
              {enderecos.map((e) => (
                <label key={e.id} className={cx('flex cursor-pointer gap-3 rounded-xl border p-3 text-sm', enderecoId === e.id ? 'border-marca-500 bg-marca-50/50' : 'border-slate-200')}>
                  <input type="radio" name="endereco" checked={enderecoId === e.id} onChange={() => setEnderecoId(e.id)} className="mt-1 accent-marca-600" />
                  <span><strong>{e.apelido}</strong><span className="block text-slate-600">{e.logradouro}, {e.numero}{e.complemento ? ` — ${e.complemento}` : ''} · {e.bairro}, {e.cidade}/{e.uf} · {fmtCep(e.cep)}</span></span>
                </label>
              ))}
              {novoEndereco ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-4"><FormEndereco nomePadrao={nome} aoSalvar={() => setNovoEndereco(false)} /></div>
              ) : <button type="button" onClick={() => setNovoEndereco(true)} className="text-sm font-semibold text-marca-700">+ Novo endereço</button>}

              {sim && enderecoId && (
                <div className="space-y-2 pt-2">
                  {sim.entregas.map((e) => (
                    <label key={e.modalidade} className={cx('flex items-center gap-3 rounded-xl border p-3 text-sm', !e.disponivel && 'opacity-50', modalidade === e.modalidade && e.disponivel ? 'border-marca-500 bg-marca-50/50' : 'border-slate-200')}>
                      <input type="radio" disabled={!e.disponivel} checked={modalidade === e.modalidade && e.disponivel} onChange={() => setModalidade(e.modalidade as Modalidade)} className="accent-marca-600" />
                      <span className="flex-1"><strong>{e.rotulo}</strong> · {e.disponivel ? `${e.prazo} · sai da ${e.lojaNome}` : e.motivo}</span>
                      {e.disponivel && <strong className={e.preco ? '' : 'text-emerald-700'}>{e.preco ? brl(e.preco) : 'Grátis'}</strong>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {modo === 'retirada' && sim && (
            <div className="space-y-2">
              {sim.retiradas.map((l) => (
                <label key={l.lojaId} className={cx('flex items-center gap-3 rounded-xl border p-3 text-sm', !l.disponivel && 'opacity-50', lojaId === l.lojaId ? 'border-marca-500 bg-marca-50/50' : 'border-slate-200')}>
                  <input type="radio" disabled={!l.disponivel} checked={lojaId === l.lojaId} onChange={() => setLojaId(l.lojaId)} className="accent-marca-600" />
                  <span className="flex-1"><strong>{l.lojaNome}</strong> · {l.prazo}</span>
                  <strong className="text-emerald-700">Grátis</strong>
                </label>
              ))}
            </div>
          )}
        </section>

        {sim && sim.saldoPontos >= 100 && (
          <section className={passo}>
            <h2 className="flex items-center gap-2 text-lg font-bold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-marca-600 text-sm text-white">2</span> Usar meus pontos</h2>
            <p className="text-sm text-slate-600">Você tem <strong>{sim.saldoPontos} pontos</strong>. Cada 100 pontos = {brl(500)} de desconto (até 30% do pedido).</p>
            {t && t.maxPontos >= 100 ? (
              <div>
                <input type="range" min={0} max={t.maxPontos} step={100} value={Math.min(pontos, t.maxPontos)} onChange={(e) => setPontos(Number(e.target.value))} className="w-full accent-marca-600" aria-label="Pontos a usar" />
                <p className="text-sm">Usar <strong>{Math.min(pontos, t.maxPontos)}</strong> pontos = <strong className="text-emerald-700">−{brl(Math.min(pontos, t.maxPontos) * 5)}</strong></p>
              </div>
            ) : <p className="text-sm text-slate-500">O valor do pedido ainda não permite resgate.</p>}
          </section>
        )}

        <section className={passo}>
          <h2 className="flex items-center gap-2 text-lg font-bold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-marca-600 text-sm text-white">3</span> Pagamento</h2>
          {exigeReceita ? (
            <Aviso tipo="info">Seu pedido tem medicamento com receita. Primeiro você envia a receita e nosso farmacêutico valida; <strong>só depois</strong> você paga (PIX ou cartão). Nada é cobrado agora.</Aviso>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {([['PIX', 'PIX', 'Aprovação na hora'], ['CARTAO_CREDITO', 'Cartão de crédito', `Até ${FARMACIA.maxParcelas}x sem juros`]] as const).map(([v, r, s]) => (
                  <button key={v} type="button" onClick={() => setMetodo(v)} className={cx('rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold', metodo === v ? 'border-marca-600 bg-marca-50 text-marca-900' : 'border-slate-200')}>{r}<span className="block text-xs font-normal text-slate-500">{s}</span></button>
                ))}
              </div>
              {metodo === 'CARTAO_CREDITO' ? <FormCartao total={t?.total ?? 0} valor={cartao} onChange={setCartao} /> : <p className="text-sm text-slate-600">Ao confirmar, mostramos o código PIX copia-e-cola. Ele vale por 30 minutos.</p>}
            </>
          )}
        </section>
      </div>

      <aside className="lg:sticky lg:top-40 lg:self-start">
        <div className={cx('cartao space-y-3 p-5', calculando && 'opacity-70')}>
          <h2 className="text-lg font-bold">Resumo do pedido</h2>
          {t ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Produtos</dt><dd>{brl(t.subtotal)}</dd></div>
              {t.descontoPromocoes > 0 && <div className="flex justify-between text-emerald-700"><dt>Promoções</dt><dd>−{brl(t.descontoPromocoes)}</dd></div>}
              {t.descontoCupom > 0 && <div className="flex justify-between text-emerald-700"><dt>Cupom</dt><dd>−{brl(t.descontoCupom)}</dd></div>}
              {t.descontoPontos > 0 && <div className="flex justify-between text-emerald-700"><dt>Pontos ({t.pontosUsados})</dt><dd>−{brl(t.descontoPontos)}</dd></div>}
              <div className="flex justify-between"><dt>Frete</dt><dd>{t.frete ? brl(t.frete) : <span className="font-semibold text-emerald-700">Grátis</span>}</dd></div>
              <div className="flex justify-between border-t pt-3 text-lg font-extrabold"><dt>Total</dt><dd>{brl(t.total)}</dd></div>
              <p className="text-xs text-slate-500">Você vai ganhar {t.pontosAGanhar} pontos quando o pedido for entregue.</p>
            </dl>
          ) : <div className="h-40 animate-pulse rounded-xl bg-slate-100" />}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Botao bloco tamanho="lg" onClick={confirmar} disabled={enviando || calculando || !sim?.opcaoValida}>
            {enviando ? 'Processando…' : exigeReceita ? 'Confirmar e enviar receita' : metodo === 'PIX' ? 'Gerar PIX e finalizar' : `Pagar ${t ? brl(t.total) : ''}`}
          </Botao>
          {!sim?.opcaoValida && sim && <p className="text-xs text-slate-500">Escolha uma forma de entrega disponível.</p>}
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500"><Icone nome="cadeado" className="h-3.5 w-3.5" />Compra segura · Seus dados protegidos pela LGPD</p>
        </div>
      </aside>
    </div>
  );
}
