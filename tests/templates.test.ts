// В разметке нет видимых русских строк: всё, что видит человек, — из словарей.
// Проверка грубая: из .astro вырезаются фронтматтер, комментарии, <script> и <style>, остаток не должен содержать кириллицу.
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

export function visibleMarkup(src: string): string {
  return src
    .replace(/^---[\s\S]*?\n---/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
}

test('в шаблонах .astro нет русских строк вне словарей', () => {
  const files = ['src/pages', 'src/components', 'src/layouts', 'src/scenes']
    .flatMap((d) => walk(join(ROOT, d)))
    .filter((p) => p.endsWith('.astro'));
  const bad = files
    .filter((p) => CYR.test(visibleMarkup(readFileSync(p, 'utf8'))))
    .map((p) => relative(ROOT, p).replaceAll('\\', '/'));
  assert.deepEqual(bad, []);
});
