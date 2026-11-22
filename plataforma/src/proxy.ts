import { NextResponse, type NextRequest } from 'next/server';

// Verificação otimista: sem cookie de sessão, nem chega a renderizar áreas logadas.
// A autorização de verdade (papel, dono do recurso) acontece no servidor, em cada página e ação.
export function proxy(req: NextRequest) {
  if (!req.cookies.has('fx_sessao')) {
    const url = new URL('/entrar', req.url);
    url.searchParams.set('voltar', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/conta/:path*', '/checkout', '/pedido/:path*'] };
