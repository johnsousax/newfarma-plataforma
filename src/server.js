import http from 'node:http';
import { config } from './config.js';
import { criarApp } from './app.js';
import { semear } from './seed.js';

const app = criarApp();
let credenciais = null;
if (app.store.vazio) credenciais = semear(app.store, app.auth);
app.estoque.iniciarMonitoramento();
app.ifood.iniciarPolling();

const servidor = http.createServer(app.handler);
servidor.headersTimeout = 15_000;
servidor.requestTimeout = 30_000;

servidor.listen(config.porta, () => {
  console.log(`\n💊 ${config.farmacia.nome} rodando em http://localhost:${config.porta}`);
  console.log(`   iFood: ${config.ifood.modo} · WhatsApp: ${config.whatsapp.modo} · Pagamentos: ${config.pagamento.modo}`);
  if (config.chaveEfemera) {
    console.log('\n⚠️  APP_MASTER_KEY não definida: usando chave temporária e dados SOMENTE em memória.');
    console.log('   Para persistir: crie o .env (veja .env.example) com APP_MASTER_KEY gerada por "npm run gerar-chave".');
  }
  if (credenciais) {
    console.log('\n👤 Usuários de demonstração criados:');
    for (const c of credenciais.contas) console.log(`   ${c.papel.padEnd(13)} ${c.email}`);
    console.log(`   Senha (todos): ${credenciais.senha}${config.demoSenha ? ' (de DEMO_PASSWORD)' : ' (gerada aleatoriamente nesta execução)'}`);
  }
  console.log('');
});

const encerrar = () => { app.store.salvarAgora(); servidor.close(() => process.exit(0)); };
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
