// Ícones de linha (lucide) usados em todo o sistema, no lugar de emojis.
import {
  Activity, AlertTriangle, Archive, ArrowRight, Baby, Ban, Bandage, Banknote, Bath, Bell, Bike, Bot, Boxes, Brain, Building2, Camera, ChartLine, Check,
  CheckCircle2, Citrus, ClipboardList, Clock, CreditCard, Dumbbell, Eye, EyeOff, Factory, FileText, Fish, FlaskConical, Flame, Flower2, Gift, Hand,
  Heart, HeartPulse, Home, Image, Inbox, Info, Landmark, LayoutDashboard, Leaf, Lightbulb, Loader2, Lock, Mail, Map, MapPin, Megaphone, Menu, MessageCircle,
  Mic, MicOff, Microscope, Milk, Moon, Navigation, Nut, Package, Paperclip, PartyPopper, Pencil, Percent, Phone, Pill, Plug, Plus, Printer, QrCode,
  Receipt, Repeat, Route, ScrollText, Scissors, Search, Send, Settings, ShieldCheck, ShoppingCart, Siren, Smile, Sparkles, SprayCan, Star, Stethoscope,
  Store, Sun, Tag, TestTube, Thermometer, Trash2, Truck, Upload, User, UserCog, Users, Wallet, Wand2, Wind, X, Zap, Droplet, Droplets,
  ScanBarcode, ArrowLeft, CalendarDays, Briefcase, TrendingUp, TrendingDown, Download, CheckCheck, Smartphone, QrCode as QrCode2, PiggyBank, BadgeDollarSign,
  type LucideIcon,
} from 'lucide-react';
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const ICONES = {
  voltar: ArrowLeft, codigoBarras: ScanBarcode, calendario: CalendarDays, funcionarios: Briefcase, entrada: TrendingUp, saida: TrendingDown, instalar: Download,
  lido: CheckCheck, celular: Smartphone, qrcode: QrCode2, financeiro: PiggyBank, cobranca: BadgeDollarSign,
  // navegação e ações
  painel: LayoutDashboard, pedidos: Package, receitas: ClipboardList, atendimento: Stethoscope, pdv: Receipt, estoque: Boxes, produtos: Pill,
  marketing: Megaphone, avaliacoes: Star, compras: Truck, fornecedores: Factory, clientes: Users, relatorios: ChartLine, anvisa: Landmark,
  equipe: UserCog, lojas: Store, integracoes: Plug, auditoria: ShieldCheck, entregas: Bike, motoboy: Bike, mapa: Map, local: MapPin, rota: Route,
  navegar: Navigation, configuracoes: Settings, notas: ScrollText, impressora: Printer, permissoes: Lock,
  telefone: Phone, email: Mail, whatsapp: MessageCircle, assistente: Bot, oferta: Flame, carrinho: ShoppingCart, usuario: User, menu: Menu,
  fechar: X, busca: Search, relogio: Clock, etiqueta: Tag, cartao: CreditCard, pix: QrCode, percentual: Percent, ok: Check, sucesso: CheckCircle2,
  alerta: AlertTriangle, info: Info, camera: Camera, arquivo: FileText, ideia: Lightbulb, emergencia: Siren, vazio: Inbox, festa: PartyPopper,
  inicio: Home, lembrete: Bell, enviar: Send, enviarArquivo: Upload, anexo: Paperclip, microfone: Mic, microfoneOff: MicOff, varinha: Wand2,
  carregando: Loader2, mais: Plus, excluir: Trash2, editar: Pencil, arquivar: Archive, ver: Eye, ocultar: EyeOff, imagem: Image, presente: Gift,
  repetir: Repeat, coracao: Heart, estrela: Star, raio: Zap, loja: Store, entrega: Truck, cadeado: Lock, seta: ArrowRight, dinheiro: Banknote,
  carteira: Wallet, predio: Building2, proibido: Ban, brilho: Sparkles,
} satisfies Record<string, LucideIcon>;

export type NomeIcone = keyof typeof ICONES;

export function Icone({ nome, className, rotulo }: { nome: NomeIcone; className?: string; rotulo?: string }) {
  const C = ICONES[nome];
  return <C className={cx('h-4 w-4 shrink-0', className)} strokeWidth={1.75} aria-hidden={!rotulo} aria-label={rotulo} />;
}

// Os produtos e categorias antigos guardam um emoji no banco: aqui ele vira um ícone de linha.
const POR_EMOJI: Record<string, LucideIcon> = {
  '💊': Pill, '💧': Droplet, '💪': Dumbbell, '🤧': Wind, '🍯': FlaskConical, '👃': Wind, '🍋': Citrus, '🌼': Flower2, '🫄': HeartPulse, '🥛': Milk,
  '🫧': Droplets, '🦠': Microscope, '🍊': Citrus, '❤️': Heart, '🩸': Droplet, '🧪': FlaskConical, '🔒': Lock, '🌙': Moon, '☀️': Sun, '🌿': Leaf,
  '✨': Sparkles, '👁️': Eye, '🤲': Hand, '🌰': Nut, '🦷': Smile, '🪥': Smile, '🧵': Smile, '💇': Scissors, '🌬️': Wind, '🧼': SprayCan, '🧴': SprayCan,
  '⚡': Zap, '🐟': Fish, '🧷': Baby, '👶': Baby, '📟': Activity, '🌡️': Thermometer, '🩹': Bandage, '🧫': TestTube, '🩺': Stethoscope, '🧠': Brain,
  '🛁': Bath, '🍼': Baby, '🎁': Gift, '🔁': Repeat,
};

export function IconeProduto({ emoji, className }: { emoji?: string | null; className?: string }) {
  const C = (emoji && POR_EMOJI[emoji]) || Package;
  return <C className={className} strokeWidth={1.5} aria-hidden />;
}

/** Opções para o cadastro de produto/categoria (valor gravado = código interno). */
export const OPCOES_ICONE_PRODUTO = [
  ['💊', 'Comprimido'], ['💧', 'Gotas / solução'], ['🧪', 'Antibiótico / frasco'], ['🍯', 'Xarope'], ['🧴', 'Loção / cosmético'], ['☀️', 'Proteção solar'],
  ['✨', 'Dermocosmético'], ['🦷', 'Higiene bucal'], ['💇', 'Cabelos'], ['🧼', 'Higiene / banho'], ['🍊', 'Vitamina'], ['💪', 'Suplemento'],
  ['👶', 'Bebê'], ['📟', 'Aparelho'], ['🩹', 'Primeiros socorros'], ['🧫', 'Teste rápido'], ['❤️', 'Coração / pressão'], ['🩸', 'Diabetes'],
  ['🌡️', 'Febre / dor'], ['🤧', 'Gripe'], ['🌼', 'Alergia'], ['🔒', 'Controlado'], ['🌙', 'Sono'],
] as const;
