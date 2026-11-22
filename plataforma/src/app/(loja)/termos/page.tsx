import { FARMACIA } from '@/lib/farmacia';

export const metadata = { title: 'Termos de uso' };

export default function Termos() {
  return (
    <article className="container-loja max-w-3xl space-y-4 py-10 text-slate-700 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-marca-600">
      <h1 className="text-3xl font-bold text-marca-600">Termos de uso</h1>
      <p>Estes termos regem o uso do site da {FARMACIA.nome} ({FARMACIA.razaoSocial}, CNPJ {FARMACIA.cnpj}).</p>
      <h2>Compras</h2>
      <p>Preços e estoque podem mudar sem aviso; vale o valor confirmado no fechamento do pedido. Medicamentos que exigem receita só são liberados após validação do farmacêutico. Medicamentos sujeitos a controle especial não são vendidos pela internet (RDC 44/2009) e só podem ser adquiridos na loja, com a receita original.</p>
      <h2>Pagamento, entrega e retirada</h2>
      <p>Aceitamos Pix e cartão de crédito em até {FARMACIA.maxParcelas}x sem juros. O PIX expira em 30 minutos; após esse prazo, o pedido é cancelado e o estoque, liberado. Na retirada, apresente documento com foto.</p>
      <h2>Trocas, cancelamento e arrependimento</h2>
      <p>Você pode cancelar pelo site antes da separação. Por segurança sanitária, medicamentos não são trocados após a entrega, salvo defeito ou erro na entrega (Código de Defesa do Consumidor e normas sanitárias). Demais produtos seguem o direito de arrependimento de 7 dias, quando lacrados.</p>
      <h2>Assistente virtual</h2>
      <p>O assistente fornece apenas informações gerais baseadas em bula e sobre como comprar na farmácia. Ele não faz diagnóstico, não indica tratamento, não informa dose e não avalia interações. Decisões sobre o uso de medicamentos devem ser tomadas com o médico e o farmacêutico. Em emergência, ligue 192.</p>
      <h2>Programa de pontos</h2>
      <p>Cada real gasto em compras entregues gera pontos conforme o seu nível. Pontos valem 12 meses, não têm valor em dinheiro e podem ser usados em até 30% do valor do pedido.</p>
      <h2>Avaliações</h2>
      <p>Avaliações passam por moderação. Não publicamos relatos com promessa de cura, dados de saúde de terceiros, ofensas ou propaganda.</p>
    </article>
  );
}
