// deploy/check-dist.mjs на маленькой поддельной сборке: чистая проходит, каждая поломка ловится.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkDist } from '../check-dist.mjs';
import { withCsp } from '../csp.mjs';

const LEAD = 'https://tracker.vilax.ai/api/site/demo-request';
const PREVIEW = { mode: 'preview', site: 'https://myatnyi-vibe.github.io', base: '/vilax-site' };
const PROD = { mode: 'prod', lead: LEAD };

const LEGAL_WORDS = {
  'privacy.html': 'VILAX OAuth Delete account',
  'ru/privacy.html': 'VILAX удален',
  'terms.html': 'VILAX analytic',
  'ru/terms.html': 'VILAX аналит',
  'support.html': 'VILAX support@vilax.ai Once the plugin is published',
  'ru/support.html': 'VILAX После публикации',
};

/** Поддельная сборка: все обязательные файлы, страницы с формой, CSP как у deploy/csp.mjs. */
function fixture({ mode, base = '', site = 'https://vilax.ai', lead = '' }, patch = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-dist-'));
  // Страницы, которым noindex положен и в проде (404, синонимы en, старые адреса версий → «/») — «noindex, follow»
  // в обоих режимах; остальные — index в проде, noindex в превью.
  const noindexAlways = new Set(['404.html', 'en/privacy.html', 'en/terms.html', 'en/support.html', 'ru/index.html', 'en/index.html', 'ru/en/index.html', 'en/ru/index.html']);
  const robotsFor = (path) => noindexAlways.has(path) ? 'noindex, follow' : mode === 'prod' ? 'index, follow' : 'noindex, nofollow';
  const html = (path, body = '') =>
    withCsp(
      `<!doctype html><html lang="ru" data-mode="${mode}"><head><meta charset="utf-8"><meta name="robots" content="${robotsFor(path)}">` +
        `<link rel="canonical" href="${site}${base}/${path.replace(/index\.html$/, '').replace(/\.html$/, '')}">` +
        `<link rel="icon" href="${base}/favicon.svg"><script>go()</script></head><body>` +
        `<a href="${base}/ru/">ru</a><a href="${base}/privacy">p</a><img src="${base}/og/ru.png" alt="">` +
        `<form class="ld__form" data-lead-form data-mode="${mode}" ${lead ? `data-url="${lead}"` : 'data-url'}></form>${body}</body></html>`,
      { leadUrl: lead, upgrade: mode === 'prod' },
    );
  const files = {
    'robots.txt': mode === 'prod' ? 'User-agent: *\nAllow: /\n\nSitemap: https://vilax.ai/sitemap.xml\n' : 'User-agent: *\nDisallow: /\n',
    'sitemap.xml': `<urlset><url><loc>${site}${base}/ru/</loc></url></urlset>`,
    'favicon.svg': '<svg/>', 'favicon.ico': 'x', 'apple-touch-icon.png': 'x', 'og/ru.png': 'x', 'og/en.png': 'x', 'og/x.png': 'x',
    'google1e0ecdafaa681c29.html': 'google-site-verification: google1e0ecdafaa681c29.html',
    '_astro/app.css': `body{font:url(${base}/fonts/a.woff2)}`, 'fonts/a.woff2': 'x', '_astro/app.js': 'export const x = 1;',
  };
  for (const p of ['index.html', 'ru/index.html', 'en/index.html', 'ru/en/index.html', 'en/ru/index.html', '404.html', 'privacy.html', 'terms.html', 'support.html',
    'ru/privacy.html', 'ru/terms.html', 'ru/support.html', 'en/privacy.html', 'en/terms.html', 'en/support.html',
    'ru/consent.html', 'en/consent.html']) files[p] = html(p, LEGAL_WORDS[p] ?? '');
  const clean = { ...files };
  for (const [p, v] of Object.entries(patch)) files[p] = typeof v === 'function' ? v(clean[p] ?? '') : v;
  for (const [p, body] of Object.entries(files)) {
    if (body === null) continue;
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), body);
  }
  return dir;
}

function run(opts, patch, fn) {
  const dist = fixture(opts, patch);
  try {
    return fn(checkDist({ ...opts, dist }));
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}
const has = (r, re) => r.errors.some((e) => re.test(e));

test('чистая сборка превью под подпутём — без ошибок', () => {
  run(PREVIEW, {}, (r) => assert.deepEqual(r.errors, []));
});

test('чистая сборка прода — без ошибок', () => {
  run({ ...PROD, lead: LEAD }, {}, (r) => assert.deepEqual(r.errors, []));
});

test('превью: адрес от корня мимо подпути и несуществующий файл', () => {
  run(PREVIEW, { 'ru/index.html': (s) => s.replace('</body>', '<a href="/ru/">x</a><img src="/vilax-site/nope.png" alt=""></body>') }, (r) => {
    assert.ok(has(r, /ru\/index\.html: href \/ru\/ — адрес мимо подпути/), r.errors.join('\n'));
    assert.ok(has(r, /nope\.png — файла нет/));
  });
});

test('превью: путь от корня в скрипте и открытая для поиска страница', () => {
  run(PREVIEW, {
    '_astro/app.js': 'location.href = "/ru/";',
    'privacy.html': (s) => s.replace('noindex, nofollow', 'index, follow'),
  }, (r) => {
    assert.ok(has(r, /путь от корня в скрипте/));
    assert.ok(has(r, /превью должно быть закрыто/));
  });
});

test('прод: форма шлёт не туда, локальный адрес в файле, лишний файл сборки', () => {
  run({ ...PROD, lead: LEAD }, {
    'ru/index.html': (s) => s.replace(`data-url="${LEAD}"`, 'data-url="http://x.test/api"'),
    '_astro/app.js': 'fetch("http://localhost:8890/api/site/demo-request")',
    'data-store.json': '{}',
  }, (r) => {
    assert.ok(has(r, /форма шлёт на «http:\/\/x\.test\/api»/));
    assert.ok(has(r, /адрес стенда/));
    assert.ok(has(r, /data-store\.json: лишний файл/));
  });
});

test('прод: встроенный скрипт без хэша, нет CSP, закрыт от поиска', () => {
  run({ ...PROD, lead: LEAD }, {
    'ru/index.html': (s) => s.replace('</body>', '<script>evil()</script></body>'),
    'privacy.html': (s) => s.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace('index, follow', 'noindex, nofollow'),
  }, (r) => {
    assert.ok(has(r, /ru\/index\.html: встроенный скрипт без хэша/));
    assert.ok(has(r, /privacy\.html: нет CSP/));
    assert.ok(has(r, /privacy\.html: прод закрыт от поисковиков/));
  });
});

test('правовые страницы без слов, на которые опираются плагин и приложения', () => {
  run({ ...PROD, lead: LEAD }, { 'support.html': (s) => s.replace('Once the plugin is published', '') }, (r) => {
    assert.ok(has(r, /support\.html: нет «Once the plugin is published»/));
  });
});

test('нет обязательного файла и служебные адреса стейджа', () => {
  // адрес собран из частей: страж публичного репозитория (public-audit) читает и этот файл
  run(PREVIEW, { 'google1e0ecdafaa681c29.html': null, '_astro/app.js': `const s = "https://${'dev'}.vilax.ai/demo";` }, (r) => {
    assert.ok(has(r, /google1e0ecdafaa681c29\.html: нет обязательного файла/));
    assert.ok(has(r, /адрес стейджа/));
  });
});
