import { config } from '../config.js';
import { hashSenha, verificarSenha, cifrar, decifrar, indiceCego, assinarToken, verificarToken } from '../lib/crypto.js';
import { erro, texto } from '../lib/http.js';

export const PAPEIS = ['cliente', 'farmaceutico', 'admin'];
export const EQUIPE = ['farmaceutico', 'admin'];

export function cpfValido(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function validarSenhaForte(senha) {
  const s = String(senha || '');
  if (s.length < 10 || !/[a-zA-Z]/.test(s) || !/\d/.test(s)) {
    throw erro(400, 'A senha deve ter ao menos 10 caracteres, com letras e números.');
  }
}

const normalizarTelefone = (t) => {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
};

export function criarAuth(store) {
  const SENHA_FALSA = hashSenha('senha-falsa-para-tempo-constante');

  function publico(u) {
    if (!u) return null;
    return {
      id: u.id, nome: u.nome, papel: u.papel, crf: u.crf || null,
      email: decifrar(u.emailCifrado),
      telefone: decifrar(u.telefoneCifrado),
      cpfMascarado: u.cpfCifrado ? decifrar(u.cpfCifrado).replace(/^(\d{3})\d{6}(\d{2})$/, '$1.***.***-$2') : null,
      consentimentoLgpd: u.consentimentoLgpd,
    };
  }

  function registrar(dados, { papel = 'cliente', ip } = {}) {
    const nome = texto(dados.nome, 120);
    const email = texto(dados.email, 180).toLowerCase();
    if (!nome) throw erro(400, 'Nome obrigatório');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw erro(400, 'E-mail inválido');
    validarSenhaForte(dados.senha);
    const cpf = String(dados.cpf || '').replace(/\D/g, '');
    if (!cpfValido(cpf)) throw erro(400, 'CPF inválido');
    const telefone = normalizarTelefone(dados.telefone);
    if (telefone.length < 12) throw erro(400, 'Telefone inválido (informe DDD)');
    if (papel === 'cliente' && dados.consentimentoLgpd !== true) {
      throw erro(400, 'É necessário aceitar a Política de Privacidade (LGPD).');
    }
    const emailIndice = indiceCego(email);
    if (store.encontrar('usuarios', (u) => u.emailIndice === emailIndice)) throw erro(409, 'E-mail já cadastrado');
    if (store.encontrar('usuarios', (u) => u.cpfIndice === indiceCego(cpf))) throw erro(409, 'CPF já cadastrado');

    const u = store.inserir('usuarios', {
      nome,
      papel: PAPEIS.includes(papel) ? papel : 'cliente',
      crf: dados.crf ? texto(dados.crf, 30) : null,
      emailIndice,
      emailCifrado: cifrar(email),
      cpfIndice: indiceCego(cpf),
      cpfCifrado: cifrar(cpf),
      telefoneIndice: indiceCego(telefone),
      telefoneCifrado: cifrar(telefone),
      senhaHash: hashSenha(dados.senha),
      consentimentoLgpd: dados.consentimentoLgpd === true ? new Date().toISOString() : null,
      tentativasFalhas: 0,
      bloqueadoAte: null,
    });
    store.auditar('usuario.registrado', { usuarioId: u.id, ip, detalhes: { papel: u.papel } });
    return publico(u);
  }

  function login(email, senha, ip) {
    const u = store.encontrar('usuarios', (x) => x.emailIndice === indiceCego(texto(email, 180)));
    if (!u) {
      verificarSenha(String(senha || ''), SENHA_FALSA); // tempo constante: não revela se o e-mail existe
      throw erro(401, 'E-mail ou senha inválidos');
    }
    if (u.bloqueadoAte && new Date(u.bloqueadoAte) > new Date()) {
      throw erro(423, 'Conta temporariamente bloqueada por excesso de tentativas. Tente mais tarde.');
    }
    if (!verificarSenha(String(senha || ''), u.senhaHash)) {
      const tentativas = (u.tentativasFalhas || 0) + 1;
      const bloquear = tentativas >= config.seguranca.maxTentativasLogin;
      store.atualizar('usuarios', u.id, {
        tentativasFalhas: bloquear ? 0 : tentativas,
        bloqueadoAte: bloquear ? new Date(Date.now() + config.seguranca.bloqueioMinutos * 60_000).toISOString() : null,
      });
      store.auditar('login.falha', { usuarioId: u.id, ip, detalhes: { bloqueado: bloquear } });
      throw erro(401, 'E-mail ou senha inválidos');
    }
    store.atualizar('usuarios', u.id, { tentativasFalhas: 0, bloqueadoAte: null, ultimoLogin: new Date().toISOString() });
    store.auditar('login.sucesso', { usuarioId: u.id, ip });
    return { token: assinarToken({ sub: u.id, papel: u.papel }), usuario: publico(u) };
  }

  function autenticar(req) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return null;
    const payload = verificarToken(h.slice(7));
    if (!payload) return null;
    if (store.encontrar('tokensRevogados', (t) => t.jti === payload.jti)) return null;
    const u = store.obter('usuarios', payload.sub);
    if (!u) return null;
    return { ...publico(u), jti: payload.jti, exp: payload.exp };
  }

  function logout(usuario) {
    store.inserir('tokensRevogados', { jti: usuario.jti, exp: usuario.exp });
    const agora = Math.floor(Date.now() / 1000);
    store.remover('tokensRevogados', (t) => t.exp < agora);
  }

  const buscarPorTelefone = (tel) => store.encontrar('usuarios', (u) => u.telefoneIndice === indiceCego(normalizarTelefone(tel)));

  return { registrar, login, autenticar, logout, publico, buscarPorTelefone, normalizarTelefone };
}
