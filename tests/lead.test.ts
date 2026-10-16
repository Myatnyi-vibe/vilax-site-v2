// Заявка «Запросить демо» (SITE-15): логика формы без DOM и договор с приёмником трекера POST /api/site/demo-request.
// Телефоны и имена — только выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOCAL_LEAD_URL, SITE_SEGMENT, calcOf, checkInput, cleanText, formatPhone, leadBody, leadUrl, newRequestRef, outcomeOf, pageOf, phoneDigits, pickSegment, sectionOf, segmentOf, utmOf,
  type LeadInput,
} from '../src/lib/lead.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Поля тела, которые принимает приёмник трекера (server/site-lead.ts, SITE_FIELDS): незнакомое поле — отказ 400. */
const TRACKER_FIELDS = ['phone', 'name', 'city', 'venue', 'consent', 'consent_version', 'request_ref', 'site', 'region', 'segment', 'section', 'page', 'utm', 'calc', 'website', 'elapsed_ms'];

const ok: LeadInput = { country: '7', phone: '900 000-00-01', name: 'Тест Тестов', city: 'Тестоград', venue: 'Кофейня «Тестовая»', consent: true };

test('телефон: Россия — 10 цифр после +7 (ввод с 8 и +7 тоже), ОАЭ — 9 после +971, другая страна — 10–15 цифр', () => {
  assert.equal(phoneDigits('7', '900 000-00-01'), '79000000001');
  assert.equal(phoneDigits('7', '8 900 000 00 01'), '79000000001');
  assert.equal(phoneDigits('7', '+7 (900) 000-00-01'), '79000000001');
  assert.equal(phoneDigits('7', '900 000-00'), null);
  assert.equal(phoneDigits('971', '50 000 0001'), '971500000001');
  assert.equal(phoneDigits('971', '050 000 0001'), '971500000001');
  assert.equal(phoneDigits('971', '+971 50 000 0001'), '971500000001');
  assert.equal(phoneDigits('971', '50 000 001'), null);
  assert.equal(phoneDigits('other', '+44 20 0000 0001'), '442000000001');
  assert.equal(phoneDigits('other', '12345'), null);
  assert.equal(formatPhone('7', '89000000001'), '900 000-00-01');
  assert.equal(formatPhone('7', '9000'), '900 0');
  assert.equal(formatPhone('971', '971500000001'), '50 000 0001');
  assert.equal(formatPhone('other', '+44 (20) abc 0000'), '+44 (20)  0000');
});

test('поля: пусто — required; ссылки, разметка, нет букв, длина — invalid; без галочки согласия — required', () => {
  assert.deepEqual(checkInput(ok), {});
  assert.deepEqual(checkInput({ ...ok, phone: '', name: ' ', consent: false }), { phone: 'required', name: 'required', consent: 'required' });
  assert.deepEqual(checkInput({ ...ok, phone: '900', name: 'Тест https://spam.example', city: '1', venue: '<b>Кафе</b>' }),
    { phone: 'invalid', name: 'invalid', city: 'invalid', venue: 'invalid' });
  assert.equal(cleanText('name', '  Тест   Тестов '), 'Тест Тестов');
  assert.equal(cleanText('name', '12345'), null);
  assert.equal(cleanText('venue', '12 стульев'), '12 стульев');
  assert.equal(cleanText('venue', 'shop.ru'), null);
  assert.equal(cleanText('city', 'x'.repeat(81)), null);
});

test('скрытые поля: UTM — только utm_*, страница — путь без параметров, секция — код, калькулятор — только коды и числа справочника', () => {
  assert.deepEqual(utmOf('?utm_source=yandex&utm_campaign=demo&gclid=zzz&utm_term='), { utm_source: 'yandex', utm_campaign: 'demo' });
  assert.equal(utmOf('?a=1'), null);
  assert.equal(pageOf('/ru/'), '/ru/');
  assert.equal(pageOf('/ru/privacy'), '/ru/privacy');
  assert.equal(pageOf('/ру/'), null);
  assert.equal(sectionOf('prices'), 'prices');
  assert.equal(sectionOf('Цены'), null);
  assert.equal(sectionOf(undefined), null);
  assert.deepEqual(calcOf({ locations: 3, modules: ['finance', 'reputation'], staff: 'hr', staff_n: 40, period: 'month', month_total: 4117.004, cur: 'AED', price: 1 }),
    { locations: 3, staff_n: 40, staff: 'hr', period: 'month', cur: 'AED', modules: ['finance'], month_total: 4117 });
  assert.equal(calcOf({ locations: 0, staff: 'boss' }), null);
  // Выбор калькулятора B (CalcLead, src/lib/pricing-calc.ts) — в имена приёмника; версия прайса и итог за год не нужны.
  assert.deepEqual(calcOf({
    priceVersion: '2026-10-05', currency: 'AED', locations: 2, modules: ['bundle'], staff: 'people', employees: 130, billing: 'annual',
    auraBlocks: 1, coordBlocks: 0, monthly: 6057.4, total: 72684,
  }), { locations: 2, staff_n: 130, aura_packs: 1, coord_packs: 0, staff: 'hr', period: 'year', cur: 'AED', modules: [], all_in: true, month_total: 6057.4 });
  assert.deepEqual(calcOf({ currency: 'RUB', locations: 1, modules: ['base', 'guests', 'loyalty'], staff: 'none', employees: 0, billing: 'monthly', auraBlocks: 0, coordBlocks: 0, monthly: 0, total: 0 }),
    { locations: 1, staff_n: 0, aura_packs: 0, coord_packs: 0, staff: 'none', period: 'month', cur: 'RUB', modules: ['guests', 'loyalty'], month_total: 0 });
  assert.equal(calcOf('3 локации'), null);
});

