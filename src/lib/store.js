import fs from 'node:fs';
import path from 'node:path';
import { uuid, sha256 } from './crypto.js';

const COLECOES = [
  'usuarios', 'produtos', 'pedidos', 'receitas', 'movimentos', 'alertas',
  'auditoria', 'conversas', 'escrituracao', 'pagamentos', 'eventosIfood', 'tokensRevogados',
];

/**
 * Armazenamento em memória com persistência opcional em JSON (gravação atômica).
 * Campos sensíveis já chegam cifrados pelos serviços (criptografia por campo).
 * Em produção, substituir por PostgreSQL mantendo a mesma interface.
 */
export class Store {
  constructor({ arquivo = null, persistir = false } = {}) {
    this.arquivo = arquivo;
    this.persistir = persistir && !!arquivo;
    this.dados = Object.fromEntries(COLECOES.map((c) => [c, []]));
    this._timer = null;
    if (this.persistir && fs.existsSync(arquivo)) {
      const lido = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      for (const c of COLECOES) this.dados[c] = lido[c] || [];
    }
  }

  get vazio() { return this.dados.usuarios.length === 0 && this.dados.produtos.length === 0; }

  listar(colecao, filtro = () => true) { return this.dados[colecao].filter(filtro); }
  obter(colecao, id) { return this.dados[colecao].find((d) => d.id === id) || null; }
  encontrar(colecao, filtro) { return this.dados[colecao].find(filtro) || null; }

  inserir(colecao, doc) {
    const novo = { id: doc.id || uuid(), ...doc, criadoEm: doc.criadoEm || new Date().toISOString() };
    this.dados[colecao].push(novo);
    this.salvar();
    return novo;
  }

  atualizar(colecao, id, patch) {
    const doc = this.obter(colecao, id);
    if (!doc) return null;
    Object.assign(doc, patch, { atualizadoEm: new Date().toISOString() });
    this.salvar();
    return doc;
  }

  remover(colecao, filtro) {
    this.dados[colecao] = this.dados[colecao].filter((d) => !filtro(d));
    this.salvar();
  }

  /** Trilha de auditoria encadeada por hash (evidencia adulteração). */
  auditar(acao, { usuarioId = null, alvo = null, ip = null, detalhes = null } = {}) {
    const lista = this.dados.auditoria;
    const anterior = lista.length ? lista[lista.length - 1].hash : 'GENESIS';
    const registro = { id: uuid(), acao, usuarioId, alvo, ip, detalhes, em: new Date().toISOString(), hashAnterior: anterior };
    registro.hash = sha256(JSON.stringify(registro));
    lista.push(registro);
    this.salvar();
    return registro;
  }

  verificarAuditoria() {
    let anterior = 'GENESIS';
    for (const r of this.dados.auditoria) {
      const { hash, ...resto } = r;
      if (r.hashAnterior !== anterior || sha256(JSON.stringify(resto)) !== hash) return { integra: false, quebraEm: r.id };
      anterior = hash;
    }
    return { integra: true, registros: this.dados.auditoria.length };
  }

  salvar() {
    if (!this.persistir || this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.salvarAgora(); }, 200);
    this._timer.unref?.();
  }

  salvarAgora() {
    if (!this.persistir) return;
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    const tmp = `${this.arquivo}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.dados), { mode: 0o600 });
    fs.renameSync(tmp, this.arquivo);
  }
}
