// Проверка собранного dist/: обязательные адреса на месте, в английских документах нет кириллицы, старые адреса
// версий ведут на «/» с сочетанием, внутренние ссылки целы, у страниц есть lang и canonical, фиолетового бренда нет.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const CYR = /[Ѐ-ӿ]/;
const PURPLE = /#7b5cff|123,\s*92,\s*255/i;

const REQUIRED = [
  'index.html',
  'ru/index.html',
  'en/index.html',
  'ru/en/index.html',
  'en/ru/index.html',
  'privacy.html',
  'terms.html',
  'support.html',
  'ru/privacy.html',
  'ru/terms.html',
  'ru/support.html',
  'en/privacy.html',
  'en/terms.html',
  'en/support.html',
  'ru/consent.html',
  'en/consent.html',
  '404.html',
  'sitemap.xml',
  'robots.txt',
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'og/ru.png',
  'og/en.png',
  'og/x.png',
  'logo.svg',
  'wordmark.svg',
  'google1e0ecdafaa681c29.html',
];
// Старые адреса версий → «/» с сочетанием (ТЗ медиа, Р-25).
const REDIRECTS = { 'ru/index.html': 'lang=ru&cur=rub', 'en/index.html': 'lang=en&cur=aed', 'ru/en/index.html': 'lang=en&cur=rub', 'en/ru/index.html': 'lang=ru&cur=aed' };
// Английские документы (ОАЭ): тело документа <article lang="en"> без единой русской буквы.
const EN_DOCS = ['privacy.html', 'terms.html', 'support.html', 'en/privacy.html', 'en/terms.html', 'en/support.html', 'en/consent.html'];

const errors = [];
const fail = (msg) => errors.push(msg);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(DIST)) {
  console.error('Нет dist/: сначала npm run build:local');
  process.exit(1);
}

const files = walk(DIST).map((p) => relative(DIST, p).split(sep).join('/'));
const fileSet = new Set(files);

for (const f of REQUIRED) if (!fileSet.has(f)) fail(`нет обязательного файла ${f}`);

function resolveLink(href) {
  const path = decodeURI(href.split('#')[0].split('?')[0]).replace(/^\//, '');
  if (path === '') return 'index.html';
  const candidates = path.endsWith('/') ? [`${path}index.html`] : [path, `${path}.html`, `${path}/index.html`];
  return candidates.find((c) => fileSet.has(c));
}

for (const f of files.filter((f) => f.endsWith('.html') && f !== 'google1e0ecdafaa681c29.html')) {
  const html = readFileSync(join(DIST, f), 'utf8');

  if (EN_DOCS.includes(f)) {
    const body = html.match(/<article[^>]*lang="en"[^>]*>([\s\S]*?)<\/article>/)?.[1];
    if (!body) fail(`${f}: нет <article lang="en"> документа`);
    else if (CYR.test(body)) {
      const i = body.search(CYR);
      fail(`кириллица в английском документе ${f}: «${body.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ')}»`);
    }
  }
  if (REDIRECTS[f]) {
    if (!html.replace(/&#38;|&amp;/g, '&').includes(`?${REDIRECTS[f]}`)) fail(`${f}: не ведёт на «/?${REDIRECTS[f]}»`);
    continue;
  }

  const lang = html.match(/<html[^>]*\slang="([^"]+)"/)?.[1];
  if (!lang) fail(`${f}: нет lang у <html>`);

  if (!/<title>[^<]+<\/title>/.test(html)) fail(`${f}: пустой <title>`);
  if (f !== '404.html' && !/<link rel="canonical" href="https:\/\/vilax\.ai\//.test(html)) fail(`${f}: нет canonical`);

  for (const [, href] of html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)) {
    if (href.startsWith('//')) continue;
    if (!resolveLink(href)) fail(`${f}: битая ссылка ${href}`);
  }
}

// Синонимы /en/privacy и др. указывают canonical на прежний адрес.
for (const d of ['privacy', 'terms', 'support']) {
  const f = `en/${d}.html`;
  if (fileSet.has(f) && !readFileSync(join(DIST, f), 'utf8').includes(`<link rel="canonical" href="https://vilax.ai/${d}">`)) fail(`${f}: canonical должен вести на /${d}`);
}
// Карта сайта перечисляет главную и правовые страницы.
if (fileSet.has('sitemap.xml')) {
  const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
  for (const p of ['/', '/privacy', '/terms', '/support', '/ru/privacy', '/ru/terms', '/ru/support']) {
    if (!xml.includes(`<loc>https://vilax.ai${p}</loc>`)) fail(`sitemap.xml: нет ${p}`);
  }
}

// Бюджет скриптов (ТЗ): при загрузке ≤ 120 КБ в сжатом виде; 3D-сцена вместе с библиотеками ≤ 1,5 МБ.
const gz = (f) => gzipSync(readFileSync(join(DIST, f))).length;
for (const page of ['index.html']) {
  if (!fileSet.has(page)) continue;
  const html = readFileSync(join(DIST, page), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="\/([^"]+)"/g), ...html.matchAll(/<link rel="modulepreload" href="\/([^"]+)"/g)].map((m) => m[1]);
  const kb = scripts.filter((f) => fileSet.has(f)).reduce((sum, f) => sum + gz(f), 0) / 1024;
  if (kb > 120) fail(`${page}: скрипты при загрузке ${kb.toFixed(1)} КБ > 120 КБ`);
}
const scene = files.filter((f) => /^_astro\/vilax3d/.test(f) && f.endsWith('.js'));
const sceneKb = scene.reduce((sum, f) => sum + gz(f), 0) / 1024;
if (sceneKb > 1536) fail(`3D-сцена ${sceneKb.toFixed(0)} КБ > 1,5 МБ`);

for (const f of files.filter((f) => /\.(html|css|js|svg|json|xml|txt)$/.test(f))) {
  if (PURPLE.test(readFileSync(join(DIST, f), 'utf8'))) fail(`${f}: фиолетовый (#7B5CFF) запрещён каноном с 29.09.2026`);
}

if (errors.length) {
  console.error(`verify-dist: ${errors.length} ошибок`);
  for (const e of errors) console.error(' ✗', e);
  process.exit(1);
}
console.log(`verify-dist: ок — ${files.length} файлов, обязательные адреса на месте, английские документы без кириллицы, старые адреса → «/», ссылки целы, 3D-сцена ${sceneKb.toFixed(0)} КБ`);
