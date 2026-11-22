'use client';
import { useActionState, useState, useTransition } from 'react';
import { salvarBanner, gerarBannerIA } from '@/app/acoes/admin';
import { Aviso, Botao, cx } from '@/components/ui';
import { Icone } from '@/components/icones';

type Banner = { id?: string; titulo?: string; subtitulo?: string | null; textoBotao?: string; link?: string; ordem?: number; temArte?: boolean };

const svgParaUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Cadastro/edição de banner: imagem enviada (1600 × 500) ou criada pelo agente de design com IA. */
export function BannerEstudio({ banner }: { banner?: Banner }) {
  const [estado, salvar, salvando] = useActionState(salvarBanner, null);
  const [modo, setModo] = useState<'ia' | 'imagem'>('ia');
  const [b, setB] = useState({ titulo: banner?.titulo ?? '', subtitulo: banner?.subtitulo ?? '', cta: banner?.textoBotao ?? 'Aproveitar', link: banner?.link ?? '/ofertas', ordem: banner?.ordem ?? 9, oferta: '', tema: '', estilo: '', ajustes: '' });
  const [svg, setSvg] = useState<string | null>(null);
  const [previaArquivo, setPreviaArquivo] = useState<string | null>(null);
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [gerando, iniciar] = useTransition();
  const set = (k: keyof typeof b) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setB((x) => ({ ...x, [k]: e.target.value }));

  const gerar = (ajustar: boolean) => iniciar(async () => {
    setErroIA(null);
    const r = await gerarBannerIA({ titulo: b.titulo, subtitulo: b.subtitulo || undefined, cta: b.cta, oferta: b.oferta || undefined, tema: b.tema || undefined, estilo: b.estilo || undefined, ...(ajustar && svg ? { ajustes: b.ajustes, svgAnterior: svg } : {}) });
    if (r.ok && r.dados) { setSvg(r.dados.svg); setB((x) => ({ ...x, ajustes: '' })); } else if (!r.ok) setErroIA(r.erro);
  });

  return (
    <form action={salvar} className="space-y-4">
      {banner?.id && <input type="hidden" name="id" value={banner.id} />}
      <div className="grid gap-3 md:grid-cols-4">
        <label className="md:col-span-2"><span className="rotulo">Chamada principal</span><input name="titulo" value={b.titulo} onChange={set('titulo')} required maxLength={80} className="campo" /></label>
        <label className="md:col-span-2"><span className="rotulo">Texto de apoio</span><input name="subtitulo" value={b.subtitulo} onChange={set('subtitulo')} maxLength={160} className="campo" /></label>
        <label><span className="rotulo">Texto do botão</span><input name="textoBotao" value={b.cta} onChange={set('cta')} required className="campo" /></label>
        <label><span className="rotulo">Link ao clicar</span><input name="link" value={b.link} onChange={set('link')} required className="campo" /></label>
        <label><span className="rotulo">Ordem</span><input name="ordem" type="number" value={b.ordem} onChange={set('ordem')} className="campo" /></label>
      </div>

      <div className="flex gap-2 rounded-xl bg-slate-100 p-1 text-sm">
        {([['ia', 'varinha', 'Criar com o agente de design'], ['imagem', 'imagem', 'Enviar imagem pronta']] as const).map(([m, ic, r]) => (
          <button key={m} type="button" onClick={() => setModo(m)} className={cx('flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 font-semibold', modo === m ? 'bg-white text-marca-700 shadow-sm' : 'text-slate-500')}><Icone nome={ic} />{r}</button>
        ))}
      </div>

      {modo === 'imagem' ? (
        <div className="space-y-2">
          <input type="file" name="imagem" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; setPreviaArquivo(f ? URL.createObjectURL(f) : null); }} className="campo" />
          <p className="text-xs text-slate-500">Tamanho padrão: <strong>1600 × 500 px</strong> (proporção 3,2:1), JPG/PNG/WEBP até 3 MB. Deixe textos importantes no centro-esquerda: no celular as laterais são cortadas.</p>
          {previaArquivo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previaArquivo} alt="Prévia" className="aspect-[16/5] w-full rounded-2xl border object-cover" />
          )}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-marca-100 bg-marca-50/40 p-4">
          <p className="text-sm text-slate-600">O agente cria a arte nas cores da New Farma (amarelo, vermelho e azul), seguindo as regras da ANVISA para propaganda. Cada criação leva de 30 a 90 segundos.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <label><span className="rotulo">Selo de oferta (opcional)</span><input value={b.oferta} onChange={set('oferta')} placeholder="Ex.: até 30% OFF" className="campo" /></label>
            <label><span className="rotulo">Tema / produtos</span><input value={b.tema} onChange={set('tema')} placeholder="Ex.: protetor solar, verão" className="campo" /></label>
            <label><span className="rotulo">Estilo</span><input value={b.estilo} onChange={set('estilo')} placeholder="Ex.: fundo amarelo, clean" className="campo" /></label>
          </div>
          <Botao type="button" variante="escuro" disabled={gerando || b.titulo.length < 3} onClick={() => gerar(false)}>
            <Icone nome={gerando ? 'carregando' : 'varinha'} className={gerando ? 'animate-spin' : ''} />{gerando ? 'Criando o banner…' : svg ? 'Criar outra versão' : 'Criar banner com IA'}
          </Botao>
          {erroIA && <Aviso tipo="erro">{erroIA}</Aviso>}
          {svg && (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={svgParaUrl(svg)} alt="Prévia do banner criado" className="aspect-[16/5] w-full rounded-2xl border bg-white object-cover shadow-sm" />
              <div className="flex flex-wrap gap-2">
                <input value={b.ajustes} onChange={set('ajustes')} placeholder="Peça ajustes: 'título maior', 'fundo azul', 'tirar o selo'…" className="campo flex-1" />
                <Botao type="button" variante="secundario" disabled={gerando || !b.ajustes.trim()} onClick={() => gerar(true)}>Ajustar</Botao>
              </div>
              <input type="hidden" name="svg" value={svg} />
            </div>
          )}
        </div>
      )}
      {banner?.temArte && !svg && !previaArquivo && <p className="text-xs text-slate-500">Este banner já tem uma arte. Envie ou crie outra só se quiser trocar.</p>}
      {estado && !estado.ok && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado?.ok && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
      <Botao disabled={salvando}>{salvando ? 'Salvando…' : banner?.id ? 'Salvar alterações' : 'Publicar banner'}</Botao>
    </form>
  );
}
