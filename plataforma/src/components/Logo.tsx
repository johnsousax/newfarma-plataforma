// Logotipo da New Farma Popular (hexágono com cruz + "New FARMA Popular"), em SVG.
import { cx } from '@/components/ui';

export function SeloMarca({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden>
      <path fill="#D71920" d="M235,105Q248,128 235,151L201,209Q188,232 162,232L94,232Q68,232 55,209L21,151Q8,128 21,105L55,47Q68,24 94,24L162,24Q188,24 201,47Z" />
      <path fill="#1B2A72" d="M213,109Q224,128 213,147L187,192Q176,211 154,211L102,211Q80,211 69,192L43,147Q32,128 43,109L69,64Q80,45 102,45L154,45Q176,45 187,64Z" />
      <g fill="#FFFFFF"><rect x="103" y="61" width="50" height="134" rx="10" /><rect x="61" y="103" width="134" height="50" rx="10" /></g>
      <g fill="#D71920"><rect x="116" y="78" width="24" height="101" rx="5" /><rect x="78" y="116" width="101" height="24" rx="5" /></g>
    </svg>
  );
}

export function LogoCompleto({ className, claro }: { className?: string; claro?: boolean }) {
  const azul = claro ? '#FFFFFF' : '#1B2A72';
  const vermelho = claro ? '#FFC20E' : '#D71920';
  return (
    <svg viewBox="40 60 860 190" className={cx('h-11 w-auto', className)} role="img" aria-label="New Farma Popular">
      <path fill="#D71920" d="M222,136Q232,154 222,172L196,216Q186,234 166,234L114,234Q94,234 84,216L58,172Q48,154 58,136L84,92Q94,74 114,74L166,74Q186,74 196,92Z" />
      <path fill="#1B2A72" d="M205,140Q214,154 205,168L185,203Q177,218 160,218L120,218Q103,218 95,203L75,168Q66,154 75,140L95,105Q103,90 120,90L160,90Q177,90 185,105Z" />
      <g fill="#FFFFFF"><rect x="121" y="102" width="39" height="103" rx="7" /><rect x="88" y="135" width="103" height="39" rx="7" /></g>
      <g fill="#D71920"><rect x="131" y="115" width="18" height="77" rx="4" /><rect x="101" y="145" width="77" height="18" rx="4" /></g>
      <text x="266" y="160" fontSize="150" fill={azul} style={{ fontFamily: 'var(--font-yellowtail), cursive' }}>New</text>
      <text x="503.7" y="132" fontWeight="800" fontSize="96" letterSpacing="2" fill={vermelho} style={{ fontFamily: 'var(--font-roboto-slab), Georgia, serif' }}>FARMA</text>
      <text x="876.7" y="184" textAnchor="end" fontWeight="600" fontSize="52" fill={azul} style={{ fontFamily: 'var(--font-roboto-slab), Georgia, serif' }}>Popular</text>
    </svg>
  );
}
