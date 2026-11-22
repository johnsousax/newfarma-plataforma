import 'dotenv/config';
import { vi } from 'vitest';

// Banco de teste (criado no global-setup)
const u = new URL(process.env.DATABASE_URL!);
if (!u.pathname.endsWith('_teste')) u.pathname = `${u.pathname}_teste`;
process.env.DATABASE_URL = u.toString();

// Simula cookies/headers do Next fora de uma requisição
const jar = new Map<string, string>();
(globalThis as { __jar?: Map<string, string> }).__jar = jar;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => { jar.set(n, v); },
    delete: (n: string) => { jar.delete(n); },
    has: (n: string) => jar.has(n),
  }),
  headers: async () => new Headers({ 'x-forwarded-for': '10.0.0.1', 'user-agent': 'vitest' }),
}));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
