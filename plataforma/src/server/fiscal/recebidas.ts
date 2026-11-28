import 'server-only';
import { obterSegredo } from '../integracoes';
import { configuracoes } from '../configuracoes';

/**
 * Notas recebidas (manifestação do destinatário): baixa o XML de uma NF-e emitida contra a
 * farmácia pela chave de acesso. Usa a Focus NFe — exige a empresa cadastrada lá com o
 * certificado digital A1 e o token em Painel › Integrações. Sem token, a tela pede o XML.
 */
export async function baixarXmlRecebido(chave: string): Promise<{ ok: true; xml: string } | { ok: false; motivo: string }> {
  const token = await obterSegredo('FOCUSNFE_TOKEN');
  if (!token) return { ok: false, motivo: 'Busca automática na SEFAZ ainda não ligada (falta o certificado digital A1 e o token do provedor em Integrações).' };
  const { fiscal } = await configuracoes();
  const base = fiscal.ambiente === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
  const auth = `Basic ${Buffer.from(`${token}:`).toString('base64')}`;
  const pedir = (caminho: string, init?: RequestInit) => fetch(`${base}${caminho}`, { ...init, headers: { authorization: auth, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(15_000) });
  try {
    let r = await pedir(`/v2/nfes_recebidas/${chave}.xml`);
    if (r.ok) {
      const xml = await r.text();
      if (/<infNFe\b/.test(xml)) return { ok: true, xml };
    }
    // A SEFAZ só libera o XML completo depois da "ciência da operação"
    if (r.status === 404 || r.status === 403 || r.ok) {
      await pedir(`/v2/nfes_recebidas/${chave}/manifesto`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'ciencia' }) });
      r = await pedir(`/v2/nfes_recebidas/${chave}.xml`);
      if (r.ok) { const xml = await r.text(); if (/<infNFe\b/.test(xml)) return { ok: true, xml }; }
      return { ok: false, motivo: 'Ciência da operação enviada à SEFAZ. O XML costuma ficar disponível em alguns minutos: bipe de novo mais tarde ou envie o arquivo.' };
    }
    if (r.status === 401) return { ok: false, motivo: 'O token do provedor fiscal foi recusado. Confira em Integrações.' };
    return { ok: false, motivo: `O provedor fiscal respondeu erro ${r.status}. Envie o XML enquanto isso.` };
  } catch {
    return { ok: false, motivo: 'Não foi possível falar com o provedor fiscal agora. Envie o XML enquanto isso.' };
  }
}
