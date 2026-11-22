import crypto from 'node:crypto';
import { config } from './config.js';

const emDias = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

function gerarCpf() {
  const n = Array.from({ length: 9 }, () => crypto.randomInt(10));
  const dv = (arr) => { const s = arr.reduce((acc, v, i) => acc + v * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  n.push(dv(n));
  n.push(dv(n));
  return n.join('');
}

// Registros ANVISA abaixo são FICTÍCIOS (apenas demonstração).
export const PRODUTOS_EXEMPLO = [
  { sku: 'DIP-500-10', ean: '7890000000011', nome: 'Dipirona Monoidratada 500mg — 10 comprimidos', categoria: 'Dor e febre', classificacao: 'MIP', principioAtivo: 'dipirona monoidratada', registroAnvisa: '1000000010001', preco: 899, estoqueMinimo: 15, icone: '💊', descricao: 'Analgésico e antitérmico. Medicamento isento de prescrição.', lotes: [{ lote: 'DP2401', validade: emDias(400), quantidade: 80 }, { lote: 'DP2312', validade: emDias(20), quantidade: 12 }] },
  { sku: 'PAR-750-20', ean: '7890000000028', nome: 'Paracetamol 750mg — 20 comprimidos', categoria: 'Dor e febre', classificacao: 'MIP', principioAtivo: 'paracetamol', registroAnvisa: '1000000010002', preco: 1290, estoqueMinimo: 10, icone: '💊', descricao: 'Analgésico e antitérmico.', lotes: [{ lote: 'PC2405', validade: emDias(500), quantidade: 8 }] },
  { sku: 'LOR-10-12', ean: '7890000000035', nome: 'Loratadina 10mg — 12 comprimidos', categoria: 'Alergia', classificacao: 'MIP', principioAtivo: 'loratadina', registroAnvisa: '1000000010003', preco: 1550, estoqueMinimo: 8, icone: '🤧', descricao: 'Antialérgico.', lotes: [{ lote: 'LR2402', validade: emDias(300), quantidade: 40 }] },
  { sku: 'LOS-50-30', ean: '7890000000042', nome: 'Losartana Potássica 50mg — 30 comprimidos', categoria: 'Hipertensão', classificacao: 'TARJA_VERMELHA', principioAtivo: 'losartana potássica', registroAnvisa: '1000000010004', preco: 1890, estoqueMinimo: 10, icone: '❤️', descricao: 'Anti-hipertensivo. Venda sob prescrição médica.', lotes: [{ lote: 'LS2403', validade: emDias(600), quantidade: 50 }] },
  { sku: 'AMX-500-21', ean: '7890000000059', nome: 'Amoxicilina 500mg — 21 cápsulas', categoria: 'Antibióticos', classificacao: 'ANTIMICROBIANO', principioAtivo: 'amoxicilina', registroAnvisa: '1000000010005', preco: 2490, estoqueMinimo: 6, icone: '🧪', descricao: 'Antibiótico. Venda sob prescrição com retenção de receita (RDC 471/2021).', lotes: [{ lote: 'AX2404', validade: emDias(365), quantidade: 25 }] },
  { sku: 'CLN-2-30', ean: '7890000000066', nome: 'Clonazepam 2mg — 30 comprimidos', categoria: 'Controlados', classificacao: 'CONTROLADO', principioAtivo: 'clonazepam', registroAnvisa: '1000000010006', preco: 1790, estoqueMinimo: 5, icone: '🔒', descricao: 'Medicamento de controle especial (lista B1 — Portaria 344/98). Venda somente presencial com receita retida.', lotes: [{ lote: 'CZ2401', validade: emDias(420), quantidade: 20 }] },
  { sku: 'PRT-FPS50', ean: '7890000000073', nome: 'Protetor Solar FPS 50 — 200ml', categoria: 'Dermocosméticos', classificacao: 'NAO_MEDICAMENTO', principioAtivo: null, registroAnvisa: null, preco: 5990, estoqueMinimo: 5, icone: '🧴', descricao: 'Proteção UVA/UVB, resistente à água.', lotes: [{ lote: 'PS2406', validade: emDias(700), quantidade: 30 }] },
  { sku: 'VTC-1G-10', ean: '7890000000080', nome: 'Vitamina C 1g efervescente — 10 un.', categoria: 'Vitaminas', classificacao: 'NAO_MEDICAMENTO', principioAtivo: null, registroAnvisa: null, preco: 1690, estoqueMinimo: 10, icone: '🍊', descricao: 'Suplemento alimentar.', lotes: [{ lote: 'VC2407', validade: emDias(250), quantidade: 4 }] },
  { sku: 'ALC-GEL-500', ean: '7890000000097', nome: 'Álcool em gel 70% — 500ml', categoria: 'Higiene', classificacao: 'NAO_MEDICAMENTO', principioAtivo: null, registroAnvisa: null, preco: 1190, estoqueMinimo: 10, icone: '🧼', descricao: 'Antisséptico para as mãos.', lotes: [{ lote: 'AG2408', validade: emDias(800), quantidade: 60 }] },
  { sku: 'OMP-20-28', ean: '7890000000103', nome: 'Omeprazol 20mg — 28 cápsulas', categoria: 'Digestão', classificacao: 'TARJA_VERMELHA', principioAtivo: 'omeprazol', registroAnvisa: '1000000010007', preco: 2190, estoqueMinimo: 8, icone: '💊', descricao: 'Inibidor da bomba de prótons. Venda sob prescrição médica.', lotes: [{ lote: 'OM2405', validade: emDias(540), quantidade: 0 }] },
];

/** Popula o banco com produtos e usuários de demonstração. Retorna as credenciais geradas. */
export function semear(store, auth) {
  for (const p of PRODUTOS_EXEMPLO) store.inserir('produtos', { ...structuredClone(p), reservado: 0, ativo: true });

  const senha = config.demoSenha || `Demo${crypto.randomBytes(6).toString('hex')}9`;
  const contas = [
    { nome: 'Administrador', email: 'admin@farmacia.local', papel: 'admin', telefone: '11900000001' },
    { nome: 'Dra. Ana Farmacêutica', email: 'farmaceutico@farmacia.local', papel: 'farmaceutico', crf: 'CRF-SP 12345', telefone: '11900000002' },
    { nome: 'Cliente Demonstração', email: 'cliente@farmacia.local', papel: 'cliente', telefone: '11999990000' },
  ];
  for (const c of contas) auth.registrar({ ...c, senha, cpf: gerarCpf(), consentimentoLgpd: true }, { papel: c.papel });
  return { senha, contas: contas.map((c) => ({ email: c.email, papel: c.papel })) };
}
