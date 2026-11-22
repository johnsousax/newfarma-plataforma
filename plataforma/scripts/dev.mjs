// Um comando para desenvolver: sobe o Postgres local, aplica migrações, popula na
// primeira vez e inicia o Next.js. Uso: npm run dev
import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const rodar = (args) => { const r = spawnSync(npx, args, { stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status ?? 1); };
const checar = () => spawnSync(process.execPath, ['scripts/db.mjs', '--checar']).status === 0;

if (!fs.existsSync('.env')) {
  console.error('❌ Arquivo .env não encontrado. Copie .env.example para .env e preencha (veja o README).');
  process.exit(1);
}

let db = null;
if (!checar()) {
  console.log('🐘 Iniciando PostgreSQL local…');
  db = spawn(process.execPath, ['scripts/db.mjs'], { stdio: 'inherit' });
  for (let i = 0; i < 60 && !checar(); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!checar()) { console.error('❌ PostgreSQL não subiu.'); process.exit(1); }
}

rodar(['prisma', 'migrate', 'deploy']);
rodar(['prisma', 'generate']);

// Popula só se o banco estiver vazio
const vazio = spawnSync(npx, ['tsx', '-e', `
  import 'dotenv/config';
  import pg from 'pg';
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query('SELECT COUNT(*)::int AS n FROM "Produto"');
  await c.end();
  process.exit(r.rows[0].n === 0 ? 0 : 3);
`]).status === 0;
if (vazio) { console.log('🌱 Banco vazio: populando com dados de demonstração…'); rodar(['prisma', 'db', 'seed']); }

const next = spawn(npx, ['next', 'dev', ...process.argv.slice(2)], { stdio: 'inherit' });
const parar = () => { next.kill('SIGINT'); db?.kill('SIGINT'); };
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
next.on('exit', (code) => { db?.kill('SIGINT'); process.exit(code ?? 0); });
