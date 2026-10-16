// Иконки и картинки для соцсетей из знака VILAX в фирменной расцветке: node scripts/make-images.mjs (после make-logos.mjs)
// public/favicon.svg, favicon.ico (32), apple-touch-icon.png (180), og/{ru,en,x}.png (1200×630).
// Тексты — из src/i18n (meta.ogAlt), шрифты — подмножества из public/fonts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { browserPath } from './browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUB = join(ROOT, 'public');
const paths = readFileSync(join(ROOT, 'src/components/brand/logo-paths.ts'), 'utf8');
const MARK = paths.match(/MARK_PATH = "([^"]+)"/)[1];
const WORD = paths.match(/WORD_PATH = "([^"]+)"/)[1];
const ru = JSON.parse(readFileSync(join(ROOT, 'src/i18n/ru.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(ROOT, 'src/i18n/en.json'), 'utf8'));
const font = (f) => `data:font/woff2;base64,${readFileSync(join(PUB, 'fonts', f)).toString('base64')}`;

const css = `
@font-face{font-family:Inter;src:url(${font('inter-latin.woff2')}) format('woff2');font-weight:100 900;unicode-range:U+0000-03FF,U+2000-2BFF}
@font-face{font-family:Inter;src:url(${font('inter-cyrillic.woff2')}) format('woff2');font-weight:100 900;unicode-range:U+0400-04FF,U+20BD,U+2116}
*{box-sizing:border-box;margin:0}
body{font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}`;
const STOPS = [...paths.match(/BRAND_STOPS[^=]*=\s*\[([\s\S]*?)\];/)[1].matchAll(/\[([\d.]+),\s*'(#[0-9A-Fa-f]{6})'\]/g)].map((m) => [+m[1], m[2]]);
const grad = (id) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="184" y1="0" x2="896" y2="0">${STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const mark = (id, style) => `<svg viewBox="184 170 712 608" style="${style}"><defs>${grad(id)}</defs><path fill="url(#${id})" d="${MARK}"/></svg>`;
const word = (color, style) => `<svg viewBox="328 846 424 64" style="${style}"><path fill="${color}" d="${WORD}"/></svg>`;
// Русская типографика: короткие слова не висят в конце строки
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nb = (s) => s.replace(/(^|\s)([а-яё]{1,2}) /gi, '$1$2 ');

const og = {
  ru: `<div style="width:1200px;height:630px;position:relative;overflow:hidden;background:radial-gradient(110% 120% at 85% 20%,#0F1C33 0%,#020817 60%);color:#F5F7FA">
    ${mark('m', 'position:absolute;right:-60px;top:40px;width:640px')}
    ${word('#F5F7FA', 'position:absolute;left:72px;top:72px;width:150px')}
    <p style="position:absolute;left:72px;bottom:96px;width:720px;font-size:76px;line-height:1.02;font-weight:620;letter-spacing:-0.04em">${nb(cap(ru.meta.ogAlt.split(' — ')[1] ?? ru.meta.ogAlt))}</p>
  </div>`,
  en: `<div style="width:1200px;height:630px;position:relative;overflow:hidden;background:radial-gradient(110% 120% at 85% 20%,#FFFFFF 0%,#E8EEF6 65%);color:#020817">
    ${mark('m', 'position:absolute;right:-60px;top:40px;width:640px')}
    ${word('#020817', 'position:absolute;left:72px;top:72px;width:150px')}
    <p style="position:absolute;left:72px;bottom:96px;width:720px;font-size:76px;line-height:1.02;font-weight:620;letter-spacing:-0.04em">${cap(en.meta.ogAlt.split(': ')[1] ?? en.meta.ogAlt)}</p>
  </div>`,
  x: `<div style="width:1200px;height:630px;position:relative;display:flex;overflow:hidden">
    <div style="flex:1;background:#020817;color:#F5F7FA;padding:0 56px 64px;display:flex;align-items:flex-end;font-size:64px;font-weight:620;letter-spacing:-0.045em">${ru.chooser?.region?.ru?.card ?? 'Россия и СНГ'}</div>
    <div style="flex:1;background:#F5F7FA;color:#020817;padding:0 56px 64px;display:flex;align-items:flex-end;justify-content:flex-end;font-size:64px;font-weight:620;letter-spacing:-0.045em">${ru.chooser?.region?.en?.card ?? 'ОАЭ'}</div>
    ${mark('m', 'position:absolute;left:50%;top:44%;width:420px;transform:translate(-50%,-50%)')}
  </div>`,
};
const icon = (size) => `<div style="width:${size}px;height:${size}px;background:#001543;display:grid;place-items:center">${mark('m', `width:${Math.round(size * 0.74)}px`)}</div>`;

const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: ['--no-first-run'] });
const page = await browser.newPage();
async function shot(html, w, h, out) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: w, height: h } });
}

mkdirSync(join(PUB, 'og'), { recursive: true });
for (const k of ['ru', 'en', 'x']) await shot(og[k], 1200, 630, join(PUB, 'og', `${k}.png`));
await shot(icon(180), 180, 180, join(PUB, 'apple-touch-icon.png'));
const ico32 = await shot(icon(32), 32, 32, join(ROOT, '.shots', 'icon-32.png'));
await browser.close();

// favicon.ico: один PNG 32×32 внутри контейнера ICO (поддерживается всеми браузерами).
const png = Buffer.from(ico32);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6);
header.writeUInt8(32, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync(join(PUB, 'favicon.ico'), Buffer.concat([header, png]));
writeFileSync(join(PUB, 'favicon.svg'), readFileSync(join(PUB, 'logo.svg')));
console.log('ok: favicon.svg, favicon.ico, apple-touch-icon.png, og/ru.png, og/en.png, og/x.png');
