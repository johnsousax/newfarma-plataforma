import { Esqueleto } from '@/components/ui';

export function EsqueletoListagem({ semTitulo }: { semTitulo?: boolean }) {
  return (
    <div className={semTitulo ? '' : 'container-loja py-6'}>
      {!semTitulo && <Esqueleto className="mb-6 h-8 w-72" />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => <Esqueleto key={i} className="h-80" />)}
      </div>
    </div>
  );
}

export function EsqueletoPagina() {
  return (
    <div className="container-loja space-y-4 py-6">
      <Esqueleto className="h-8 w-64" />
      <Esqueleto className="h-64" />
      <Esqueleto className="h-40" />
    </div>
  );
}
