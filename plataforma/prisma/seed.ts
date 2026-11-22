// Popula o banco com dados de DEMONSTRAÇÃO (marcas, laboratórios e registros ANVISA fictícios).
// Executar: npm run db:seed   (apaga e recria tudo)
import 'dotenv/config';
import crypto from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { Classificacao, TipoMedicamento, Papel } from '../src/generated/prisma/enums';
import { hashSenha, cifrar, indiceCpf } from '../src/server/cripto';
import { normalizar, slugificar } from '../src/lib/texto';

const urlBanco = new URL(process.env.DATABASE_URL!);
const schemaBanco = urlBanco.searchParams.get('schema') ?? undefined;
urlBanco.searchParams.delete('schema');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlBanco.toString(), ssl: urlBanco.hostname.includes('supabase') ? { rejectUnauthorized: false } : undefined }, { schema: schemaBanco }) });

// Gerador pseudoaleatório determinístico: o mesmo seed gera sempre os mesmos dados
let semente = 20261122;
const rnd = () => ((semente = (semente * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const int = (a: number, b: number) => Math.floor(rnd() * (b - a + 1)) + a;
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const dias = (n: number) => new Date(Date.now() + n * 86_400_000);

function gerarCpf() {
  const n = Array.from({ length: 9 }, () => int(0, 9));
  const dv = (a: number[]) => { const s = a.reduce((acc, v, i) => acc + v * (a.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  n.push(dv(n)); n.push(dv(n));
  return n.join('');
}

const CATEGORIAS = [
  { nome: 'Medicamentos', icone: '💊', cor: '#0f766e', filhas: [
    ['Dor e febre', '🌡️'], ['Gripe e resfriado', '🤧'], ['Alergias', '🌼'], ['Estômago e digestão', '🫄'],
    ['Pressão e coração', '❤️'], ['Diabetes', '🩸'], ['Antibióticos', '🧪'], ['Saúde mental', '🧠'],
  ] },
  { nome: 'Dermocosméticos', icone: '🧴', cor: '#be185d', filhas: [['Proteção solar', '☀️'], ['Cuidados com o rosto', '✨'], ['Hidratação corporal', '💧']] },
  { nome: 'Higiene e beleza', icone: '🪥', cor: '#0369a1', filhas: [['Higiene bucal', '🦷'], ['Cabelos', '💇'], ['Desodorantes', '🌬️'], ['Banho', '🛁']] },
  { nome: 'Vitaminas e suplementos', icone: '🍊', cor: '#c2410c', filhas: [['Vitaminas', '🍋'], ['Suplementos', '💪']] },
  { nome: 'Mamãe e bebê', icone: '🍼', cor: '#7c3aed', filhas: [['Fraldas', '🧷'], ['Cuidados do bebê', '👶']] },
  { nome: 'Saúde e bem-estar', icone: '🩺', cor: '#15803d', filhas: [['Aparelhos de saúde', '📟'], ['Primeiros socorros', '🩹'], ['Testes rápidos', '🧫']] },
] as const;

const MARCAS = [
  ['Vitalis Farma', 'Laboratório Vitalis S.A.'], ['GenériMed', 'GenériMed Indústria Farmacêutica'], ['Medley Brasil', 'Labs Nova Medley'],
  ['Pharmaprime', 'Pharmaprime Ltda.'], ['DermaPura', 'DermaPura Cosméticos'], ['SolarisDerm', 'Solaris Cosméticos'],
  ['Sorriso+', 'Sorriso+ Higiene'], ['BioNature', 'BioNature Nutrição'], ['BabyCare', 'BabyCare Brasil'],
  ['VitaPlus', 'VitaPlus Suplementos'], ['CuraTech', 'CuraTech Equipamentos Médicos'], ['Essencial', 'Linha Essencial (marca própria)'],
] as const;

type P = [nome: string, cat: string, marca: string, cls: Classificacao, tipo: TipoMedicamento, principio: string | null, conc: string | null, forma: string | null, preco: number, precoDe: number | null, icone: string, tags?: string[]];

// prettier-ignore
const PRODUTOS: P[] = [
  // Dor e febre
  ['Dipirona Monoidratada 500mg 10 comprimidos', 'Dor e febre', 'GenériMed', 'MIP', 'GENERICO', 'dipirona monoidratada', '500mg', 'Comprimido', 599, 899, '💊', ['analgesico', 'febre']],
  ['Dipirona Monoidratada 1g 10 comprimidos', 'Dor e febre', 'Vitalis Farma', 'MIP', 'REFERENCIA', 'dipirona monoidratada', '1g', 'Comprimido', 1490, null, '💊', ['analgesico']],
  ['Dipirona Gotas 500mg/ml 20ml', 'Dor e febre', 'GenériMed', 'MIP', 'GENERICO', 'dipirona monoidratada', '500mg/ml', 'Solução oral', 790, null, '💧', ['infantil']],
  ['Paracetamol 750mg 20 comprimidos', 'Dor e febre', 'GenériMed', 'MIP', 'GENERICO', 'paracetamol', '750mg', 'Comprimido', 890, 1290, '💊', ['analgesico', 'febre']],
  ['Paracetamol 750mg 20 comprimidos', 'Dor e febre', 'Vitalis Farma', 'MIP', 'REFERENCIA', 'paracetamol', '750mg', 'Comprimido', 1890, null, '💊'],
  ['Paracetamol 750mg 20 comprimidos', 'Dor e febre', 'Medley Brasil', 'MIP', 'SIMILAR', 'paracetamol', '750mg', 'Comprimido', 1290, null, '💊'],
  ['Ibuprofeno 400mg 10 cápsulas', 'Dor e febre', 'Pharmaprime', 'MIP', 'GENERICO', 'ibuprofeno', '400mg', 'Cápsula', 1150, null, '💊', ['anti-inflamatorio']],
  ['Ibuprofeno 600mg 20 comprimidos', 'Dor e febre', 'Vitalis Farma', 'TARJA_VERMELHA', 'REFERENCIA', 'ibuprofeno', '600mg', 'Comprimido', 2490, null, '💊'],
  ['Relaxante muscular Orfenadrina + Dipirona 10 comprimidos', 'Dor e febre', 'Medley Brasil', 'MIP', 'SIMILAR', 'citrato de orfenadrina + dipirona', '35mg+300mg', 'Comprimido', 1390, 1690, '💪', ['dor muscular']],
  ['Nimesulida 100mg 12 comprimidos', 'Dor e febre', 'GenériMed', 'TARJA_VERMELHA', 'GENERICO', 'nimesulida', '100mg', 'Comprimido', 990, null, '💊'],
  ['Ácido Acetilsalicílico 500mg 20 comprimidos', 'Dor e febre', 'Essencial', 'MIP', 'SIMILAR', 'ácido acetilsalicílico', '500mg', 'Comprimido', 790, null, '💊'],
  // Gripe
  ['Antigripal Paracetamol + Fenilefrina + Clorfeniramina 20 cápsulas', 'Gripe e resfriado', 'Vitalis Farma', 'MIP', 'REFERENCIA', 'paracetamol + fenilefrina + clorfeniramina', null, 'Cápsula', 2190, 2590, '🤧', ['gripe']],
  ['Xarope Expectorante Guaifenesina 120ml', 'Gripe e resfriado', 'Pharmaprime', 'MIP', 'SIMILAR', 'guaifenesina', '13,33mg/ml', 'Xarope', 1890, null, '🍯', ['tosse']],
  ['Ambroxol Xarope Adulto 30mg/5ml 120ml', 'Gripe e resfriado', 'GenériMed', 'MIP', 'GENERICO', 'cloridrato de ambroxol', '30mg/5ml', 'Xarope', 1290, null, '🍯', ['tosse']],
  ['Soro Fisiológico 0,9% Spray Nasal 50ml', 'Gripe e resfriado', 'Essencial', 'MIP', 'SIMILAR', 'cloreto de sódio', '0,9%', 'Spray nasal', 1090, null, '👃', ['nariz']],
  ['Pastilhas para Garganta Mel e Limão 12 unidades', 'Gripe e resfriado', 'Medley Brasil', 'MIP', 'SIMILAR', 'cloreto de cetilpiridínio', '1,4mg', 'Pastilha', 1490, null, '🍋'],
  // Alergias
  ['Loratadina 10mg 12 comprimidos', 'Alergias', 'GenériMed', 'MIP', 'GENERICO', 'loratadina', '10mg', 'Comprimido', 990, 1550, '🌼', ['alergia', 'rinite']],
  ['Loratadina 10mg 12 comprimidos', 'Alergias', 'Vitalis Farma', 'MIP', 'REFERENCIA', 'loratadina', '10mg', 'Comprimido', 2890, null, '🌼'],
  ['Desloratadina 5mg 10 comprimidos', 'Alergias', 'Pharmaprime', 'TARJA_VERMELHA', 'GENERICO', 'desloratadina', '5mg', 'Comprimido', 1990, null, '🌼'],
  ['Dexclorfeniramina 2mg 20 comprimidos', 'Alergias', 'GenériMed', 'TARJA_VERMELHA', 'GENERICO', 'maleato de dexclorfeniramina', '2mg', 'Comprimido', 890, null, '🌼'],
  // Estômago
  ['Omeprazol 20mg 28 cápsulas', 'Estômago e digestão', 'GenériMed', 'TARJA_VERMELHA', 'GENERICO', 'omeprazol', '20mg', 'Cápsula', 1490, 2190, '🫄', ['azia', 'gastrite']],
  ['Omeprazol 20mg 28 cápsulas', 'Estômago e digestão', 'Vitalis Farma', 'TARJA_VERMELHA', 'REFERENCIA', 'omeprazol', '20mg', 'Cápsula', 4290, null, '🫄'],
  ['Pantoprazol 40mg 28 comprimidos', 'Estômago e digestão', 'Pharmaprime', 'TARJA_VERMELHA', 'GENERICO', 'pantoprazol', '40mg', 'Comprimido', 2990, null, '🫄'],
  ['Antiácido Hidróxido de Alumínio + Magnésio 240ml', 'Estômago e digestão', 'Essencial', 'MIP', 'SIMILAR', 'hidróxido de alumínio + hidróxido de magnésio', null, 'Suspensão oral', 1690, null, '🥛', ['azia']],
  ['Simeticona 125mg 10 cápsulas', 'Estômago e digestão', 'GenériMed', 'MIP', 'GENERICO', 'simeticona', '125mg', 'Cápsula', 990, null, '🫧', ['gases']],
  ['Probiótico Lactobacillus 10 cápsulas', 'Estômago e digestão', 'BioNature', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 4590, 5290, '🦠', ['intestino']],
  ['Sais de Reidratação Oral Laranja 4 sachês', 'Estômago e digestão', 'Essencial', 'MIP', 'SIMILAR', 'sais para reidratação oral', null, 'Pó para solução', 890, null, '🍊'],
  // Pressão e coração
  ['Losartana Potássica 50mg 30 comprimidos', 'Pressão e coração', 'GenériMed', 'TARJA_VERMELHA', 'GENERICO', 'losartana potássica', '50mg', 'Comprimido', 1190, 1890, '❤️', ['hipertensao', 'uso continuo']],
  ['Losartana Potássica 50mg 30 comprimidos', 'Pressão e coração', 'Vitalis Farma', 'TARJA_VERMELHA', 'REFERENCIA', 'losartana potássica', '50mg', 'Comprimido', 4890, null, '❤️', ['uso continuo']],
  ['Anlodipino 5mg 30 comprimidos', 'Pressão e coração', 'Pharmaprime', 'TARJA_VERMELHA', 'GENERICO', 'besilato de anlodipino', '5mg', 'Comprimido', 1090, null, '❤️', ['uso continuo']],
  ['Hidroclorotiazida 25mg 30 comprimidos', 'Pressão e coração', 'GenériMed', 'TARJA_VERMELHA', 'GENERICO', 'hidroclorotiazida', '25mg', 'Comprimido', 690, null, '❤️', ['uso continuo']],
  ['Atorvastatina 20mg 30 comprimidos', 'Pressão e coração', 'GenériMed', 'TARJA_VERMELHA', 'GENERICO', 'atorvastatina cálcica', '20mg', 'Comprimido', 2490, 3490, '❤️', ['colesterol', 'uso continuo']],
  ['Sinvastatina 20mg 30 comprimidos', 'Pressão e coração', 'Pharmaprime', 'TARJA_VERMELHA', 'GENERICO', 'sinvastatina', '20mg', 'Comprimido', 1290, null, '❤️', ['colesterol', 'uso continuo']],
  // Diabetes
  ['Metformina 850mg 30 comprimidos', 'Diabetes', 'GenériMed', 'TARJA_VERMELHA', 'GENERICO', 'cloridrato de metformina', '850mg', 'Comprimido', 890, null, '🩸', ['uso continuo']],
  ['Glicazida 30mg 30 comprimidos', 'Diabetes', 'Pharmaprime', 'TARJA_VERMELHA', 'GENERICO', 'gliclazida', '30mg', 'Comprimido liberação prolongada', 1890, null, '🩸', ['uso continuo']],
  ['Tiras para Glicemia 50 unidades', 'Diabetes', 'CuraTech', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 6990, 8490, '🩸', ['glicosimetro']],
  ['Lancetas Descartáveis 100 unidades', 'Diabetes', 'CuraTech', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 2490, null, '🩸'],
  // Antibióticos
  ['Amoxicilina 500mg 21 cápsulas', 'Antibióticos', 'GenériMed', 'ANTIMICROBIANO', 'GENERICO', 'amoxicilina', '500mg', 'Cápsula', 1890, 2490, '🧪'],
  ['Amoxicilina + Clavulanato 875mg+125mg 14 comprimidos', 'Antibióticos', 'Vitalis Farma', 'ANTIMICROBIANO', 'REFERENCIA', 'amoxicilina + clavulanato de potássio', '875mg+125mg', 'Comprimido', 7990, null, '🧪'],
  ['Azitromicina 500mg 3 comprimidos', 'Antibióticos', 'Pharmaprime', 'ANTIMICROBIANO', 'GENERICO', 'azitromicina di-hidratada', '500mg', 'Comprimido', 1690, null, '🧪'],
  ['Cefalexina 500mg 8 cápsulas', 'Antibióticos', 'GenériMed', 'ANTIMICROBIANO', 'GENERICO', 'cefalexina', '500mg', 'Cápsula', 1490, null, '🧪'],
  // Saúde mental (controlados)
  ['Clonazepam 2mg 30 comprimidos', 'Saúde mental', 'GenériMed', 'CONTROLADO', 'GENERICO', 'clonazepam', '2mg', 'Comprimido', 1290, null, '🔒'],
  ['Sertralina 50mg 30 comprimidos', 'Saúde mental', 'Pharmaprime', 'CONTROLADO', 'GENERICO', 'cloridrato de sertralina', '50mg', 'Comprimido', 2990, null, '🔒'],
  ['Alprazolam 0,5mg 30 comprimidos', 'Saúde mental', 'Vitalis Farma', 'CONTROLADO', 'REFERENCIA', 'alprazolam', '0,5mg', 'Comprimido', 3490, null, '🔒'],
  ['Melatonina 0,21mg 60 cápsulas', 'Saúde mental', 'BioNature', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 3990, 4990, '🌙', ['sono']],
  // Proteção solar
  ['Protetor Solar Facial FPS 60 Toque Seco 50g', 'Proteção solar', 'SolarisDerm', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 6990, 8990, '☀️', ['fps', 'rosto']],
  ['Protetor Solar Corporal FPS 50 200ml', 'Proteção solar', 'SolarisDerm', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 5990, 7490, '☀️', ['fps']],
  ['Protetor Solar Infantil FPS 70 120ml', 'Proteção solar', 'SolarisDerm', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 6490, null, '☀️', ['infantil']],
  ['Protetor Solar com Cor FPS 50 40g', 'Proteção solar', 'DermaPura', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 7990, null, '☀️', ['rosto', 'base']],
  ['Pós-Sol Hidratante Aloe Vera 200ml', 'Proteção solar', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 2990, null, '🌿'],
  // Rosto
  ['Sérum Vitamina C 10% 30ml', 'Cuidados com o rosto', 'DermaPura', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 11990, 14990, '✨', ['antioxidante']],
  ['Gel de Limpeza Facial Pele Oleosa 150ml', 'Cuidados com o rosto', 'DermaPura', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 4990, null, '🫧'],
  ['Água Micelar 5 em 1 200ml', 'Cuidados com o rosto', 'DermaPura', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 3490, 3990, '💧'],
  ['Hidratante Facial Ácido Hialurônico 50g', 'Cuidados com o rosto', 'DermaPura', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 8990, null, '✨'],
  ['Creme para Área dos Olhos 15g', 'Cuidados com o rosto', 'DermaPura', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 9490, null, '👁️'],
  // Hidratação
  ['Loção Hidratante Corporal Pele Extrasseca 400ml', 'Hidratação corporal', 'DermaPura', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 4290, 4990, '💧'],
  ['Creme para as Mãos Ureia 10% 50g', 'Hidratação corporal', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1990, null, '🤲'],
  ['Óleo Corporal de Amêndoas 200ml', 'Hidratação corporal', 'BioNature', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 2490, null, '🌰'],
  // Higiene bucal
  ['Creme Dental Branqueador 90g', 'Higiene bucal', 'Sorriso+', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 790, null, '🦷'],
  ['Creme Dental Sensibilidade 90g', 'Higiene bucal', 'Sorriso+', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1890, 2290, '🦷'],
  ['Escova Dental Macia Kit 3 unidades', 'Higiene bucal', 'Sorriso+', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1490, null, '🪥'],
  ['Enxaguante Bucal Sem Álcool 500ml', 'Higiene bucal', 'Sorriso+', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 2190, null, '🫧'],
  ['Fio Dental 50m', 'Higiene bucal', 'Sorriso+', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 990, null, '🧵'],
  // Cabelos
  ['Shampoo Anticaspa 200ml', 'Cabelos', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 2290, null, '💇'],
  ['Condicionador Reconstrução 200ml', 'Cabelos', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1990, null, '💇'],
  ['Minoxidil Solução Capilar 5% 60ml', 'Cabelos', 'Pharmaprime', 'MIP', 'GENERICO', 'minoxidil', '5%', 'Solução tópica', 5990, 6990, '💇'],
  // Desodorantes e banho
  ['Desodorante Antitranspirante Aerosol 150ml', 'Desodorantes', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1490, 1790, '🌬️'],
  ['Desodorante Roll-on Sem Perfume 50ml', 'Desodorantes', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1290, null, '🌬️'],
  ['Sabonete Líquido Antisséptico 250ml', 'Banho', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1690, null, '🧼'],
  ['Álcool em Gel 70% 500ml', 'Banho', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1190, null, '🧴'],
  // Vitaminas
  ['Vitamina C 1g Efervescente 10 comprimidos', 'Vitaminas', 'VitaPlus', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1290, 1690, '🍊', ['imunidade']],
  ['Vitamina D3 2.000UI 60 cápsulas', 'Vitaminas', 'VitaPlus', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 3990, 4990, '☀️', ['imunidade', 'ossos']],
  ['Polivitamínico A-Z 60 comprimidos', 'Vitaminas', 'VitaPlus', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 4990, null, '🍋'],
  ['Complexo B 30 comprimidos', 'Vitaminas', 'BioNature', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 2490, null, '🍋'],
  ['Zinco Quelato 30mg 60 cápsulas', 'Vitaminas', 'BioNature', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 2990, null, '⚡'],
  // Suplementos
  ['Ômega 3 1000mg 120 cápsulas', 'Suplementos', 'BioNature', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 6990, 8990, '🐟', ['coracao']],
  ['Colágeno Hidrolisado + Vitamina C 300g', 'Suplementos', 'VitaPlus', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 7990, null, '💪', ['pele']],
  ['Whey Protein Concentrado Baunilha 900g', 'Suplementos', 'VitaPlus', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 13990, 15990, '💪'],
  ['Magnésio Dimalato 60 cápsulas', 'Suplementos', 'BioNature', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 3490, null, '⚡'],
  // Bebê
  ['Fralda Infantil Tamanho M 70 unidades', 'Fraldas', 'BabyCare', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 8990, 10990, '🧷'],
  ['Fralda Infantil Tamanho G 60 unidades', 'Fraldas', 'BabyCare', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 8990, 10990, '🧷'],
  ['Fralda Infantil Tamanho XG 52 unidades', 'Fraldas', 'BabyCare', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 8990, null, '🧷'],
  ['Lenço Umedecido 96 unidades', 'Cuidados do bebê', 'BabyCare', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1490, null, '👶'],
  ['Pomada para Assaduras 45g', 'Cuidados do bebê', 'BabyCare', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 2290, null, '👶'],
  ['Shampoo Infantil Sem Lágrimas 200ml', 'Cuidados do bebê', 'BabyCare', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1890, null, '👶'],
  // Bem-estar
  ['Medidor de Pressão Digital de Braço', 'Aparelhos de saúde', 'CuraTech', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 18990, 22990, '📟', ['pressao']],
  ['Termômetro Digital Flexível', 'Aparelhos de saúde', 'CuraTech', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 2490, null, '🌡️', ['febre']],
  ['Oxímetro de Dedo', 'Aparelhos de saúde', 'CuraTech', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 9990, 12990, '📟'],
  ['Inalador Nebulizador Compressor', 'Aparelhos de saúde', 'CuraTech', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 15990, null, '🌬️'],
  ['Curativo Adesivo 40 unidades', 'Primeiros socorros', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 990, null, '🩹'],
  ['Gaze Estéril 10 unidades', 'Primeiros socorros', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 590, null, '🩹'],
  ['Água Oxigenada 10 Volumes 100ml', 'Primeiros socorros', 'Essencial', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 490, null, '🧴'],
  ['Teste de Gravidez de Farmácia', 'Testes rápidos', 'CuraTech', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 1990, null, '🧫'],
  ['Autoteste COVID-19 Antígeno', 'Testes rápidos', 'CuraTech', 'NAO_MEDICAMENTO', 'NAO_SE_APLICA', null, null, null, 4490, 5990, '🧫'],
];

const BULA_PADRAO = {
  indicacoes: 'Consulte a bula completa. Este texto é um resumo para demonstração.',
  contraindicacoes: 'Hipersensibilidade a qualquer componente da fórmula. Gestantes e lactantes: consulte o médico.',
  modoDeUsar: 'Siga a orientação do médico ou do farmacêutico. Não exceda a dose recomendada.',
  advertencias: 'Mantenha fora do alcance de crianças. Guarde em local seco e fresco, ao abrigo da luz.',
};

// Limpa SOMENTE as tabelas do schema da aplicação (nunca o banco inteiro: no Supabase o
// banco é compartilhado com outros projetos). Só as tabelas que o Prisma conhece são afetadas.
const TABELAS_DA_APP = new Set(['ZonaEntrega', 'Motoboy', 'Loja', 'Usuario', 'Sessao', 'Endereco', 'Categoria', 'Marca', 'Produto', 'HistoricoPreco', 'Avaliacao', 'Favorito', 'Banner', 'Promocao', 'Cupom', 'Lote', 'MovimentoEstoque', 'Carrinho', 'CarrinhoItem', 'Pedido', 'PedidoItem', 'PedidoEvento', 'Pagamento', 'Receita', 'Escrituracao', 'Assinatura', 'Lembrete', 'MovimentoPontos', 'Fornecedor', 'PedidoCompra', 'PedidoCompraItem', 'CaixaSessao', 'CaixaMovimento', 'Auditoria', 'TokenSenha', 'ImagemProduto', 'Conversa', 'Mensagem', '_PromocaoProdutos']);

async function limpar() {
  if (process.env.NODE_ENV === 'production' && process.env.PERMITIR_SEED_DEMO !== '1') throw new Error('Seed de demonstração bloqueado em produção (defina PERMITIR_SEED_DEMO=1 conscientemente).');
  const [{ schema }] = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  const tabelas = (await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`).map((t) => t.tablename).filter((t) => TABELAS_DA_APP.has(t));
  if (!tabelas.length) return;
  console.log(`   schema "${schema}": ${tabelas.length} tabelas`);
  await db.$executeRawUnsafe(`TRUNCATE ${tabelas.map((t) => `"${schema}"."${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

async function main() {
  console.log('🧹 Limpando banco…');
  await limpar();
  const senha = process.env.DEMO_PASSWORD || `Demo${crypto.randomBytes(5).toString('hex')}9`;
  const senhaHash = hashSenha(senha);

  // ── Lojas
  console.log('🏬 Lojas…');
  // Loja de bairro (endereço e área de entrega são exemplos: ajuste em Painel › Lojas)
  const lojasDados = [
    { nome: 'New Farma Popular', slug: 'matriz', cnpj: '49.500.230/0001-09', telefone: '11900000000', cep: '01310100', logradouro: 'Endereço da loja (configurar)', numero: 's/n', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', horario: 'Seg a sáb 8h–21h · Dom 9h–14h', faixasCep: ['01000-09999'], aceitaExpressa: true, centroDistribuicao: false },
  ];
  const lojas = [];
  for (const l of lojasDados) lojas.push(await db.loja.create({ data: l }));
  const [matriz] = lojas;
  // Bairros atendidos (exemplo: ajuste em Painel › Entregas)
  for (const [bairro, taxa, prazo] of [['Bela Vista', 500, 40], ['Consolação', 600, 45], ['Jardins', 700, 50], ['Liberdade', 700, 50], ['República', 600, 45], ['Pinheiros', 900, 60], ['Vila Mariana', 900, 60], ['Moema', 1000, 70]] as const) {
    await db.zonaEntrega.create({ data: { lojaId: matriz.id, bairro, bairroBusca: normalizar(bairro), taxa, prazoMinutos: prazo } });
  }
  await db.loja.update({ where: { id: matriz.id }, data: { latitude: -23.5614, longitude: -46.6559 } });
  for (const [nome, telefone, veiculo, placa] of [['Rafael Entregas', '11988880001', 'Moto Honda CG 160', 'ABC1D23'], ['Juliana Motogirl', '11988880002', 'Moto Yamaha Factor', 'EFG4H56']] as const) {
    await db.motoboy.create({ data: { nome, telefone, veiculo, placa, taxaPorEntrega: 500, token: crypto.randomBytes(18).toString('base64url') } });
  }
  const paulista = matriz;

  // ── Categorias e marcas
  console.log('🗂️  Catálogo…');
  const catPorNome = new Map<string, { id: string }>();
  let ordem = 0;
  for (const c of CATEGORIAS) {
    const pai = await db.categoria.create({ data: { nome: c.nome, slug: slugificar(c.nome), icone: c.icone, cor: c.cor, ordem: ordem++ } });
    catPorNome.set(c.nome, pai);
    let o = 0;
    for (const [nome, icone] of c.filhas) catPorNome.set(nome, await db.categoria.create({ data: { nome, slug: slugificar(nome), icone, cor: c.cor, ordem: o++, paiId: pai.id } }));
  }
  const marcaPorNome = new Map<string, { id: string }>();
  for (const [nome, fabricante] of MARCAS) marcaPorNome.set(nome, await db.marca.create({ data: { nome, slug: slugificar(nome), fabricante } }));

  // ── Produtos + lotes por loja
  const produtos = [];
  let seq = 1;
  for (const [nome, cat, marca, cls, tipo, principio, conc, forma, preco, precoDe, icone, tags = []] of PRODUTOS) {
    const nomeCompleto = tipo === 'REFERENCIA' || tipo === 'SIMILAR' ? `${nome} — ${marca}` : nome;
    const ehMed = cls !== 'NAO_MEDICAMENTO';
    const slug = slugificar(`${nomeCompleto}-${seq}`);
    const p = await db.produto.create({
      data: {
        sku: `SKU${String(seq).padStart(5, '0')}`, ean: `789${String(1000000000 + seq * 7919).slice(0, 10)}`,
        nome: nomeCompleto, slug, busca: normalizar([nomeCompleto, marca, principio ?? '', cat, ...tags].join(' ')),
        descricaoCurta: ehMed ? `${principio} ${conc ?? ''} · ${forma ?? ''}`.trim() : `${cat} · ${marca}`,
        descricao: ehMed
          ? `${nomeCompleto}. Medicamento ${tipo === 'GENERICO' ? 'genérico (intercambiável com o de referência)' : tipo === 'SIMILAR' ? 'similar equivalente' : 'de referência'} à base de ${principio}. Leia atentamente a bula antes de usar.`
          : `${nomeCompleto}. Produto da linha ${marca}, ideal para o seu dia a dia. Dermatologicamente testado quando aplicável.`,
        marcaId: marcaPorNome.get(marca)!.id, categoriaId: catPorNome.get(cat)!.id, classificacao: cls, tipo,
        principioAtivo: principio, concentracao: conc, formaFarmaceutica: forma, apresentacao: nome.match(/\d+\s?(comprimidos|cápsulas|ml|g|unidades|sachês)/i)?.[0] ?? null,
        registroAnvisa: ehMed ? `1${String(100000000000 + seq * 104729).slice(0, 12)}` : null,
        ...(ehMed ? BULA_PADRAO : {}),
        preco, precoDe, pmc: ehMed ? Math.round(Math.max(preco, precoDe ?? 0) * 1.25) : null, custo: Math.round(preco * (0.45 + rnd() * 0.2)),
        icone, estoqueMinimo: int(6, 20), destaque: rnd() < 0.2 || !!precoDe && rnd() < 0.4, tags,
      },
    });
    produtos.push(p);
    for (const loja of lojas) {
      const qtdBase = int(0, 10) === 0 ? 0 : int(4, 80);
      if (qtdBase === 0) continue;
      await db.lote.create({ data: { produtoId: p.id, lojaId: loja.id, codigo: `L${seq}${loja.slug.slice(0, 2).toUpperCase()}A`, validade: dias(int(200, 700)), quantidade: qtdBase, custoUnit: p.custo } });
      if (rnd() < 0.25) await db.lote.create({ data: { produtoId: p.id, lojaId: loja.id, codigo: `L${seq}${loja.slug.slice(0, 2).toUpperCase()}B`, validade: dias(int(10, 55)), quantidade: int(2, 15), custoUnit: p.custo } });
    }
    seq++;
  }

  // ── Equipe e clientes
  console.log('👥 Usuários…');
  const equipe: { nome: string; email: string; papel: Papel; lojaId?: string; crf?: string }[] = [
    { nome: 'Administrador', email: 'admin@farmacia.local', papel: 'ADMIN' },
    { nome: 'Carlos Gerente', email: 'gerente@farmacia.local', papel: 'GERENTE', lojaId: paulista.id },
    { nome: 'Dra. Ana Farmacêutica', email: 'farmaceutico@farmacia.local', papel: 'FARMACEUTICO', lojaId: paulista.id, crf: 'CRF-SP 12345' },
    { nome: 'Bruno Atendente', email: 'atendente@farmacia.local', papel: 'ATENDENTE', lojaId: paulista.id },
  ];
  for (const u of equipe) await db.usuario.create({ data: { ...u, senhaHash, consentimentoLgpdEm: new Date() } });

  const cpfCliente = gerarCpf();
  const cliente = await db.usuario.create({
    data: {
      nome: 'Maria Cliente da Silva', email: 'cliente@farmacia.local', senhaHash, papel: 'CLIENTE', telefone: '11999990000', nascimento: new Date('1988-04-12'),
      cpfCifrado: cifrar(cpfCliente), cpfHash: indiceCpf(cpfCliente), consentimentoLgpdEm: new Date(), aceitaMarketing: true,
      enderecos: { create: [
        { apelido: 'Casa', destinatario: 'Maria Cliente da Silva', cep: '01310200', logradouro: 'Av. Paulista', numero: '1578', complemento: 'Apto 42', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP', principal: true },
        { apelido: 'Trabalho', destinatario: 'Maria Cliente da Silva', cep: '05425070', logradouro: 'Rua Butantã', numero: '336', bairro: 'Pinheiros', cidade: 'São Paulo', uf: 'SP' },
      ] },
    },
  });
  const nomes = ['João', 'Pedro', 'Lucas', 'Juliana', 'Fernanda', 'Rafael', 'Camila', 'Bruna', 'Gustavo', 'Larissa', 'Thiago', 'Patrícia', 'Rodrigo', 'Aline', 'Marcelo', 'Beatriz', 'Felipe', 'Natália', 'André', 'Vanessa'];
  const sobrenomes = ['Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Almeida', 'Ribeiro', 'Carvalho', 'Gomes'];
  const clientes = [cliente];
  for (let i = 0; i < 60; i++) {
    const nome = `${pick(nomes)} ${pick(sobrenomes)}`;
    clientes.push(await db.usuario.create({ data: { nome, email: `cliente${i + 1}@exemplo.com`, senhaHash, papel: 'CLIENTE', consentimentoLgpdEm: new Date(), criadoEm: dias(-int(5, 200)) } }));
  }

  // ── Histórico de pedidos entregues (alimenta relatórios, mais vendidos e "compre junto")
  console.log('🧾 Histórico de vendas…');
  const vendaveis = produtos.filter((p) => p.classificacao !== 'CONTROLADO');
  const populares = vendaveis.filter((_, i) => i % 3 === 0);
  const lojasVenda = [matriz];
  for (let i = 0; i < 420; i++) {
    const c = rnd() < 0.08 ? cliente : pick(clientes);
    const criadoEm = dias(-int(0, 89));
    criadoEm.setHours(int(8, 22), int(0, 59));
    const nItens = int(1, 4);
    const escolhidos = new Map<string, { p: (typeof produtos)[number]; q: number }>();
    for (let k = 0; k < nItens; k++) {
      const p = rnd() < 0.6 ? pick(populares) : pick(vendaveis);
      escolhidos.set(p.id, { p, q: int(1, 3) });
    }
    const itens = [...escolhidos.values()];
    const subtotal = itens.reduce((s, x) => s + x.p.preco * x.q, 0);
    const modalidade = pick(['ENTREGA_PADRAO', 'ENTREGA_PADRAO', 'ENTREGA_EXPRESSA', 'RETIRADA'] as const);
    const frete = modalidade === 'RETIRADA' ? 0 : modalidade === 'ENTREGA_EXPRESSA' ? 1490 : subtotal >= 9900 ? 0 : 790;
    const canal = rnd() < 0.15 ? 'PDV' : 'SITE';
    const status = i < 12 ? pick(['PAGO', 'EM_SEPARACAO', 'SAIU_PARA_ENTREGA'] as const) : rnd() < 0.05 ? 'CANCELADO' : 'ENTREGUE';
    const total = subtotal + (canal === 'PDV' ? 0 : frete);
    const pedido = await db.pedido.create({
      data: {
        usuarioId: c.id, lojaId: pick(lojasVenda).id, canal, status: i < 12 ? status : status,
        modalidade: canal === 'PDV' ? 'BALCAO' : modalidade, subtotal, frete: canal === 'PDV' ? 0 : frete, total, clienteNome: c.nome,
        metodoPagamento: pick(['CARTAO_CREDITO', 'CARTAO_CREDITO', 'PIX', canal === 'PDV' ? 'DINHEIRO' : 'PIX'] as const),
        criadoEm: i < 12 ? dias(0) : criadoEm, atualizadoEm: criadoEm,
        enderecoEntrega: modalidade !== 'RETIRADA' && canal !== 'PDV' ? { apelido: 'Casa', destinatario: c.nome, cep: '01310200', logradouro: 'Av. Paulista', numero: String(int(1, 2000)), bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' } : undefined,
        itens: { create: itens.map(({ p, q }) => ({ produtoId: p.id, nome: p.nome, sku: p.sku, classificacao: p.classificacao, quantidade: q, precoUnitario: p.preco, total: p.preco * q, custoUnitario: p.custo })) },
        eventos: { create: [{ status: 'PAGO', descricao: 'Pagamento aprovado.', criadoEm }, ...(status === 'ENTREGUE' ? [{ status: 'ENTREGUE' as const, descricao: 'Pedido entregue.', criadoEm }] : [])] },
        pagamentos: { create: { metodo: 'CARTAO_CREDITO', status: status === 'CANCELADO' ? 'ESTORNADO' : 'APROVADO', valor: total, gatewayId: `seed_${i}_${crypto.randomUUID()}`, cartaoBandeira: 'Visa', cartaoFinal: '1111', criadoEm } },
      },
    });
    if (status !== 'CANCELADO') for (const { p, q } of itens) await db.produto.update({ where: { id: p.id }, data: { vendas: { increment: q } } });
    void pedido;
  }

  // Pontos e assinatura da cliente demo
  await db.movimentoPontos.create({ data: { usuarioId: cliente.id, pontos: 850, descricao: 'Compras anteriores', expiraEm: dias(300) } });
  await db.usuario.update({ where: { id: cliente.id }, data: { pontos: 850 } });
  const losartana = produtos.find((p) => p.principioAtivo === 'losartana potássica')!;
  const vitD = produtos.find((p) => p.nome.startsWith('Vitamina D3'))!;
  const endCasa = await db.endereco.findFirst({ where: { usuarioId: cliente.id, principal: true } });
  await db.assinatura.create({ data: { usuarioId: cliente.id, produtoId: vitD.id, quantidade: 1, intervaloDias: 60, proximaEntrega: dias(12), enderecoId: endCasa?.id } });
  await db.lembrete.create({ data: { usuarioId: cliente.id, produtoId: losartana.id, nomeMedicamento: losartana.nome, dosagem: '1 comprimido', horarios: ['08:00'], inicio: dias(-20), dosesRestantes: 6 } });
  await db.favorito.createMany({ data: produtos.filter((_, i) => i % 17 === 0).map((p) => ({ usuarioId: cliente.id, produtoId: p.id })) });

  // ── Avaliações
  console.log('⭐ Avaliações…');
  const titulos = ['Excelente!', 'Recomendo', 'Muito bom', 'Bom custo-benefício', 'Chegou rápido', 'Cumpre o que promete', 'Razoável'];
  const comentarios = ['Produto original e bem embalado. Entrega antes do prazo.', 'Uso há anos e o preço aqui é o melhor.', 'Funcionou muito bem para mim.', 'Atendimento do farmacêutico foi ótimo.', 'Bom, mas a embalagem poderia ser melhor.'];
  for (const p of vendaveis) {
    const autores = new Set<string>();
    for (let k = 0; k < int(0, 6); k++) {
      const a = pick(clientes.slice(1));
      if (autores.has(a.id)) continue;
      autores.add(a.id);
      await db.avaliacao.create({ data: { produtoId: p.id, usuarioId: a.id, nota: pick([5, 5, 5, 4, 4, 3]), titulo: pick(titulos), comentario: pick(comentarios), status: rnd() < 0.9 ? 'APROVADA' : 'PENDENTE', compraVerificada: rnd() < 0.8, criadoEm: dias(-int(1, 80)) } });
    }
  }

  // ── Marketing
  console.log('📣 Banners, promoções e cupons…');
  await db.banner.createMany({ data: [
    { titulo: 'Semana da Saúde', subtitulo: '15% OFF em dor e febre. Preço popular de verdade.', link: '/categoria/dor-e-febre', corDe: '#D71920', corPara: '#B3141A', icone: '🩺', ordem: 0, textoBotao: 'Ver ofertas' },
    { titulo: 'Leve 3, pague 2 em protetor solar', subtitulo: 'Toda a linha SolarisDerm com desconto progressivo', link: '/categoria/protecao-solar', corDe: '#1B2A72', corPara: '#2A3F94', icone: '☀️', ordem: 1, textoBotao: 'Proteger agora' },
    { titulo: '10% OFF na primeira compra', subtitulo: 'Use o cupom BEMVINDO10 no carrinho', link: '/cadastro', corDe: '#D71920', corPara: '#1B2A72', icone: '🎁', ordem: 2, textoBotao: 'Criar conta' },
    { titulo: 'Uso contínuo com 10% OFF', subtitulo: 'Assine seus remédios e receba em casa sem se preocupar', link: '/conta/assinaturas', corDe: '#1B2A72', corPara: '#0D153A', icone: '🔁', ordem: 3, textoBotao: 'Saiba mais' },
  ] });;
  await db.promocao.create({ data: { nome: 'Semana da Saúde — Dor e febre', tipo: 'PERCENTUAL', percentual: 15, categoriaId: catPorNome.get('Dor e febre')!.id, inicio: dias(-3), fim: dias(10) } });
  await db.promocao.create({ data: { nome: 'Leve 3 Pague 2 — SolarisDerm', tipo: 'LEVE_PAGUE', leve: 3, pague: 2, marcaId: marcaPorNome.get('SolarisDerm')!.id, inicio: dias(-3), fim: dias(30) } });
  await db.promocao.create({ data: { nome: 'VitaPlus 10%', tipo: 'PERCENTUAL', percentual: 10, marcaId: marcaPorNome.get('VitaPlus')!.id, inicio: dias(-1), fim: dias(20) } });
  await db.cupom.createMany({ data: [
    { codigo: 'BEMVINDO10', descricao: '10% na primeira compra', tipo: 'PERCENTUAL', valor: 10, primeiraCompra: true },
    { codigo: 'FRETEGRATIS', descricao: 'Frete grátis acima de R$ 60', tipo: 'FRETE_GRATIS', minimoPedido: 6000, usoPorCliente: 3 },
    { codigo: 'SAUDE20', descricao: 'R$ 20 de desconto acima de R$ 150', tipo: 'VALOR_FIXO', valor: 2000, minimoPedido: 15000, usoMaximo: 500 },
  ] });

  // ── Fornecedores e compras
  console.log('🚚 Fornecedores…');
  const fornecedores = [];
  for (const [razao, fantasia, cnpj] of [
    ['Distribuidora Saúde Total Ltda.', 'Saúde Total', '11.111.111/0001-11'],
    ['MedLog Distribuição de Medicamentos S.A.', 'MedLog', '22.222.222/0001-22'],
    ['Beleza & Cia Atacado Ltda.', 'Beleza & Cia', '33.333.333/0001-33'],
  ] as const) fornecedores.push(await db.fornecedor.create({ data: { razaoSocial: razao, nomeFantasia: fantasia, cnpj, email: `pedidos@${slugificar(fantasia)}.com.br`, telefone: '1140000000', contato: 'Comercial', prazoEntregaDias: int(2, 7) } }));
  const admin = await db.usuario.findUniqueOrThrow({ where: { email: 'admin@farmacia.local' } });
  const itensCompra = produtos.slice(0, 6).map((p) => ({ produtoId: p.id, quantidade: 50, custoUnitario: p.custo ?? 500 }));
  await db.pedidoCompra.create({ data: { fornecedorId: fornecedores[1].id, lojaId: paulista.id, status: 'ENVIADO', criadoPorId: admin.id, enviadoEm: dias(-1), total: itensCompra.reduce((s, i) => s + i.quantidade * i.custoUnitario, 0), itens: { create: itensCompra } } });

  console.log('\n✅ Seed concluído.');
  console.log(`   ${produtos.length} produtos · ${lojas.length} lojas · ${clientes.length} clientes · 420 pedidos históricos`);
  console.log('   Acessos (senha para todos):', senha);
  for (const e of [...equipe.map((x) => x.email), 'cliente@farmacia.local']) console.log('   -', e);
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
