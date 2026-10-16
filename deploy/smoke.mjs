// Браузерная проверка собранной папки так, как её отдаст хостинг: GitHub Pages под подпутём или nginx в корне.
//
//   node deploy/smoke.mjs --dist dist --base /vilax-site --mode preview
//   node deploy/smoke.mjs --dist dist --mode prod
//
// Поднимает локальный сервер (без расширения → .html, нет файла → 404.html с кодом 404), открывает страницы в
// headless Chrome и падает, если есть: ошибка в консоли или скрипте, нарушение CSP, запрос своего сайта с кодом ≥ 400,
// незагруженный шрифт, запрос наружу (кроме разрешённых ниже — их не пускаем, только считаем). Проверяет экран выбора
// (запоминание и «Сменить версию») и форму: в preview она показывает «заявка не отправлена» и ничего не шлёт;
// в prod форму не отправляем — любой запрос к приёмнику обрывается (это боевая CRM).
// Данные формы — выдуманные. Chrome — scripts/browser.mjs (CHROME_PATH, Chrome, Edge).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';
import { browserPath } from '../scripts/browser.mjs';

const { values } = parseArgs({
  options: {
    dist: { type: 'string', default: 'dist' },
    base: { type: 'string', default: '' },
    mode: { type: 'string', default: 'preview' },
  },
});
const BASE = values.base.replace(/\/+$/, '');
const MODE = values.mode;
const DIST = values.dist;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.json': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.xml': 'application/xml', '.txt': 'text/plain',
};
// Внешние адреса, которые страница вправе знать, но в проверке мы их не грузим.
const OUTSIDE_OK = [/^https:\/\/mc\.yandex\.(ru|com)\//, /^https:\/\/app\.vilax\.ai\//];

function serve() {
  const srv = createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (BASE && !url.startsWith(`${BASE}/`) && url !== BASE) {
      res.writeHead(404).end('outside base');
      return;
    }
    const p = url.slice(BASE.length).replace(/^\/+/, '');
    const cands = p === '' || p.endsWith('/') ? [`${p}index.html`] : [p, `${p}.html`];
    const f = cands.map((c) => join(DIST, c)).find((x) => existsSync(x) && statSync(x).isFile());
    if (!f) {
      res.writeHead(404, { 'Content-Type': TYPES['.html'] }).end(readFileSync(join(DIST, '404.html')));
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const errors = [];
/** Шаг проверки: исключение внутри — отказ этого шага, остальные шаги идут дальше. */
async function step(label, fn) {
  try {
    await fn();
  } catch (e) {
    errors.push(`${label}: ${String(e.message).split(/\r?\n/)[0]}`);
  }
}
const srv = await serve();
const ORIGIN = `http://127.0.0.1:${srv.address().port}`;
const at = (p) => `${ORIGIN}${BASE}/${p}`;
const browser = await puppeteer.launch({
  executablePath: browserPath(),
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,900'],
});

async function openPage(label, ctx = browser) {
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const bad = (msg) => errors.push(`${label}: ${msg}`);
  const outside = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith(ORIGIN) || u.startsWith('data:') || u.startsWith('blob:')) return req.continue();
    outside.push(`${req.method()} ${u}`);
    if (!OUTSIDE_OK.some((re) => re.test(u))) bad(`запрос наружу: ${req.method()} ${u}`);
    return req.abort();
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_FAILED|Failed to load resource/.test(t)) return; // оборванные нами запросы наружу и ожидаемый 404 ниже
    bad(`консоль: ${t}`);
  });
  page.on('pageerror', (e) => bad(`ошибка скрипта: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().startsWith(ORIGIN) && r.status() >= 400 && !r.url().includes('__smoke-missing')) bad(`${r.status()} ${r.url().slice(ORIGIN.length)}`);
  });
  await page.evaluateOnNewDocument(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || 'inline'}`));
  });
  return { page, bad, outside };
}

async function visit(path, { expectStatus = 200 } = {}) {
  const { page, bad } = await openPage(path || '/');
  const r = await page.goto(at(path), { waitUntil: 'networkidle0', timeout: 30_000 });
  if (r.status() !== expectStatus) bad(`код ${r.status()}, ожидался ${expectStatus}`);
  // долистать до конца — догрузятся сцена, калькулятор, снимки
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await new Promise((r) => setTimeout(r, 600));
  const info = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      csp: window.__csp,
      fonts: [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family),
      mode: document.documentElement.dataset.mode,
    };
  });
  for (const c of info.csp) bad(`нарушение CSP: ${c}`);
  for (const f of info.fonts) bad(`шрифт не загрузился: ${f}`);
  if (info.mode !== MODE) bad(`data-mode=${info.mode}, ожидался ${MODE}`);
  await page.close();
}

