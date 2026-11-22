import 'server-only';

/** Lê largura e altura de PNG, JPEG ou WEBP direto dos bytes (sem dependências). */
export function dimensoes(b: Buffer): { largura: number; altura: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50) return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      const tam = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
      i += 2 + tam;
    }
    return null;
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const tipo = b.toString('ascii', 12, 16);
    if (tipo === 'VP8X') return { largura: 1 + b.readUIntLE(24, 3), altura: 1 + b.readUIntLE(27, 3) };
    if (tipo === 'VP8 ') return { largura: b.readUInt16LE(26) & 0x3fff, altura: b.readUInt16LE(28) & 0x3fff };
    if (tipo === 'VP8L') { const v = b.readUInt32LE(21); return { largura: (v & 0x3fff) + 1, altura: ((v >> 14) & 0x3fff) + 1 }; }
  }
  return null;
}

/** Remove de um SVG tudo que poderia executar código ou buscar recursos externos. */
export function limparSvg(svg: string) {
  let s = svg.trim();
  const ini = s.indexOf('<svg');
  const fim = s.lastIndexOf('</svg>');
  if (ini < 0 || fim < 0) throw new Error('SVG inválido');
  s = s.slice(ini, fim + 6);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  s = s.replace(/(href|xlink:href)\s*=\s*("|')(?!#|data:image\/(png|jpeg|webp);)[^"']*\2/gi, '');
  s = s.replace(/javascript:/gi, '');
  if (!/viewBox="0 0 1600 500"/.test(s)) s = s.replace('<svg', '<svg viewBox="0 0 1600 500"');
  return s;
}
