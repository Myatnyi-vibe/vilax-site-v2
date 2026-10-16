// Lighthouse обеих версий против бюджета скорости. Тяжёлое — по одному запуску на машину (замок — в файле из VILAX_COORD, если задан).
// Собирает сайт в режиме prod в .lighthouse/dist, отдаёт его локальным сервером со сжатием и гоняет Edge headless.
// Запуск: npm run lighthouse [-- --pages=/ru/,/en/] [-- --no-lock-check]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { browserPath } from './browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '.lighthouse');
const DIST = join(OUT, 'dist');
const args = process.argv.slice(2);
const arg = (name, def) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const PAGES = arg('pages', '/ru/,/en/').split(',');
const COORD = process.env.VILAX_COORD || '';

// Бюджет (ТЗ, «Скорость, телефон, поиск…»)
const BUDGET = {
  mobile: { performance: 90, accessibility: 95, seo: 100, lcp: 2500, cls: 0.1 },
  desktop: { performance: 95, accessibility: 95, seo: 100, lcp: 2500, cls: 0.1 },
  scriptsKb: 120,
};

if (!args.includes('--no-lock-check') && COORD && existsSync(COORD)) {
  const lock = readFileSync(COORD, 'utf8').match(/^HEAVY LOCK:\s*(.*)$/m)?.[1]?.trim() ?? '';
  if (!/^A\b/.test(lock)) {
    console.error(`HEAVY LOCK сейчас: «${lock || '—'}». Поставь «HEAVY LOCK: A <время> lighthouse» в ${COORD} и запусти снова.`);
    process.exit(2);
  }
}

console.log('Сборка prod в .lighthouse/dist …');
execSync('npx astro build', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, VILAX_MODE: 'prod', VILAX_OUT_DIR: DIST },
});

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
};

function resolve(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0]).replace(/^\//, '');
  const candidates = p === '' ? ['index.html'] : p.endsWith('/') ? [`${p}index.html`] : [p, `${p}.html`, `${p}/index.html`];
  return candidates.map((c) => join(DIST, c)).find((f) => existsSync(f) && statSync(f).isFile());
}

const server = createServer((req, res) => {
  const file = resolve(req.url || '/');
  const status = file ? 200 : 404;
  const path = file || join(DIST, '404.html');
  const type = TYPES[extname(path)] || 'application/octet-stream';
  let body = readFileSync(path);
  const headers = { 'Content-Type': type, 'Cache-Control': /\/_astro\//.test(req.url || '') ? 'public, max-age=31536000, immutable' : 'no-cache' };
  if (/^(text|application\/(json|xml)|image\/svg)/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    body = gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
  }
  res.writeHead(status, headers);
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const { default: lighthouse } = await import('lighthouse');
const { default: desktopConfig } = await import('lighthouse/core/config/desktop-config.js');
const chromeLauncher = await import('chrome-launcher');
const chromePath = browserPath();
const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new', '--no-first-run'] });

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const dir = join(OUT, stamp);
mkdirSync(dir, { recursive: true });
const rows = [];
let failed = false;

try {
  for (const page of PAGES) {
    for (const form of ['mobile', 'desktop']) {
      const config = form === 'desktop' ? desktopConfig : undefined;
      const result = await lighthouse(
        base + page,
        { port: chrome.port, output: 'html', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] },
        config,
      );
      const lhr = result.lhr;
      const name = `${page.replace(/\//g, '_') || 'root'}-${form}`;
      writeFileSync(join(dir, `${name}.html`), result.report);
      const score = (c) => Math.round((lhr.categories[c]?.score ?? 0) * 100);
      const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? NaN;
      const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? NaN;
      const reqs = lhr.audits['network-requests']?.details?.items ?? [];
      const scriptsKb = reqs.filter((r) => r.resourceType === 'Script').reduce((s, r) => s + (r.transferSize || 0), 0) / 1024;
      const totalKb = reqs.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024;
      const b = BUDGET[form];
      const misses = [];
      if (score('performance') < b.performance) misses.push(`скорость ${score('performance')} < ${b.performance}`);
      if (score('accessibility') < b.accessibility) misses.push(`доступность ${score('accessibility')} < ${b.accessibility}`);
      if (score('seo') < b.seo) misses.push(`поиск ${score('seo')} < ${b.seo}`);
      if (lcp > b.lcp) misses.push(`LCP ${Math.round(lcp)} мс > ${b.lcp}`);
      if (cls > b.cls) misses.push(`CLS ${cls.toFixed(3)} > ${b.cls}`);
      if (scriptsKb > BUDGET.scriptsKb) misses.push(`скрипты ${scriptsKb.toFixed(0)} КБ > ${BUDGET.scriptsKb}`);
      if (misses.length) failed = true;
      rows.push({
        page,
        form,
        perf: score('performance'),
        a11y: score('accessibility'),
        bp: score('best-practices'),
        seo: score('seo'),
        lcp: Math.round(lcp),
        cls: +cls.toFixed(3),
        scriptsKb: +scriptsKb.toFixed(1),
        totalKb: +totalKb.toFixed(1),
        misses: misses.join('; ') || 'ок',
      });
    }
  }
} finally {
  chrome.kill();
  server.close();
}

writeFileSync(join(dir, 'summary.json'), JSON.stringify({ budget: BUDGET, rows }, null, 2));
console.table(rows);
console.log(`Отчёты: ${dir}`);
// --report-only: печатаем отчёт, но не падаем кодом 1 (для CI — общие раннеры шумят по скорости, бюджет
// проверяет локальная приёмка SITE-7). Локально флаг не передаём — приёмка остаётся строгой.
const reportOnly = args.includes('--report-only');
if (failed && reportOnly) console.log('Бюджет не выполнен, но --report-only: выходим без ошибки (для сведения).');
process.exit(failed && !reportOnly ? 1 : 0);
