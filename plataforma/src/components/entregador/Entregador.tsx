'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { enviarPosicaoAcao, confirmarEntregaAcao } from '@/app/acoes/entregador';
import { Botao } from '@/components/ui';
import { Icone } from '@/components/icones';

/** Compartilha a posição a cada ~45 s enquanto a página estiver aberta. */
export function CompartilharPosicao({ token }: { token: string }) {
  const [estado, setEstado] = useState<'parado' | 'ativo' | 'negado'>('parado');
  const ultimo = useRef(0);
  const vigia = useRef<number | null>(null);
  useEffect(() => () => { if (vigia.current != null) navigator.geolocation.clearWatch(vigia.current); }, []);
  const iniciar = () => {
    if (!('geolocation' in navigator)) return setEstado('negado');
    vigia.current = navigator.geolocation.watchPosition(
      (p) => {
        setEstado('ativo');
        if (Date.now() - ultimo.current < 45_000) return;
        ultimo.current = Date.now();
        void enviarPosicaoAcao(token, p.coords.latitude, p.coords.longitude);
      },
      () => setEstado('negado'),
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
  };
  if (estado === 'ativo') return <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Localização sendo compartilhada com a loja</p>;
  return (
    <div className="space-y-1">
      <Botao variante="secundario" bloco onClick={iniciar}><Icone nome="local" />Compartilhar minha localização</Botao>
      {estado === 'negado' && <p className="text-xs text-red-700">Permita o acesso à localização no navegador para a loja acompanhar a entrega.</p>}
    </div>
  );
}

export function ConfirmarEntrega({ token, pedidoId }: { token: string; pedidoId: string }) {
  const [p, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [certeza, setCerteza] = useState(false);
  if (!certeza) return <Botao bloco onClick={() => setCerteza(true)}><Icone nome="ok" />Entreguei</Botao>;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Confirmar que o pedido foi entregue ao cliente?</p>
      <div className="grid grid-cols-2 gap-2">
        <Botao variante="secundario" onClick={() => setCerteza(false)}>Voltar</Botao>
        <Botao disabled={p} onClick={() => iniciar(async () => { const r = await confirmarEntregaAcao(token, pedidoId); if (!r.ok) setErro(r.erro); })}>{p ? 'Confirmando…' : 'Sim, entregue'}</Botao>
      </div>
      {erro && <p className="text-xs text-red-700">{erro}</p>}
    </div>
  );
}

type EventoInstalar = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Botão "Instalar app" (Android/Chrome) ou instrução para iPhone. */
export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [instalado, setInstalado] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
    setInstalado(!!standalone); // eslint-disable-line react-hooks/set-state-in-effect
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const f = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar); };
    window.addEventListener('beforeinstallprompt', f);
    window.addEventListener('appinstalled', () => setInstalado(true));
    return () => window.removeEventListener('beforeinstallprompt', f);
  }, []);
  if (instalado) return null;
  if (evento) return <Botao variante="escuro" bloco onClick={async () => { await evento.prompt(); setEvento(null); }}><Icone nome="instalar" />Instalar o app de entregas</Botao>;
  if (ios) return <p className="rounded-xl bg-marca-50 p-3 text-xs text-marca-800"><strong>Instale como app:</strong> toque em Compartilhar e depois em &quot;Adicionar à Tela de Início&quot;.</p>;
  return null;
}
