// @ts-check
import { defineConfig } from 'astro/config';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

// Inline-скрипты (is:inline, define:vars) и HTML-комментарии Astro отдаёт в HTML дословно — с русскими комментариями.
// Пользователю не видны, но утекают в /en/ и нарушают строгое «в /en/ ни одной русской буквы» на уровне исходника.
// Поэтому после сборки: (1) минифицируем тело каждого inline-скрипта (esbuild срезает комментарии; внешние src,
// JSON и JSON-LD не трогаем, не-JS тело оставляем); (2) срезаем HTML-комментарии вне script/style (в проде не нужны).
// Централизованно для всех сессий — их файлы не трогаем.
function stripSourceComments() {
  return {
    name: 'strip-source-comments',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const root = fileURLToPath(dir);
        const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
        for (const f of walk(root).filter((f) => f.endsWith('.html'))) {
          const src = readFileSync(f, 'utf8');
          // 1) минификация тел inline-скриптов
          let html = src.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g, (m, attrs, body) => {
            if (/\bsrc=/i.test(attrs)) return m;
            if (/type\s*=\s*["']?(application|text)\/(ld\+)?json/i.test(attrs)) return m;
            if (!body.trim()) return m;
            try {
              return `<script${attrs}>${transformSync(body, { loader: 'js', minify: true, legalComments: 'none' }).code.replace(/\s+$/, '')}</script>`;
            } catch {
              return m;
            }
          });
          // 2) срезать HTML-комментарии вне script/style (блоки временно маскируем, чтобы не задеть их содержимое)
          const blocks = [];
          html = html
            .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => `\u0000${blocks.push(m) - 1}\u0000`)
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
          if (html !== src) writeFileSync(f, html);
        }
      },
    },
  };
}

// Режим сборки задаёт только адрес приёмника заявок и плашку (ТЗ, «Сайт: режимы сборки»).
// local — заявки в локальный стенд трекера; preview — форма в режиме показа, страницы закрыты от поисковиков;
// prod — боевой vilax.ai. Адрес приёмника приходит из окружения при сборке (PUBLIC_VILAX_LEAD_URL), в код не вшивается.
const MODES = ['local', 'preview', 'prod'];
const mode = process.env.VILAX_MODE || 'local';
if (!MODES.includes(mode)) throw new Error(`VILAX_MODE=${mode}: ожидается ${MODES.join(' | ')}`);

// Превью в GitHub Pages живёт под подпутём: VILAX_SITE=https://myatnyi-vibe.github.io VILAX_BASE=/vilax-site
// (.github/workflows/preview.yml). Прод — только корень vilax.ai.
const site = process.env.VILAX_SITE || 'https://vilax.ai';
const base = process.env.VILAX_BASE || '/';
if (mode === 'prod' && (site !== 'https://vilax.ai' || base !== '/')) {
  throw new Error(`VILAX_MODE=prod собирается только для https://vilax.ai в корне (VILAX_SITE=${site}, VILAX_BASE=${base})`);
}

export default defineConfig({
  site,
  base,
  // Lighthouse собирает в .lighthouse/dist, чтобы не трогать рабочий dist/.
  outDir: process.env.VILAX_OUT_DIR || './dist',
  // /privacy → privacy.html, /ru/ → ru/index.html: адреса нынешнего сайта не меняются.
  build: { format: 'preserve', inlineStylesheets: 'auto' },
  trailingSlash: 'ignore',
  compressHTML: true,
  integrations: [stripSourceComments()],
  devToolbar: { enabled: false },
  vite: {
    define: {
      'import.meta.env.VILAX_MODE': JSON.stringify(mode),
    },
  },
});
