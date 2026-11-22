export type EnderecoPedido = { destinatario?: string; cep?: string; logradouro?: string; numero?: string; complemento?: string | null; bairro?: string; cidade?: string; uf?: string };

export const linhaEndereco = (e: EnderecoPedido | null | undefined) =>
  e ? [`${e.logradouro ?? ''}, ${e.numero ?? ''}`, e.complemento, e.bairro, `${e.cidade ?? ''}/${e.uf ?? ''}`].filter(Boolean).join(' · ') : '';

export const linkMapa = (e: EnderecoPedido | null | undefined) =>
  e ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${e.logradouro}, ${e.numero} - ${e.bairro}, ${e.cidade} - ${e.uf}, ${e.cep}`)}` : null;
