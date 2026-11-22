import type { Metadata, Viewport } from 'next';
import { Nunito_Sans, Roboto_Slab, Yellowtail } from 'next/font/google';
import { FARMACIA } from '@/lib/farmacia';
import './globals.css';

const nunito = Nunito_Sans({ variable: '--font-nunito', subsets: ['latin'], weight: ['400', '600', '700', '800'] });
const slab = Roboto_Slab({ variable: '--font-roboto-slab', subsets: ['latin'], weight: ['600', '800'] });
const script = Yellowtail({ variable: '--font-yellowtail', subsets: ['latin'], weight: '400' });

export const metadata: Metadata = {
  metadataBase: new URL(FARMACIA.site),
  title: { default: `${FARMACIA.nome} — Farmácia com preço popular`, template: `%s | ${FARMACIA.nome}` },
  description: 'Remédio com preço popular, pago no Pix e entregue em casa. Farmácia de bairro com farmacêutico responsável, entrega ou retirada no balcão.',
  applicationName: FARMACIA.nome,
  openGraph: { type: 'website', locale: 'pt_BR', siteName: FARMACIA.nome, url: FARMACIA.site },
};

export const viewport: Viewport = { themeColor: '#FFC20E' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${nunito.variable} ${slab.variable} ${script.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
