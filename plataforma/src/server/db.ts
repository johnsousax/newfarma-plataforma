import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

// Uma única instância por processo (o hot reload do Next recria módulos em dev).
const global = globalThis as unknown as { __prisma?: PrismaClient };

/**
 * Conexão. Em produção (Supabase), DATABASE_URL aponta para o pooler em modo transação
 * (porta 6543) com o usuário exclusivo da farmácia e `?schema=newfarma`.
 */
function criar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida. Copie .env.example para .env.');
  const u = new URL(url);
  const schema = u.searchParams.get('schema') ?? undefined;
  u.searchParams.delete('schema');
  const supabase = u.hostname.endsWith('supabase.com') || u.hostname.endsWith('supabase.co');
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: u.toString(), max: Number(process.env.DB_POOL_MAX || (supabase ? 5 : 10)), ssl: supabase ? { rejectUnauthorized: false } : undefined },
      { schema },
    ),
  });
}

export const db = global.__prisma ?? criar();
if (process.env.NODE_ENV !== 'production') global.__prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
