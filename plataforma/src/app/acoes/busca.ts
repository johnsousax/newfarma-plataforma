'use server';
import { sugestoesBusca } from '@/server/catalogo';

export async function sugerir(q: string) {
  const termo = String(q ?? '').slice(0, 60);
  const r = await sugestoesBusca(termo);
  return r.map((p) => ({ slug: p.slug, nome: p.nome, icone: p.icone, preco: p.oferta.preco, marca: p.marca.nome }));
}
