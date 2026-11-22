'use client';

export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-6xl">⚠️</p>
      <h1 className="text-2xl font-bold">Algo deu errado</h1>
      <p className="text-slate-500">Tivemos um problema ao carregar esta página. Tente novamente em instantes.</p>
      <button onClick={reset} className="mt-2 rounded-xl bg-marca-600 px-5 py-2.5 font-semibold text-white">Tentar de novo</button>
    </div>
  );
}
