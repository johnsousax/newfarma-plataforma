import { FormEsqueci } from '@/components/conta/FormsSenha';

export const metadata = { title: 'Esqueci minha senha' };

export default function Esqueci() {
  return (
    <div className="container-loja max-w-md py-10">
      <div className="cartao p-8">
        <h1 className="mb-1 text-2xl font-bold">Esqueci minha senha</h1>
        <p className="mb-6 text-sm text-slate-500">Informe seu e-mail e enviaremos um link para criar uma nova senha.</p>
        <FormEsqueci />
      </div>
    </div>
  );
}
