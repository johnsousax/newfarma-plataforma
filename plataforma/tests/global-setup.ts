// Prepara um banco separado para os testes: cria, aplica migrações e popula com o seed.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';

export default async function prepararBancoDeTeste() {
  const base = new URL(process.env.DATABASE_URL!);
  const nome = `${base.pathname.slice(1)}_teste`;
  const admin = new pg.Client({ connectionString: base.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${nome}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${nome}"`);
  await admin.end();
  base.pathname = `/${nome}`;
  process.env.DATABASE_URL = base.toString();
  const env = { ...process.env, DATABASE_URL: base.toString() };
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore' });
  execSync('npx tsx --conditions=react-server prisma/seed.ts', { env, stdio: 'ignore' });
}
