import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { FARMACIA, telefoneFormatado } from '@/lib/farmacia';
import { configuracoes, linkWhatsLoja } from '@/server/configuracoes';
import { LogoCompleto } from '@/components/Logo';
import { Icone } from '@/components/icones';

async function Contato() {
  await connection();
  const { contato } = await configuracoes();
  const wa = await linkWhatsLoja('Olá! Vim pelo site.');
  return (
    <ul className="space-y-2 text-marca-100">
      {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white"><Icone nome="whatsapp" />WhatsApp {telefoneFormatado(contato.whatsapp)}</a></li>}
      {contato.telefone && <li className="flex items-center gap-2"><Icone nome="telefone" />{contato.telefone}</li>}
      {contato.email && <li className="flex items-center gap-2"><Icone nome="email" />{contato.email}</li>}
      <li>Farmacêutico responsável para orientar você</li>
    </ul>
  );
}

async function Legal() {
  await connection();
  const { contato } = await configuracoes();
  return (
    <p>
      <strong className="text-white">{FARMACIA.razaoSocial} ({FARMACIA.nome})</strong> · CNPJ {FARMACIA.cnpj}
      {contato.afe && <> · AFE/ANVISA {contato.afe}</>}
      {contato.rtNome && <> · Farmacêutico(a) responsável: {contato.rtNome}{contato.rtCrf && ` — ${contato.rtCrf}`}</>}
    </p>
  );
}

export function Rodape() {
  return (
    <footer className="mt-16 text-sm">
      <div className="bg-marca-600 text-marca-50">
        <div className="container-loja grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <LogoCompleto claro className="h-12" />
            <p className="text-marca-100">Farmácia de bairro, preço popular. Saúde com atendimento perto de você.</p>
          </div>
          <div>
            <h3 className="mb-3 font-bold text-white">Compre com a gente</h3>
            <ul className="space-y-2 text-marca-100">
              <li><Link href="/ofertas" className="hover:text-white">Ofertas</Link></li>
              <li><Link href="/assistente" className="hover:text-white">Tire dúvidas sobre remédios</Link></li>
              <li><Link href="/lojas" className="hover:text-white">Nossa loja</Link></li>
              <li><Link href="/conta/pedidos" className="hover:text-white">Meus pedidos</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 font-bold text-white">Atendimento</h3>
            <Suspense><Contato /></Suspense>
          </div>
          <div>
            <h3 className="mb-3 font-bold text-white">Pagamento seguro</h3>
            <p className="text-marca-100">Pix com confirmação automática · Cartão em até {FARMACIA.maxParcelas}x sem juros · Dados do cartão não ficam na farmácia</p>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-marca-100">
              <li><Link href="/privacidade" className="hover:text-white">Privacidade</Link></li>
              <li><Link href="/termos" className="hover:text-white">Termos</Link></li>
              <li><Link href="/privacidade#lgpd" className="hover:text-white">LGPD</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="bg-marca-800">
        <div className="container-loja space-y-2 py-6 text-xs leading-relaxed text-marca-200">
          <Suspense><Legal /></Suspense>
          <p>Remédios que não exigem receita podem ser comprados pelo site. Itens que exigem receita passam pela validação do farmacêutico. Medicamentos de controle especial (Portaria 344/98) só na loja, com a receita original (RDC 44/2009).</p>
          <p className="font-semibold uppercase tracking-wide text-amarelo-300">Imagens ilustrativas. Se persistirem os sintomas, o médico deverá ser consultado.</p>
        </div>
      </div>
    </footer>
  );
}
