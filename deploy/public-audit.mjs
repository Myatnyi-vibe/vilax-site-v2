// Страж публичного репозитория: перед каждой публикацией на GitHub проверяет дерево коммита (и, с --history, всю
// историю и тексты коммитов) на то, чему не место в открытом доступе: ключи и токены, рабочие почты, адреса стейджа и
// служебных страниц, локальные пути, внутренние ссылки, адреса демо-аккаунтов. Имена команды — предупреждение.
//
//   node deploy/public-audit.mjs [--ref main] [--history]
//
// Код возврата: 0 — публиковать можно, 1 — есть запреты (перечислены), 2 — ошибка запуска.
// Шаблоны написаны так, чтобы не находить сами себя (точки экранированы).
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const BLOCK = [
  [/\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/, 'токен GitHub'],
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/, 'ключ API'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'ключ AWS'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'закрытый ключ'],
  [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\b(?:password|passwd|secret|api[_-]?key)\s*[:=]\s*["'][^"'\s]{6,}["']/i, 'пароль или ключ в коде'],
  [/[\w.+-]+@vilax\.app\b/i, 'рабочая почта'],
  [/[\w.+-]+@(?:gmail|yandex|mail|icloud|outlook)\.[a-z]{2,}\b/i, 'личная почта'],
  [/\b(?:dev|stage|staging|predev)\.vilax\.[a-z]{2,}\b/i, 'адрес стейджа'],
  [/\b[a-z0-9]{20}\.supabase\.co\b/i, 'адрес базы'],
  [/\.chatgpt\.site\b/i, 'служебная страница'],
  [/claude\.ai\/(?:code\/)?artifact\//i, 'внутренний документ'],
  [/\b(?:samovar|aurelia)-(?:ru|ae)-uk\b/i, 'адрес демо-аккаунта стейджа'],
  [/[A-Za-z]:\\(?:Users|vilax)|\/c\/vilax|\bDownloads[\\/]|vilax-site-co[o]rd/i, 'локальный путь'],
  [/\b(?!127\.0\.0\.1\b)(?:\d{1,3}\.){3}\d{1,3}\b(?![\w.-]*\.(?:js|css|woff2|webp|png|avif))/, 'IP-адрес'],
];
export const WARN = [[/Данил|Ильяс|Ilyas|Артур|Valiullin/i, 'имя человека из команды']];

const TEXT = /\.(?:astro|ts|tsx|mjs|js|cjs|json|md|html|css|txt|ya?ml|xml|svg|sh|py|toml)$|(?:^|\/)[^.\/]+$|\.gitattributes$|\.gitignore$/;
// Номера версий пакетов и хэши не IP: в lock-файле цифры с точками — версии.
const SKIP_IP = /package-lock\.json$|\.svg$/;

export function scanText(path, text) {
  const out = [];
  const lines = text.split('\n');
  for (const [list, level] of [[BLOCK, 'block'], [WARN, 'warn']]) {
    for (const [re, what] of list) {
      if (what === 'IP-адрес' && SKIP_IP.test(path)) continue;
      lines.forEach((line, i) => {
        const m = re.exec(line);
        if (!m) return;
        const at = m.index;
        out.push({ level, what, where: `${path}:${i + 1}`, quote: line.slice(Math.max(0, at - 25), at + m[0].length + 25).trim() });
      });
    }
  }
  return out;
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

export function audit({ ref = 'main', history = false } = {}) {
  const found = [];
  const seen = new Set();
  const blobs = history
    ? git('rev-list', '--objects', ref).trim().split('\n').map((l) => l.split(' ')).filter((p) => p[1])
    : git('ls-tree', '-r', ref).trim().split('\n').map((l) => { const [meta, path] = l.split('\t'); return [meta.split(' ')[2], path]; });
  const todo = [];
  for (const [sha, path] of blobs) {
    if (seen.has(sha) || !TEXT.test(path)) continue;
    seen.add(sha);
    todo.push([sha, path]);
  }
  // все блобы одним процессом: git cat-file --batch → строка «<sha> <тип> <размер>», содержимое, перевод строки
  const out = execFileSync('git', ['cat-file', '--batch'], { input: todo.map(([sha]) => `${sha}\n`).join(''), maxBuffer: 1024 * 1024 * 1024 });
  let pos = 0;
  for (const [, path] of todo) {
    const nl = out.indexOf(10, pos);
    const [, type, size] = out.subarray(pos, nl).toString().split(' ');
    const n = Number(size);
    if (type === 'blob') found.push(...scanText(path, out.subarray(nl + 1, nl + 1 + n).toString('utf8')));
    pos = nl + 1 + (Number.isFinite(n) ? n : 0) + 1;
  }
  if (history) {
    for (const c of git('log', ref, '--format=%H%x1f%an <%ae>%x1f%B%x1e').split('\x1e')) {
      const [h, author, body] = c.trim().split('\x1f');
      if (!h) continue;
      found.push(...scanText(`коммит ${h.slice(0, 7)}`, `${author}\n${body ?? ''}`).filter((f) => !/noreply@anthropic\.com|users\.noreply\.github\.com/.test(f.quote)));
    }
  }
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { ref: { type: 'string', default: 'main' }, history: { type: 'boolean', default: false } } });
  let found;
  try {
    found = audit(values);
  } catch (e) {
    console.error(`public-audit: ${e.message}`);
    process.exit(2);
  }
  const blocks = found.filter((f) => f.level === 'block');
  const warns = found.filter((f) => f.level === 'warn');
  for (const f of blocks) console.error(`  ✗ ${f.what} — ${f.where}: «${f.quote}»`);
  if (warns.length) console.error(`  предупреждений «${WARN[0][1]}»: ${warns.length} (${[...new Set(warns.map((w) => w.where.split(':')[0]))].slice(0, 8).join(', ')}${warns.length > 8 ? ', …' : ''})`);
  const scope = values.history ? `вся история ${values.ref}` : `дерево ${values.ref}`;
  if (blocks.length) {
    console.error(`public-audit (${scope}): запретов ${blocks.length} — публиковать нельзя`);
    process.exit(1);
  }
  console.log(`public-audit (${scope}): запретов нет${warns.length ? `, предупреждений ${warns.length}` : ''}`);
}
