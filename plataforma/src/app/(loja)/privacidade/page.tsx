import { FARMACIA } from '@/lib/farmacia';

export const metadata = { title: 'Política de privacidade' };

export default function Privacidade() {
  return (
    <article className="container-loja max-w-3xl space-y-4 py-10 text-slate-700 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900">
      <h1 className="text-3xl font-bold text-slate-900">Política de privacidade</h1>
      <p>Esta política explica como a {FARMACIA.razaoSocial} (CNPJ {FARMACIA.cnpj}) trata seus dados pessoais conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      <h2>Quais dados coletamos</h2>
      <p>Nome, CPF, data de nascimento, e-mail, telefone, endereços de entrega e histórico de compras. Quando você compra medicamentos com prescrição, tratamos também a imagem da receita e os dados do prescritor — dados de saúde considerados <strong>sensíveis</strong>.</p>
      <h2>Para que usamos</h2>
      <p>Executar a compra e a entrega; cumprir obrigações legais e sanitárias (emissão de nota fiscal, validação de receitas e escrituração exigidas pela ANVISA); prevenir fraudes; e, apenas com seu consentimento, enviar ofertas.</p>
      <h2>Assistente virtual</h2>
      <p>Se você usar o assistente, suas mensagens ficam guardadas cifradas para que o farmacêutico possa continuar o atendimento. Fotos de remédios e receitas são analisadas e descartadas na hora, sem armazenamento. Para responder, o texto e a foto são processados por um provedor de inteligência artificial contratado pela farmácia, sob contrato que proíbe o uso para treinar modelos. O uso depende do seu consentimento específico, que pode ser revogado a qualquer momento.</p>
      <h2>Como protegemos</h2>
      <p>CPF e receitas são cifrados com AES-256 no banco de dados. Senhas são guardadas com hash scrypt. Dados de cartão não passam pelos nossos servidores: são convertidos em token pelo provedor de pagamento (PCI-DSS). Somente farmacêuticos acessam receitas, e todo acesso fica registrado em trilha de auditoria à prova de adulteração.</p>
      <h2 id="lgpd">Seus direitos (LGPD)</h2>
      <p>Em <em>Minha conta › Dados e privacidade</em> você pode corrigir dados, baixar uma cópia (portabilidade), revogar o consentimento de marketing e excluir sua conta. Registros fiscais e sanitários são mantidos pelo prazo legal.</p>
      <h2>Encarregado (DPO)</h2>
      <p>Fale com o encarregado pelos canais de atendimento da loja{FARMACIA.email ? ` ou pelo e-mail ${FARMACIA.email}` : ''}.</p>
    </article>
  );
}
