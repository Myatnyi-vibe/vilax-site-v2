// Файлы знака и надписи VILAX в фирменной расцветке: node scripts/make-logos.mjs
// public/logo.svg, public/wordmark.svg — контуры и цвета из src/components/brand/logo-paths.ts.
// После — node scripts/make-images.mjs (favicon, apple-touch-icon, og).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = readFileSync(join(ROOT, 'src/components/brand/logo-paths.ts'), 'utf8');
const str = (name) => src.match(new RegExp(`${name} = "([^"]+)"`))[1];
const STOPS = [...src.match(/BRAND_STOPS[^=]*=\s*\[([\s\S]*?)\];/)[1].matchAll(/\[([\d.]+),\s*'(#[0-9A-Fa-f]{6})'\]/g)].map((m) => [+m[1], m[2]]);

function svg(viewBox, d) {
  const [x, , w] = viewBox.split(' ').map(Number);
  const stops = STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="VILAX"><title>VILAX</title><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${x}" y1="0" x2="${x + w}" y2="0">${stops}</linearGradient></defs><path fill="url(#g)" d="${d}"/></svg>\n`;
}
writeFileSync(join(ROOT, 'public/logo.svg'), svg(str('MARK_VIEWBOX'), str('MARK_PATH')));
writeFileSync(join(ROOT, 'public/wordmark.svg'), svg(str('WORD_VIEWBOX'), str('WORD_PATH')));
console.log('ok: public/logo.svg, public/wordmark.svg —', STOPS.map((s) => s[1]).join(' → '));
