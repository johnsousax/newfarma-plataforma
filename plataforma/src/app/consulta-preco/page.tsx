import { TerminalPreco } from '@/components/loja/TerminalPreco';
import { FARMACIA } from '@/lib/farmacia';

export const metadata = { title: 'Consulta de preço', robots: { index: false } };

/** Totem de consulta de preço para tablet/computador com leitor de código de barras na loja. */
export default function ConsultaPreco() {
  return <TerminalPreco loja={FARMACIA.nome} />;
}
