import type { MetadataRoute } from 'next';
import { FARMACIA } from '@/lib/farmacia';

// PWA: o cliente pode "instalar" a farmácia na tela inicial do celular
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: FARMACIA.nome,
    short_name: 'New Farma',
    description: 'Remédio com preço popular, pago no Pix e entregue em casa.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFDF7',
    theme_color: '#FFC20E',
    lang: 'pt-BR',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
