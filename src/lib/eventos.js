import { EventEmitter } from 'node:events';

/** Barramento interno de eventos (estoque, alertas, pedidos) — alimenta o SSE em tempo real. */
export const barramento = new EventEmitter();
barramento.setMaxListeners(500);

export function abrirSSE(req, res, tipos) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': conectado\n\n');
  const ouvintes = tipos.map((tipo) => {
    const fn = (dados) => res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`);
    barramento.on(tipo, fn);
    return [tipo, fn];
  });
  const pulso = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(pulso);
    for (const [tipo, fn] of ouvintes) barramento.off(tipo, fn);
  });
}
