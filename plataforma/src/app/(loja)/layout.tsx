import { Cabecalho } from '@/components/loja/Cabecalho';
import { Rodape } from '@/components/loja/Rodape';

export default function LayoutLoja({ children }: LayoutProps<'/'>) {
  return (
    <>
      <Cabecalho />
      <main className="flex-1">{children}</main>
      <Rodape />
    </>
  );
}
