// Проверка собранной папки перед выкладкой — превью (GitHub Pages под подпутём) или прод (корень vilax.ai).
//
//   node deploy/check-dist.mjs --mode preview --site https://myatnyi-vibe.github.io --base /vilax-site [--dist dist]
//   node deploy/check-dist.mjs --mode prod --lead https://tracker.vilax.ai/api/site/demo-request [--ym] [--dist dist]
//
// Что проверяет: режим сборки на каждой странице; CSP стоит и хэши совпадают со встроенными скриптами (deploy/csp.mjs);
// все адреса от корня — под подпутём и ведут на существующие файлы (HTML, CSS, srcset, og:image, canonical);
// превью закрыто от поисковиков и форма никуда не шлёт; прод открыт поисковикам и шлёт заявки только на --lead;
// в файлах нет служебных адресов (стенд, стейдж, локальные пути) и лишних файлов сборки.
// Код возврата: 0 — чисто, 1 — есть ошибки (перечислены).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { inlineScripts, sha256, VERIFY_FILE } from './csp.mjs';

const REQUIRED = [
  'index.html', 'ru/index.html', 'en/index.html', 'ru/en/index.html', 'en/ru/index.html', '404.html',
  'privacy.html', 'terms.html', 'support.html', 'ru/privacy.html', 'ru/terms.html', 'ru/support.html',
  'en/privacy.html', 'en/terms.html', 'en/support.html', 'ru/consent.html', 'en/consent.html',
  'sitemap.xml', 'robots.txt', 'favicon.svg', 'favicon.ico', 'apple-touch-icon.png',
  'og/ru.png', 'og/en.png', 'og/x.png', 'google1e0ecdafaa681c29.html',
];
// Остатки сборки, которых на сервере быть не должно (Astro кладёт их в outDir вне корня проекта).
const FORBIDDEN = [/^content-assets\.mjs$/, /^content-modules\.mjs$/, /^data-store\.json$/, /^settings\.json$/, /\.map$/, /(^|\/)\.env/, /^\.well-known\//];
// Прод: страницы, которым noindex положен: 404, синонимы /en/<doc> (canonical на прежний адрес) и старые адреса версий
// /ru/, /en/, /ru/en/, /en/ru/ — они ведут на «/» (одна страница, ТЗ медиа 14.10.2026); «/» индексируется.
const PROD_NOINDEX = new Set(['404.html', 'en/privacy.html', 'en/terms.html', 'en/support.html', 'ru/index.html', 'en/index.html', 'ru/en/index.html', 'en/ru/index.html']);
// Служебное, чего не должно быть в публичных файлах.
const LEAKS = [
  [/localhost|127\.0\.0\.1|\[::1\]/, 'адрес стенда (localhost)'],
  [/\b(?:dev|stage|staging|predev)\.vilax\.[a-z]{2,}\b/i, 'адрес стейджа'],
  [/@vilax\.app\b/i, 'рабочая почта'],
  [/[A-Z]:\\\\?(Users|vilax)|\/c\/vilax|Downloads[\\/]/i, 'локальный путь'],
  [/chatgpt\.site|supabase\.co/i, 'служебная ссылка'],
];
const TEXT = /\.(html|js|mjs|css|xml|txt|json|svg|webmanifest)$/;
const PLUGIN_PAGES = {
  'privacy.html': ['VILAX', 'OAuth', 'Delete account'],
  'ru/privacy.html': ['VILAX', 'удален'],
  'terms.html': ['VILAX', 'analytic'],
  'ru/terms.html': ['VILAX', 'аналит'],
  'support.html': ['VILAX', 'support@vilax.ai', 'Once the plugin is published'],
  'ru/support.html': ['VILAX', 'После публикации'],
};

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function checkDist({ dist, mode, site = 'https://vilax.ai', base = '', lead = '', ym = false }) {
  const errors = [];
  const fail = (file, msg) => errors.push(`${file}: ${msg}`);
  base = base.replace(/\/+$/, '');
  const origin = site.replace(/\/+$/, '');
  if (!existsSync(dist)) return { errors: [`нет папки ${dist}`], pages: 0, files: 0, bytes: 0 };

  const files = walk(dist).map((p) => relative(dist, p).split(sep).join('/'));
  const fileSet = new Set(files);
  const read = (f) => readFileSync(join(dist, f), 'utf8');
  for (const f of REQUIRED) if (!fileSet.has(f)) fail(f, 'нет обязательного файла');
  for (const f of files) if (FORBIDDEN.some((re) => re.test(f))) fail(f, 'лишний файл сборки — на сервер не кладём');

  /** Адрес от корня → файл в dist (с учётом подпути); null — не наш адрес или нет файла. */
  const resolve = (pathname) => {
    if (base && !pathname.startsWith(`${base}/`)) return { bad: `адрес мимо подпути ${base}/` };
    let p = decodeURIComponent(pathname.slice(base.length)).replace(/^\/+/, '');
    if (p === '' || p.endsWith('/')) p += 'index.html';
    if (fileSet.has(p) || fileSet.has(`${p}.html`)) return { ok: true };
    return { bad: 'файла нет' };
  };
  const checkRef = (file, ref, kind) => {
    if (!ref || /^(#|mailto:|tel:|data:|blob:)/i.test(ref)) return;
    let path = ref;
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
      const u = new URL(ref);
      if (u.origin !== origin) return; // внешний адрес (app.vilax.ai, Яндекс) — не наш файл
      path = u.pathname;
    } else if (!ref.startsWith('/')) {
      path = posix.join(posix.dirname(`${base}/${file}`), ref);
    }
    const r = resolve(path.split(/[?#]/)[0]);
    if (r.bad) fail(file, `${kind} ${ref} — ${r.bad}`);
  };

  const pages = files.filter((f) => f.endsWith('.html'));
  for (const f of pages) {
    const html = read(f);
    if (VERIFY_FILE.test(posix.basename(f))) continue; // файлы подтверждения поисковиков — отдаются как есть
    const dataMode = /<html[^>]*\sdata-mode="([^"]+)"/.exec(html)?.[1];
    if (dataMode !== mode) fail(f, `data-mode="${dataMode}", ожидался ${mode}`);

    // CSP: стоит один раз, хэши ровно совпадают со встроенными скриптами страницы
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/i.exec(html)?.[1]?.replaceAll('&quot;', '"');
    if (!csp) fail(f, 'нет CSP (deploy/csp.mjs)');
    else {
      const want = new Set(inlineScripts(html).map(sha256));
      const have = new Set(csp.match(/'sha256-[^']+'/g) ?? []);
      for (const h of want) if (!have.has(h)) fail(f, `встроенный скрипт без хэша в CSP ${h}`);
      const connect = /connect-src ([^;]+)/.exec(csp)?.[1] ?? '';
      if (mode === 'prod' && !connect.includes(new URL(lead).origin)) fail(f, 'CSP connect-src без приёмника заявок');
      if (mode === 'preview' && /tracker\.vilax\.ai/.test(connect)) fail(f, 'превью: CSP пускает к приёмнику');
      if (ym !== /mc\.yandex\.ru/.test(csp)) fail(f, ym ? 'CSP без Метрики при --ym' : 'CSP пускает Метрику без --ym');
    }

    const robots = /<meta name="robots" content="([^"]+)"/.exec(html)?.[1] ?? '';
    // Превью закрыто от поиска: на каждой странице нужен noindex (robots.txt и так Disallow: /). Директива follow/nofollow
    // не влияет на индексирование — страницы, которым noindex положен и в проде (экран выбора, 404, синонимы en), держат
    // «noindex, follow», и это тоже закрыто.
    if (mode === 'preview' && !/\bnoindex\b/.test(robots)) fail(f, `превью должно быть закрыто: robots="${robots}"`);
    if (mode === 'prod' && !PROD_NOINDEX.has(f) && /noindex/.test(robots)) fail(f, `прод закрыт от поисковиков: robots="${robots}"`);

    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    if (canonical && !canonical.startsWith(`${origin}${base}/`)) fail(f, `canonical ${canonical} не на ${origin}${base}/`);
    const og = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
    if (og) checkRef(f, og, 'og:image');

    for (const m of html.matchAll(/\s(href|src|poster|action)="([^"]*)"/g)) checkRef(f, m[2].replaceAll('&amp;', '&'), m[1]);
    for (const m of html.matchAll(/\ssrcset="([^"]*)"/g)) for (const part of m[1].split(',')) checkRef(f, part.trim().split(/\s+/)[0], 'srcset');
    for (const m of html.matchAll(/\sdata-src-[a-z]+="([^"]*)"/g)) {
      if (base && m[1].startsWith('/') && !m[1].startsWith(`${base}/`)) fail(f, `data-src ${m[1]} — адрес мимо подпути`);
    }

    // форма: превью никуда не шлёт, прод — только на --lead
    for (const m of html.matchAll(/<form[^>]*\sdata-lead-form\b[^>]*>/g)) {
      // пустое значение Astro выводит голым атрибутом: data-url
      const a = /\sdata-url(?:="([^"]*)")?(?=[\s>])/.exec(m[0]);
      const url = a ? (a[1] ?? '') : '(нет атрибута)';
      if (mode === 'preview' && url !== '') fail(f, `превью: форма шлёт на ${url}`);
      if (mode === 'prod' && url !== lead) fail(f, `прод: форма шлёт на «${url}», ожидался ${lead}`);
    }
    const ymAttr = /\sdata-ym="(\d+)"/.test(html);
    if (ymAttr !== ym) fail(f, ym ? 'нет плашки Метрики при --ym' : 'Метрика включена в сборке без --ym');
  }

  for (const f of files.filter((x) => x.endsWith('.css'))) {
    for (const m of read(f).matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) checkRef(f, m[1], 'url()');
  }
  // скрипты: в превью ни одного пути от корня мимо подпути
  if (base) {
    for (const f of files.filter((x) => x.endsWith('.js'))) {
      for (const m of read(f).matchAll(/["'`]\/(ru|en|shots|fonts|video|og|privacy|terms|support|_astro)\//g)) {
        fail(f, `путь от корня в скрипте: ${m[0]}… — без подпути`);
      }
    }
  }

  let bytes = 0;
  for (const f of files) {
    bytes += statSync(join(dist, f)).size;
    if (!TEXT.test(f) || VERIFY_FILE.test(posix.basename(f))) continue;
    const text = read(f);
    for (const [re, what] of LEAKS) {
      const m = re.exec(text);
      if (m) fail(f, `${what}: «${text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).replace(/\s+/g, ' ')}»`);
    }
    if (mode === 'preview' && /tracker\.vilax\.ai/.test(text)) fail(f, 'превью: адрес приёмника в файлах');
  }

  // Правовые страницы: на них ссылаются приложения и плагин ChatGPT; эти же слова требует тест платформы
  // plugin-public-pages.test.ts для нынешнего лендинга — новый сайт не должен их потерять.
  for (const [f, words] of Object.entries(PLUGIN_PAGES)) {
    const text = fileSet.has(f) ? read(f) : '';
    for (const w of words) if (!text.includes(w)) fail(f, `нет «${w}» — на это опираются плагин и приложения`);
    if (/(?:app|dev|mcp|www)\.vilax\.io|apps@vilax\.io/.test(text)) fail(f, 'старый домен vilax.io');
  }

  const robotsTxt = fileSet.has('robots.txt') ? read('robots.txt') : '';
  if (mode === 'preview' && !/Disallow: \/\s*$/m.test(robotsTxt)) fail('robots.txt', 'превью должно запрещать всё');
  if (mode === 'prod') {
    if (!/Allow: \//.test(robotsTxt) || !robotsTxt.includes('Sitemap: https://vilax.ai/sitemap.xml')) fail('robots.txt', 'прод: Allow и Sitemap https://vilax.ai/sitemap.xml');
    const locs = [...(fileSet.has('sitemap.xml') ? read('sitemap.xml') : '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (!locs.length || locs.some((l) => !l.startsWith('https://vilax.ai/'))) fail('sitemap.xml', 'прод: все адреса — https://vilax.ai/…');
  }
  return { errors, pages: pages.length, files: files.length, bytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      dist: { type: 'string', default: 'dist' },
      mode: { type: 'string' },
      site: { type: 'string', default: 'https://vilax.ai' },
      base: { type: 'string', default: '' },
      lead: { type: 'string', default: '' },
      ym: { type: 'boolean', default: false },
    },
  });
  if (values.mode !== 'prod' && values.mode !== 'preview') {
    console.error('check-dist: --mode prod | preview');
    process.exit(2);
  }
  if (values.mode === 'prod' && (values.site !== 'https://vilax.ai' || values.base || !/^https:\/\//.test(values.lead))) {
    console.error('check-dist: prod — только https://vilax.ai без подпути и с --lead https://…');
    process.exit(2);
  }
  const r = checkDist(values);
  if (r.errors.length) {
    console.error(`check-dist (${values.mode}): ошибок ${r.errors.length}`);
    for (const e of r.errors.slice(0, 60)) console.error(`  ✗ ${e}`);
    if (r.errors.length > 60) console.error(`  … и ещё ${r.errors.length - 60}`);
    process.exit(1);
  }
  console.log(`check-dist (${values.mode}): чисто — ${r.pages} страниц, ${r.files} файлов, ${(r.bytes / 1048576).toFixed(1)} МБ`);
}
