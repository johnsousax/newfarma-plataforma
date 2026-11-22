import Link from 'next/link';

export default function NaoEncontrado() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-6xl">🔍</p>
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-slate-500">O endereço pode ter mudado ou o produto não está mais disponível.</p>
      <Link href="/" className="mt-2 rounded-xl bg-marca-600 px-5 py-2.5 font-semibold text-white">Voltar para a loja</Link>
    </div>
  );
}
