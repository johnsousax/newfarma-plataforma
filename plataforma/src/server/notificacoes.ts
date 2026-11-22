import 'server-only';
import { FARMACIA } from '@/lib/farmacia';

/**
 * Envio de e-mail transacional. Com RESEND_API_KEY definido, envia pela API do Resend;
 * sem configuração (desenvolvimento), apenas registra no console do servidor.
 */
export async function enviarEmail(para: string, assunto: string, texto: string) {
  const chave = process.env.RESEND_API_KEY;
  const de = process.env.EMAIL_REMETENTE || `${FARMACIA.nome} <nao-responda@newpopularfarma.com.br>`;
  if (!chave) {
    console.info(`\n📧 [e-mail não enviado — configure RESEND_API_KEY]\nPara: ${para}\nAssunto: ${assunto}\n${texto}\n`);
    return { enviado: false };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: de, to: [para], subject: assunto, text: texto }),
  });
  if (!r.ok) console.error('[e-mail] falha no envio', r.status);
  return { enviado: r.ok };
}
