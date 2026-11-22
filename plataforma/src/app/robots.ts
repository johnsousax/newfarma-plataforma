import type { MetadataRoute } from 'next';
import { FARMACIA } from '@/lib/farmacia';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/conta', '/checkout', '/pedido', '/carrinho', '/api', '/redefinir-senha'] }],
    sitemap: `${FARMACIA.site}/sitemap.xml`,
  };
}
