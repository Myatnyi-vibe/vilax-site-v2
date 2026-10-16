import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ymId, YM_INIT, ANALYTICS_ON } from '../src/lib/analytics.ts';

test('номер счётчика: пустой или не число — аналитика выключена', () => {
  assert.equal(ymId(undefined), '');
  assert.equal(ymId(''), '');
  assert.equal(ymId('  '), '');
  assert.equal(ymId('abc123'), '');
  assert.equal(ymId('12345678'), '12345678');
  assert.equal(ymId(' 98765432 '), '98765432');
});

test('Метрика без Вебвизора и карты кликов', () => {
  assert.equal(YM_INIT.webvisor, false);
  assert.equal(YM_INIT.clickmap, false);
});

test('без номера в окружении тестов счётчик выключен', () => {
  assert.equal(ANALYTICS_ON, false);
});

test('плашка и счётчик выводятся только при включённой аналитике', () => {
  const src = readFileSync(new URL('../src/components/site/Analytics.astro', import.meta.url), 'utf8');
  assert.match(src, /ANALYTICS_ON && \(/);
  // загрузчик счётчика — только внутри load(), который зовётся после согласия
  const loadAt = src.indexOf('const load = () =>');
  assert.ok(loadAt > 0 && src.indexOf('mc.yandex.ru') > loadAt);
});
