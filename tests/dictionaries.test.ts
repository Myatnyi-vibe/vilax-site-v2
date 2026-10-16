// Словари ru/en: одинаковый набор файлов и ключей, в английских — ни одной русской буквы.
// Ключи словаря и формат src/content — сессия B; этот тест только сверяет пары.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CYR = /[\u0400-\u04FF]/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Пути ключей; индексы массивов схлопнуты в [] — длина списков у версий может различаться. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.length ? [...new Set(value.flatMap((v) => keyPaths(v, `${prefix}[]`)))] : [`${prefix}[]`];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

const pairs: Array<[string, string]> = [['src/i18n/ru.json', 'src/i18n/en.json']];
const ruContent = join(ROOT, 'src/content/ru');
const enContent = join(ROOT, 'src/content/en');
const ruFiles = walk(ruContent).map((p) => relative(ruContent, p).replaceAll('\\', '/'));
const enFiles = walk(enContent).map((p) => relative(enContent, p).replaceAll('\\', '/'));

test('src/content: у ru и en одинаковый набор файлов', () => {
  assert.deepEqual([...ruFiles].sort(), [...enFiles].sort());
});

for (const f of ruFiles.filter((f) => f.endsWith('.json'))) {
  pairs.push([`src/content/ru/${f}`, `src/content/en/${f}`]);
}

for (const [ruPath, enPath] of pairs) {
  test(`ключи совпадают: ${ruPath} ↔ ${enPath}`, () => {
    const ru = JSON.parse(readFileSync(join(ROOT, ruPath), 'utf8'));
    const en = JSON.parse(readFileSync(join(ROOT, enPath), 'utf8'));
    const a = new Set(keyPaths(ru));
    const b = new Set(keyPaths(en));
    const onlyRu = [...a].filter((k) => !b.has(k));
    const onlyEn = [...b].filter((k) => !a.has(k));
    assert.deepEqual({ onlyRu, onlyEn }, { onlyRu: [], onlyEn: [] });
  });

  test(`нет кириллицы: ${enPath}`, () => {
    const en = JSON.parse(readFileSync(join(ROOT, enPath), 'utf8'));
    const bad = strings(en).filter((s) => CYR.test(s));
    assert.deepEqual(bad, []);
  });
}

test('правовые тексты en без кириллицы (кроме служебного комментария)', () => {
  const bad = enFiles
    .filter((f) => !f.endsWith('.json'))
    .filter((f) => CYR.test(readFileSync(join(enContent, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '')));
  assert.deepEqual(bad, []);
});

// Четыре набора текстов сайта (валюта × язык): одинаковые ключи и состав; английские — без кириллицы.
const SITE = ['rub-ru', 'rub-en', 'aed-en', 'aed-ru'].map((k) => [k, JSON.parse(readFileSync(join(ROOT, `src/content/site/${k}.json`), 'utf8'))] as const);

test('src/content/site: у четырёх сочетаний одинаковые ключи', () => {
  const base = new Set(keyPaths(SITE[0][1]));
  for (const [k, d] of SITE.slice(1)) {
    const b = new Set(keyPaths(d));
    assert.deepEqual({ k, only: [...base].filter((x) => !b.has(x)), extra: [...b].filter((x) => !base.has(x)) }, { k, only: [], extra: [] });
  }
});

test('src/content/site: в rub-en и aed-en нет кириллицы', () => {
  for (const [k, d] of SITE.filter(([k]) => k.endsWith('-en'))) assert.deepEqual({ k, bad: strings(d).filter((s) => CYR.test(s)) }, { k, bad: [] });
});

test('src/content/site: у всех сочетаний одни и те же блоки, шаги, иконки и пункты заявки', () => {
  type D = { blocks: { key: string }[]; onboarding: { steps: unknown[] }; fusion: { items: unknown[] }; lead: { points: unknown[] } };
  const shape = (d: D) => [d.blocks.map((b) => b.key).join(','), d.onboarding.steps.length, d.fusion.items.length, d.lead.points.length].join('|');
  for (const [k, d] of SITE) assert.equal(shape(d), shape(SITE[0][1]), k);
});
