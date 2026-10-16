// CSP собранного сайта: в каждую страницу dist/ ставится <meta http-equiv="Content-Security-Policy"> с хэшами её
// встроенных скриптов. Скрипты — только свои файлы и эти хэши; запросы — только к приёмнику заявок и счётчику.
// На проде nginx дополнительно шлёт заголовок-рамку (frame-ancestors и та же политика без хэшей) — браузер
// выполняет обе, так что встроенный скрипт без хэша не запустится. На GitHub Pages заголовков нет — работает meta.
//
//   node deploy/csp.mjs --dist dist --mode prod --lead https://tracker.vilax.ai/api/site/demo-request [--ym]
//   node deploy/csp.mjs --dist dist --mode preview
//
// --ym — в сборке включена Яндекс Метрика (PUBLIC_VILAX_YM_ID): разрешить mc.yandex.ru / .com и yastatic.net.
// Повторный запуск по той же папке — отказ (страницы уже с CSP). Встроенные обработчики (onclick=…) — отказ.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const VERIFY_FILE = /^(google[0-9a-f]+|yandex_[0-9a-f]+)\.html$/;
export const YM_HOSTS = ['https://mc.yandex.ru', 'https://mc.yandex.com', 'https://yastatic.net'];

/** Встроенные исполняемые скрипты страницы: без src и с типом JS (нет type, module или text/javascript). */
export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== 'module' && type !== 'text/javascript') continue; // JSON-LD и прочие данные не исполняются
    out.push(m[2]);
  }
  return out;
}

export function sha256(text) {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/** Политика страницы. leadUrl — адрес приёмника (только prod), ym — включена Метрика. */
export function policy({ hashes, leadUrl = '', ym = false, upgrade = false }) {
  const ymHosts = ym ? YM_HOSTS : [];
  const connect = ["'self'", ...(leadUrl ? [new URL(leadUrl).origin] : []), ...(ym ? YM_HOSTS.slice(0, 2) : [])];
  const dirs = [
    ["default-src", ["'self'"]],
    ['script-src', ["'self'", ...hashes, ...ymHosts]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', ...(ym ? YM_HOSTS.slice(0, 2) : [])]],
    ['font-src', ["'self'"]],
    ['connect-src', connect],
    ['media-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
  ];
  const text = dirs.map(([k, v]) => `${k} ${[...new Set(v)].join(' ')}`).join('; ');
  return upgrade ? `${text}; upgrade-insecure-requests` : text;
}

/** Встраивает meta CSP сразу после <meta charset>, до любого скрипта. Возвращает новую разметку. */
export function withCsp(html, opts) {
  if (/http-equiv\s*=\s*["']?content-security-policy/i.test(html)) throw new Error('CSP уже стоит');
  const handler = /\son[a-z]+\s*=/i.exec(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''));
  if (handler) throw new Error(`встроенный обработчик события (${handler[0].trim()}…) — CSP его заблокирует`);
  if (/(href|src)\s*=\s*["']?javascript:/i.test(html)) throw new Error('ссылка javascript: — CSP её заблокирует');
  const hashes = [...new Set(inlineScripts(html).map(sha256))];
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy({ ...opts, hashes }).replaceAll('"', '&quot;')}">`;
  const charset = /<meta charset=["']?utf-8["']?\s*\/?>/i.exec(html);
  if (!charset) throw new Error('нет <meta charset="utf-8">');
  const at = charset.index + charset[0].length;
  const firstScript = html.search(/<script\b/i);
  if (firstScript !== -1 && firstScript < at) throw new Error('скрипт стоит раньше <meta charset>');
  return html.slice(0, at) + meta + html.slice(at);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function main() {
  const { values } = parseArgs({
    options: { dist: { type: 'string', default: 'dist' }, mode: { type: 'string' }, lead: { type: 'string', default: '' }, ym: { type: 'boolean', default: false } },
  });
  const { dist, mode, lead, ym } = values;
  if (mode !== 'prod' && mode !== 'preview') throw new Error('--mode prod | preview');
  // http — только стенд трекера на этой машине (проверка prod-сборки формы перед выкладкой)
  if (mode === 'prod' && !/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(lead)) throw new Error('prod: нужен --lead https://…');
  if (mode === 'preview' && lead) throw new Error('preview: форма ничего не отправляет — --lead не задаётся');
  // файлы подтверждения поисковиков (google….html, yandex_….html) отдаются байт в байт — их не трогаем
  const pages = walk(dist).filter((p) => p.endsWith('.html') && !VERIFY_FILE.test(basename(p)));
  let scripts = 0;
  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    scripts += inlineScripts(html).length;
    try {
      writeFileSync(p, withCsp(html, { leadUrl: lead, ym, upgrade: mode === 'prod' }));
    } catch (e) {
      throw new Error(`${relative(dist, p).split(sep).join('/')}: ${e.message}`);
    }
  }
  console.log(`csp: ${pages.length} страниц, встроенных скриптов ${scripts}, режим ${mode}${ym ? ', Метрика' : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(`csp: ${e.message}`);
    process.exit(1);
  }
}
