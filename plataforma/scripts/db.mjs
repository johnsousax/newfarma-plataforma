// Sobe um PostgreSQL local embutido (sem Docker) para desenvolvimento.
// Uso: node scripts/db.mjs            → inicia e fica rodando (Ctrl+C para parar)
//      node scripts/db.mjs --checar   → sai com código 0 se o banco já está no ar
import 'dotenv/config';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';


const url = new URL(process.env.DATABASE_URL || 'postgresql://farmacia:farmacia@localhost:54329/farmacia');
const porta = Number(url.port || 5432);
const usuario = decodeURIComponent(url.username);
const senha = decodeURIComponent(url.password);
const banco = url.pathname.slice(1);
const dir = path.resolve('.data/postgres');

function portaAberta() {
  return new Promise((ok) => {
    const s = net.connect(porta, '127.0.0.1');
    s.once('connect', () => { s.end(); ok(true); });
    s.once('error', () => ok(false));
  });
}

if (process.argv.includes('--checar')) process.exit((await portaAberta()) ? 0 : 1);

if (await portaAberta()) {
  console.log(`✓ PostgreSQL já está rodando na porta ${porta}`);
  process.exit(0);
}

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const pg = new EmbeddedPostgres({ databaseDir: dir, user: usuario, password: senha, port: porta, persistent: true, onLog: () => {} });
const novo = !fs.existsSync(path.join(dir, 'PG_VERSION'));
if (novo) await pg.initialise();
await pg.start();
if (novo) await pg.createDatabase(banco);
console.log(`🐘 PostgreSQL local rodando em localhost:${porta} (banco "${banco}") — dados em .data/postgres`);

const parar = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
setInterval(() => {}, 1 << 30);
