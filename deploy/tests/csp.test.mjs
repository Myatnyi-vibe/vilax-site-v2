// deploy/csp.mjs: хэши встроенных скриптов, место meta, отказы на обработчиках и повторном запуске.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inlineScripts, sha256, policy, withCsp, VERIFY_FILE, YM_HOSTS } from '../csp.mjs';

const page = (body, head = '') =>
  `<!doctype html><html lang="ru" data-mode="prod"><head><meta charset="utf-8">${head}<title>t</title></head><body>${body}</body></html>`;
const LEAD = 'https://tracker.vilax.ai/api/site/demo-request';

test('встроенные скрипты: классический и module — да, src и JSON-LD — нет', () => {
  const html = page(
    '<script>a()</script><script type="module">b()</script><script type="module" src="/_astro/x.js"></script>' +
      '<script type="application/ld+json">{"x":1}</script>',
  );
  assert.deepEqual(inlineScripts(html), ['a()', 'b()']);
});

test('хэш — sha256 текста скрипта в base64, как считает браузер', () => {
  const want = createHash('sha256').update('const x = "ё";', 'utf8').digest('base64');
  assert.equal(sha256('const x = "ё";'), `'sha256-${want}'`);
});

test('политика prod: приёмник в connect-src, без Метрики — ни одного адреса Яндекса', () => {
  const p = policy({ hashes: ["'sha256-AAA='"], leadUrl: LEAD, upgrade: true });
  assert.match(p, /connect-src 'self' https:\/\/tracker\.vilax\.ai;/);
  assert.match(p, /script-src 'self' 'sha256-AAA='/);
  assert.doesNotMatch(p, /yandex/);
  assert.match(p, /object-src 'none'/);
  assert.match(p, /upgrade-insecure-requests$/);
});

test('политика с Метрикой: mc.yandex.ru и .com в script-src, img-src и connect-src', () => {
  const p = policy({ hashes: [], leadUrl: LEAD, ym: true });
  for (const d of ['script-src', 'img-src', 'connect-src']) {
    const v = new RegExp(`${d} ([^;]+)`).exec(p)[1];
    assert.ok(v.includes('https://mc.yandex.ru') && v.includes('https://mc.yandex.com'), d);
  }
  assert.ok(/script-src [^;]*https:\/\/yastatic\.net/.test(p));
  assert.equal(YM_HOSTS.length, 3);
});

test('meta CSP встаёт сразу после <meta charset>, хэши всех встроенных скриптов внутри', () => {
  const html = page('<script>one()</script><script type="module">two()</script>', '<script>head()</script>');
  const out = withCsp(html, { leadUrl: LEAD });
  const at = out.indexOf('<meta http-equiv="Content-Security-Policy"');
  assert.equal(at, out.indexOf('<meta charset="utf-8">') + '<meta charset="utf-8">'.length);
  for (const s of ['one()', 'two()', 'head()']) assert.ok(out.includes(sha256(s)), s);
});

test('отказы: повторный запуск, обработчик onclick, ссылка javascript:, скрипт до charset', () => {
  const once = withCsp(page('<p>x</p>'), {});
  assert.throws(() => withCsp(once, {}), /уже стоит/);
  assert.throws(() => withCsp(page('<button onclick="x()">x</button>'), {}), /обработчик/);
  assert.throws(() => withCsp(page('<a href="javascript:x()">x</a>'), {}), /javascript:/);
  assert.throws(() => withCsp('<html><head><script>x()</script><meta charset="utf-8"></head></html>', {}), /раньше/);
});

test('атрибуты со словом on внутри (content=, data-online) — не обработчики', () => {
  assert.doesNotThrow(() => withCsp(page('<div data-online="1" content="x"></div>', '<meta name="description" content="x">'), {}));
});

test('файлы подтверждения поисковиков CSP не трогает', () => {
  assert.ok(VERIFY_FILE.test('google1e0ecdafaa681c29.html'));
  assert.ok(VERIFY_FILE.test('yandex_0123abcd.html'));
  assert.ok(!VERIFY_FILE.test('privacy.html'));
});