test('калькулятор РФ (блоки за локацию, запись B 12.10 20:18): blocks и tier — как есть, флаг uk — блок, поля v16 и лишнее — прочь', () => {
  // Пример B: сеть 20 точек, Основа + Лояльность, тариф 11–25, помесячно.
  assert.deepEqual(calcOf({
    priceVersion: '2026-10-12', model: 'blocks', segment: 'chain', currency: 'RUB', locations: 20, tier: '11-25', blocks: ['base', 'loyalty'], uk: false,
    billing: 'monthly', monthly: 61600, total: 61600,
  }), { locations: 20, period: 'month', cur: 'RUB', tier: '11-25', blocks: ['base', 'loyalty'], month_total: 61600 });
  // Годовая: в месяц — уже с −16,7 %; УК флагом без кода в blocks — всё равно блок; порядок — по справочнику.
  assert.deepEqual(calcOf({
    priceVersion: '2026-10-12', model: 'blocks', segment: 'chain', currency: 'RUB', locations: 120, tier: '101-200', blocks: ['staff', 'base', 'guests'], uk: true,
    billing: 'annual', monthly: 51312.8, total: 615753.6,
  }), { locations: 120, period: 'year', cur: 'RUB', tier: '101-200', blocks: ['base', 'guests', 'staff', 'uk'], month_total: 51312.8 });
  // Поля v16 рядом с блоками не уходят; чужой блок и чужой тариф — отброшены, заявка не ломается.
  assert.deepEqual(calcOf({ model: 'blocks', currency: 'RUB', locations: 2, tier: '1', blocks: ['base', 'reputation'], modules: ['guests'], staff: 'people', employees: 9, auraBlocks: 1 }),
    { locations: 2, cur: 'RUB', blocks: ['base'] });
  assert.deepEqual(calcOf({ model: 'blocks', currency: 'RUB', locations: 2 }), { locations: 2, cur: 'RUB', blocks: [] }, 'модель блоков без выбора — пустой список, не v16');
  // ОАЭ (v16 + model, segment) — как раньше.
  assert.deepEqual(calcOf({
    priceVersion: '2026-10-05', model: 'v16', segment: 'independent', currency: 'AED', locations: 3, modules: ['base', 'finance'], staff: 'people', employees: 40,
    billing: 'monthly', auraBlocks: 0, coordBlocks: 0, monthly: 4117, total: 4117,
  }), { locations: 3, staff_n: 40, aura_packs: 0, coord_packs: 0, staff: 'hr', period: 'month', cur: 'AED', modules: ['finance'], month_total: 4117 });
});

