import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrações usam a conexão em modo sessão (DATABASE_URL_MIGRACAO), quando definida;
// o aplicativo usa DATABASE_URL (pooler em modo transação).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --conditions=react-server prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL_MIGRACAO || process.env.DATABASE_URL || '',
  },
});