try {
  for (const p of ['', 'privacy', 'terms', 'support', 'ru/privacy', 'ru/terms', 'ru/support', 'ru/consent', 'en/consent', 'en/privacy']) {
    await step(p || '/', () => visit(p));
  }
  await step('404', () => visit('__smoke-missing', { expectStatus: 404 }));

  // одна страница: старые адреса версий ведут на «/» с сочетанием, переключатели меняют только свою ось и запоминаются
  await step('переключатели', async () => {
    const ctx = await browser.createBrowserContext();
    const { page, bad } = await openPage('переключатели', ctx);
    const axes = () => page.evaluate(() => [document.documentElement.lang, document.documentElement.dataset.currency, document.documentElement.dataset.theme].join(' '));
    for (const [old, want] of [['ru/', 'ru rub'], ['en/', 'en aed'], ['ru/en/', 'en rub'], ['en/ru/', 'ru aed']]) {
      await page.goto(at(old), { waitUntil: 'networkidle0' });
      if (!page.url().startsWith(at(''))) bad(`${old} не ведёт на «/»: ${page.url()}`);
      const got = (await axes()).split(' ').slice(0, 2).join(' ');
      if (got !== want) bad(`${old} → сочетание «${got}», ожидалось «${want}»`);
    }
    await page.goto(at('?lang=ru&cur=rub&theme=dark'), { waitUntil: 'networkidle0' });
    await page.click('.hdr [data-set-cur="aed"]');
    if ((await axes()) !== 'ru aed dark') bad(`валюта поменяла не только себя: ${await axes()}`);
    await page.click('.hdr [data-set-lang="en"]');
    if ((await axes()) !== 'en aed dark') bad(`язык поменял не только себя: ${await axes()}`);
    await page.click('.hdr [data-theme-toggle]');
    if ((await axes()) !== 'en aed light') bad(`тема поменяла не только себя: ${await axes()}`);
    await page.goto(at(''), { waitUntil: 'networkidle0' });
    if ((await axes()) !== 'en aed light') bad(`выбор не пережил перезагрузку: ${await axes()}`);
    await ctx.close();
  });

  // форма заявки на «/»: в превью ничего не уходит наружу
  // блоки платформы: в настоящем браузере наведение на каждую функцию со снимком показывает её экран своего сочетания
  await step('снимки функций', async () => {
    const { page, bad } = await openPage('снимки функций');
    for (const [lang, cur, theme] of [['ru', 'rub', 'light'], ['en', 'aed', 'dark']]) {
      await page.goto(at(`?lang=${lang}&cur=${cur}&theme=${theme}`), { waitUntil: 'networkidle0' });
      for (const tab of await page.$$eval('[data-tab]', (b) => b.map((x) => x.dataset.tab))) {
        await page.click(`[data-tab="${tab}"]`);
        const r = await page.evaluate(async (cur, lang) => {
          const panel = document.querySelector('.bl__panel:not([hidden])');
          const lis = [...(panel.querySelector(`.bl__vl[data-cur="${cur}"][data-lang="${lang}"]`)?.querySelectorAll('.bl__li') ?? [])];
          const out = { total: lis.length, shown: [] };
          for (const li of lis.filter((l) => l.classList.contains('is-shot'))) {
            li.dispatchEvent(new MouseEvent('mouseenter'));
            await new Promise((r) => setTimeout(r, 30));
            out.shown.push([li.dataset.screen, panel.querySelector('[data-shot-img]').getAttribute('src') ?? '']);
            li.dispatchEvent(new MouseEvent('mouseleave'));
          }
          return out;
        }, cur, lang);
        if (!r.total) bad(`${lang}/${cur}/${tab}: в панели нет функций`);
        if (!r.shown.length) bad(`${lang}/${cur}/${tab}: ни одной функции со снимком`);
        for (const [id, src] of r.shown) if (!src.endsWith(`/shots/${cur}/${lang}/${theme}/${id}.webp`)) bad(`${lang}/${cur}/${tab}: функция ${id} показала ${src}`);
      }
    }
    await page.close();
  });

  await step('форма', async () => {
    const { page, bad, outside } = await openPage('форма');
    await page.goto(at('?lang=ru&cur=rub'), { waitUntil: 'networkidle0' });
    if (MODE === 'preview') {
      await page.type('#lead-name', 'Тест Проверкин');
      await page.type('#lead-phone', '+7 900 000-00-01');
      await page.type('#lead-city', 'Тестоград');
      await page.type('#lead-company', 'Проверка превью');
      await page.click('#pricing button[type="submit"]');
      await page.waitForSelector('[data-lead-done]:not([hidden])', { timeout: 5000 }).catch(() => bad('нет экрана «Спасибо» после отправки'));
      if (outside.length) bad(`форма превью ходила наружу: ${outside.join(', ')}`);
    }
    await page.close();
  });
} finally {
  await browser.close();
  srv.close();
}

if (errors.length) {
  console.error(`smoke (${MODE}${BASE ? `, ${BASE}` : ''}): ошибок ${errors.length}`);
  for (const e of [...new Set(errors)].slice(0, 50)) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`smoke (${MODE}${BASE ? `, ${BASE}` : ''}): чисто — 11 страниц, переключатели и старые адреса, снимки функций, форма`);