test('тело заявки — ровно поля приёмника трекера; регион по версии сайта; телефон — +цифры', () => {
  const body = leadBody(ok, {
    site: 'ru', segment: 'chain', section: 'prices', page: '/ru/', utm: { utm_source: 'test' }, calc: { locations: 3 }, consentVersion: 'ru-2026-10-10-draft',
    requestRef: 'web-0001-test', honeypot: '', elapsedMs: 12_345.6,
  });
  assert.deepEqual(Object.keys(body).sort(), [...TRACKER_FIELDS].sort());
  assert.deepEqual(body, {
    phone: '+79000000001', name: 'Тест Тестов', city: 'Тестоград', venue: 'Кофейня «Тестовая»', consent: true, consent_version: 'ru-2026-10-10-draft',
    request_ref: 'web-0001-test', site: 'ru', region: 'RU', segment: 'chain', section: 'prices', page: '/ru/', utm: { utm_source: 'test' }, calc: { locations: 3 },
    website: '', elapsed_ms: 12_346,
  });
  const en = leadBody({ ...ok, country: '971', phone: '50 000 0001' }, {
    site: 'en', segment: 'independent', section: null, page: null, utm: null, calc: null, consentVersion: 'en-2026-10-10-draft', requestRef: 'web-0002-test', honeypot: '', elapsedMs: 5_000,
  });
  assert.deepEqual([en.region, en.phone, en.segment], ['AE', '+971500000001', 'independent']);
  assert.match(newRequestRef(() => 'f47ac10b-58cc-4372-a567-0e02b2c3d479'), /^web-[A-Za-z0-9_-]{8,60}$/);
  // Тип бизнеса (ТЗ 12.10.2026): только independent | chain; иное (в т.ч. не строка) — null.
  assert.deepEqual([segmentOf('independent'), segmentOf('chain')], ['independent', 'chain']);
  for (const v of ['INDEPENDENT', 'network', '', ' chain', null, undefined, 1]) assert.equal(segmentOf(v), null, String(v));
  // Источники по порядку (контракт A: window.__vilaxSegment, <html data-segment>); ничего не подошло — тип по региону
  // (решение 12.10.2026, 16:45): РФ — сеть, ОАЭ — своё заведение.
  assert.deepEqual(SITE_SEGMENT, { ru: 'chain', en: 'independent' });
  assert.equal(pickSegment('ru', 'chain', 'independent'), 'chain', 'первый годный источник — window.__vilaxSegment');
  assert.equal(pickSegment('ru', undefined, 'chain'), 'chain', 'нет window.__vilaxSegment — <html data-segment>');
  assert.equal(pickSegment('en', 'bad', 'independent'), 'independent', 'пропускает негодное значение');
  assert.equal(pickSegment('ru'), 'chain', 'РФ без источников — сеть');
  assert.equal(pickSegment('en'), 'independent', 'ОАЭ без источников — своё заведение');
  assert.equal(pickSegment('ru', null, undefined, '', 'nope'), 'chain', 'ни один источник не подошёл — по региону');
});

test('режимы: local — стенд 8890 (или адрес сборки), preview — никуда, prod — только адрес сборки', () => {
  assert.equal(leadUrl('local', undefined), LOCAL_LEAD_URL);
  assert.equal(LOCAL_LEAD_URL, 'http://localhost:8890/api/site/demo-request');
  assert.equal(leadUrl('local', 'http://127.0.0.1:9999/api/site/demo-request'), 'http://127.0.0.1:9999/api/site/demo-request');
  assert.equal(leadUrl('preview', 'https://tracker.vilax.ai/api/site/demo-request'), null);
  assert.equal(leadUrl('prod', ''), null);
  assert.equal(leadUrl('prod', 'https://tracker.vilax.ai/api/site/demo-request'), 'https://tracker.vilax.ai/api/site/demo-request');
});

test('ответ приёмника: 202 { ok } — принято; 429 — часто; 503 — заявки не принимаются; 400 — поле; прочее — сбой', () => {
  assert.deepEqual(outcomeOf(202, { ok: true }), { kind: 'ok' });
  assert.deepEqual(outcomeOf(202, null), { kind: 'failed' });
  assert.deepEqual(outcomeOf(429, { code: 'rate_limited' }), { kind: 'limited' });
  assert.deepEqual(outcomeOf(503, { code: 'section_unavailable' }), { kind: 'unavailable' });
  assert.deepEqual(outcomeOf(400, { code: 'validation', field: 'phone' }), { kind: 'invalid', field: 'phone' });
  for (const s of [0, 403, 404, 413, 415, 500, 502]) assert.deepEqual(outcomeOf(s, null), { kind: 'failed' }, String(s));
});

test('тексты формы: версия согласия — код приёмника и совпадает с текстом согласия своей версии; запасной контакт — mailto, https или tel', () => {
  for (const lang of ['ru', 'en']) {
    const f = JSON.parse(read(`src/content/${lang}/legal/form.json`));
    assert.match(f.consentVersion, /^[a-z0-9][a-z0-9._-]{0,31}$/);
    assert.ok(read(`src/content/${lang}/legal/consent.html`).includes(f.consentVersion), `${lang}: версия согласия — та же, что в consent.html`);
    for (const c of f.contacts) assert.ok(c.href === '' || /^(mailto:|https:\/\/|tel:\+)/.test(c.href), `${lang}: ${c.label}`);
    assert.ok(f.contacts.some((c: { href: string }) => c.href), `${lang}: хотя бы один запасной контакт настоящий`);
  }
});
