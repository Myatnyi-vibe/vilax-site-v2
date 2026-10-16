// Цены сайта не расходятся с источниками. ОАЭ (v16): модуль расчёта — тот же файл, что на странице продаж v16, цены —
// объект commercial, семь контрольных расчётов ТЗ сходятся до цента. РФ (blocks): цены — копия листа «Цены» таблицы
// VILAX_цены_РФ_блоки_за_локацию_2026-10-12.xlsx, контрольные наборы посчитаны по формулам листа «Калькулятор».
// Сайт с разошедшимися числами не соберётся.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  quoteFor,
  leadPayload,
  lines,
  normalize,
  isSegment,
  modelFor,
  segmentFor,
  quoteBlocks,
  blocksLines,
  blocksLeadPayload,
  defaultBlocksInput,
  tierIndex,
  type CalcInput,
  type BlocksInput,
} from '../src/lib/pricing-calc.ts';
import { VilaxPricing } from '../src/lib/pricing.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const prices = JSON.parse(read('src/data/prices.json'));
const registry = JSON.parse(read('src/data/registry-v16.json'));
const cents = (n: number) => Math.round(n * 100);

// Отпечаток скрипта VilaxPricing со страницы v16 (05.10.2026); меняется только вместе с новой версией страницы продаж.
const PRICING_V16_SHA256 = '411d73e3c082cf4dd5f5077bf1db0fe4d5dbd7782292921fdd79b53d6945ba3e';

test('модуль расчёта — копия v16 байт в байт', () => {
  const sha = createHash('sha256').update(readFileSync(join(ROOT, 'src/lib/pricing-v16.js'))).digest('hex');
  assert.equal(sha, PRICING_V16_SHA256);
  assert.equal(typeof VilaxPricing?.create, 'function');
});

test('цены English = объект commercial реестра v16', () => {
  assert.equal(registry.version, 16);
  assert.deepEqual(prices.en.commercial, registry.commercial);
  assert.equal(prices.en.currency, 'AED');
  assert.equal(prices.en.taxRate, 0.05);
  assert.match(prices.en.version, /^\d{4}-\d{2}-\d{2}$/);
});

for (const lang of ['ru', 'en'] as const) {
  test(`справочник ${lang}: показ цен только с ценами и датой версии`, () => {
    const p = prices[lang];
    for (const k of ['model', 'segment', 'currency', 'locale', 'taxRate', 'taxLabel', 'showPrices', 'version', 'source', 'locations']) assert.ok(k in p, `нет поля ${k}`);
    assert.equal(p.model, modelFor(p.segment), 'модель версии = модель её типа бизнеса');
    assert.ok(p.locations.min >= 1 && p.locations.min <= p.locations.start && p.locations.start <= p.locations.max, 'границы локаций');
    if (p.showPrices) {
      assert.match(p.version, /^\d{4}-\d{2}-\d{2}$/, 'showPrices без даты версии');
      if (p.model === 'v16') {
        assert.ok(p.commercial, 'showPrices без цен');
        for (const k of Object.keys(registry.commercial)) assert.ok(k in p.commercial, `в ${lang}.commercial нет ${k}`);
      } else {
        assert.ok(p.blocks.length && p.tiers.length && p.uk?.price > 0, 'showPrices без блоков, тарифов или УК');
        for (const b of p.blocks) assert.equal(b.prices.length, p.tiers.length, `${b.key}: цена на каждый тариф`);
      }
    }
  });
}

// Контрольные расчёты English: ТЗ, раздел «Цены и калькулятор», посчитаны модулем страницы v16 10.10.2026.
const CONTROL: Array<{ n: number; name: string; input: Partial<CalcInput>; monthly: number; monthlyEquivalent: number; total: number; team?: number }> = [
  { n: 1, name: '1 локация, только Основа, помесячно', input: { locations: 1 }, monthly: 490, monthlyEquivalent: 490, total: 490 },
  { n: 2, name: '1 локация, Основа + Гости 360 + Финансы + Лояльность', input: { locations: 1, guests: true, finance: true, loyalty: true }, monthly: 2204, monthlyEquivalent: 2204, total: 2204 },
  { n: 3, name: '1 локация, Всё включено, 30 сотрудников', input: { locations: 1, bundle: true, employees: 30 }, monthly: 2990, monthlyEquivalent: 2990, total: 2990 },
  { n: 4, name: '3 локации, Основа + Финансы, Персонал на 40 сотрудников', input: { locations: 3, finance: true, staff: 'people', employees: 40 }, monthly: 4117, monthlyEquivalent: 4117, total: 4117, team: 1000 },
  { n: 5, name: '2 локации, Всё включено, 130 сотрудников, за год', input: { locations: 2, bundle: true, employees: 130, billing: 'annual' }, monthly: 6730, monthlyEquivalent: 6057, total: 72684 },
  { n: 6, name: '1 локация, Основа + Академия на 20 сотрудников + 1 пакет Координатора', input: { locations: 1, staff: 'academy', employees: 20, coordBlocks: 1 }, monthly: 710, monthlyEquivalent: 710, total: 810 },
  { n: 7, name: '5 локаций, Основа + Гости 360 + Финансы, по 1 пакету Aura, за год', input: { locations: 5, guests: true, finance: true, auraBlocks: 1, billing: 'annual' }, monthly: 9195, monthlyEquivalent: 8275.5, total: 100056 },
];

for (const c of CONTROL) {
  test(`контрольный расчёт ${c.n} (AED): ${c.name}`, () => {
    const q = quoteFor(prices.en.commercial, c.input);
    assert.equal(cents(q.monthly), cents(c.monthly), 'в месяц');
    assert.equal(cents(q.monthlyEquivalent), cents(c.monthlyEquivalent), 'в месяц со скидкой');
    assert.equal(cents(q.total), cents(c.total), 'к оплате');
    if (c.team !== undefined) assert.equal(cents(q.team), cents(c.team), 'персонал');
  });
}

test('расчёт 7: годовой счёт 99 306 + Aura за один месяц 750', () => {
  const q = quoteFor(prices.en.commercial, CONTROL[6].input);
  assert.equal(cents(q.subscriptionDue), cents(99306));
  assert.equal(cents(q.topups), cents(750));
});

test('раскладка по строкам складывается в сумму в месяц плюс докупка AI', () => {
  for (const c of CONTROL) {
    const q = quoteFor(prices.en.commercial, c.input);
    const sum = lines(prices.en.commercial, q).reduce((s, l) => s + l.amount, 0);
    assert.equal(cents(sum), cents(q.monthly + q.topups), `расчёт ${c.n}`);
  }
});

test('ввод ограничен: 1–200 локаций, целые числа', () => {
  assert.equal(normalize({ locations: 0 }).locations, 1);
  assert.equal(normalize({ locations: 999 }).locations, 200);
  assert.equal(normalize({ locations: 2.7 }).locations, 2);
  assert.equal(normalize({ employees: -5 }).employees, 0);
  assert.equal(normalize({ staff: 'x' as never }).staff, 'none');
});

test('заявка получает выбор калькулятора кодами и точными суммами', () => {
  const q = quoteFor(prices.en.commercial, CONTROL[6].input);
  const lead = leadPayload(CONTROL[6].input, q, prices.en.version, 'AED', prices.en.segment);
  assert.equal(lead.model, 'v16');
  assert.equal(lead.segment, 'independent');
  assert.deepEqual(lead.modules, ['base', 'guests', 'finance']);
  assert.equal(lead.total, 100056);
  assert.equal(lead.monthly, 9195);
  assert.equal(lead.priceVersion, '2026-10-05');
});

test('подстановка {taxRate}: ставка версии из справочника, формат языка версии', async () => {
  const { vars, versionVars } = await import('../src/lib/pricing-text.ts');
  const nb = String.fromCharCode(0xa0);
  assert.equal(versionVars('ru').taxRate, `22${nb}%`);
  assert.equal(versionVars('en').taxRate, '5%');
  assert.equal(vars(prices.en.commercial, 'en', 'AED').taxRate, '5%');
});

// ───────────── РФ: сеть на блочной модели (решение владельца 12.10.2026) ─────────────

// Копия листа «Цены» (₽ за локацию в месяц без НДС, столбцы тарифов 2–10 / 11–25 / 26–100 / 101–200 / 201+; столбец «1» в РФ не используется).
const SHEET_RU: Record<string, number[]> = {
  base: [2190, 1590, 1150, 970, 970],
  guests: [16310, 14550, 13170, 12570, 12570],
  finance: [2470, 2470, 1840, 1600, 1600],
  loyalty: [1490, 1490, 930, 760, 760],
  staff: [7380, 3590, 1250, 820, 820],
};

test('РФ: справочник = лист «Цены» и «Параметры» таблицы блоков', () => {
  const ru = prices.ru;
  assert.equal(ru.model, 'blocks');
  assert.equal(ru.segment, 'chain');
  assert.equal(ru.currency, 'RUB');
  assert.equal(ru.taxRate, 0.22);
  assert.equal(ru.annualDiscount, 0.167);
  assert.equal(ru.uk.price, 29900);
  assert.deepEqual(ru.tiers.map((t: { from: number }) => t.from), [2, 11, 26, 101, 201], 'границы тарифов «от»');
  assert.deepEqual(ru.tiers.map((t: { key: string }) => t.key), ['2-10', '11-25', '26-100', '101-200', '201+']);
  assert.deepEqual(Object.fromEntries(ru.blocks.map((b: { key: string; prices: number[] }) => [b.key, b.prices])), SHEET_RU);
  assert.deepEqual(ru.blocks.filter((b: { default?: boolean }) => b.default).map((b: { key: string }) => b.key), ['base'], 'по умолчанию отмечена только Основа');
  assert.deepEqual(ru.locations, { min: 2, max: 200, start: 10 }, 'одной точке не продаём; до 200 локаций');
});

test('сегмент: сеть — блоки (РФ), своё заведение — v16 (ОАЭ); чужой тип модель версии не меняет', () => {
  assert.equal(modelFor('chain'), 'blocks');
  assert.equal(modelFor('independent'), 'v16');
  assert.equal(prices.en.segment, 'independent');
  assert.deepEqual(prices.en.locations, { min: 1, max: 9, start: 1 });
  assert.equal(segmentFor(prices.ru, 'chain'), 'chain');
  assert.equal(segmentFor(prices.ru, 'independent'), 'chain', 'старое значение independent на /ru/ — всё равно сеть');
  assert.equal(segmentFor(prices.en, 'chain'), 'independent');
  assert.equal(segmentFor(prices.en, undefined), 'independent');
  assert.ok(isSegment('chain') && !isSegment('x'));
});

test('РФ: тариф по числу локаций — как ПОИСКПОЗ по границам', () => {
  const at = (n: number) => prices.ru.tiers[tierIndex(prices.ru, n)].key;
  for (const [n, key] of [[2, '2-10'], [10, '2-10'], [11, '11-25'], [25, '11-25'], [26, '26-100'], [100, '26-100'], [101, '101-200'], [200, '101-200'], [201, '201+']] as const) {
    assert.equal(at(n), key, `${n} локаций`);
  }
});

// Контрольные наборы РФ: формулы листа «Калькулятор» (E8–E18): блок × локации по столбцу тарифа, УК за сеть, год × 12 × (1 − 16,7 %).
const CONTROL_BLOCKS: Array<{ n: number; name: string; input: Partial<BlocksInput>; tier: string; perLocation: number; monthly: number; monthlyEquivalent: number; yearly: number; total: number }> = [
  { n: 1, name: 'пример листа: 20 локаций, Основа + Лояльность, помесячно', input: { locations: 20, blocks: ['base', 'loyalty'] }, tier: '11-25', perLocation: 3080, monthly: 61600, monthlyEquivalent: 61600, yearly: 739200, total: 61600 },
  { n: 2, name: 'то же за год', input: { locations: 20, blocks: ['base', 'loyalty'], billing: 'annual' }, tier: '11-25', perLocation: 3080, monthly: 61600, monthlyEquivalent: 51312.8, yearly: 615753.6, total: 615753.6 },
  { n: 3, name: 'минимум: 2 локации, только Основа', input: { locations: 2, blocks: ['base'] }, tier: '2-10', perLocation: 2190, monthly: 4380, monthlyEquivalent: 4380, yearly: 52560, total: 4380 },
  { n: 4, name: '10 локаций, все блоки + УК', input: { locations: 10, blocks: ['base', 'guests', 'finance', 'loyalty', 'staff'], uk: true }, tier: '2-10', perLocation: 29840, monthly: 328300, monthlyEquivalent: 328300, yearly: 3939600, total: 328300 },
  { n: 5, name: '11 локаций, все блоки (граница тарифа)', input: { locations: 11, blocks: ['base', 'guests', 'finance', 'loyalty', 'staff'] }, tier: '11-25', perLocation: 23690, monthly: 260590, monthlyEquivalent: 260590, yearly: 3127080, total: 260590 },
  { n: 6, name: '100 локаций, Основа + Финансы + УК, за год', input: { locations: 100, blocks: ['base', 'finance'], uk: true, billing: 'annual' }, tier: '26-100', perLocation: 2990, monthly: 328900, monthlyEquivalent: 273973.7, yearly: 3287684.4, total: 3287684.4 },
  { n: 7, name: '200 локаций (максимум), Гости 360 + Сотрудники и Академия', input: { locations: 200, blocks: ['guests', 'staff'] }, tier: '101-200', perLocation: 13390, monthly: 2678000, monthlyEquivalent: 2678000, yearly: 32136000, total: 2678000 },
  { n: 8, name: 'только УК, без блоков', input: { locations: 5, blocks: [], uk: true }, tier: '2-10', perLocation: 0, monthly: 29900, monthlyEquivalent: 29900, yearly: 358800, total: 29900 },
];

for (const c of CONTROL_BLOCKS) {
  test(`контрольный набор РФ ${c.n}: ${c.name}`, () => {
    const q = quoteBlocks(prices.ru, c.input);
    assert.equal(q.tier.key, c.tier, 'тариф');
    assert.equal(cents(q.perLocation), cents(c.perLocation), 'за локацию');
    assert.equal(cents(q.monthly), cents(c.monthly), 'в месяц до скидки');
    assert.equal(cents(q.monthlyEquivalent), cents(c.monthlyEquivalent), 'в месяц как на экране');
    assert.equal(cents(q.yearly), cents(c.yearly), 'за год');
    assert.equal(cents(q.total), cents(c.total), 'к оплате');
    const sum = blocksLines(prices.ru, q).reduce((s, l) => s + l.amount, 0);
    assert.equal(cents(sum), cents(q.monthlyEquivalent), 'строки раскладки складываются в итог на экране');
  });
}

test('РФ: ввод ограничен 2–200 локациями, неизвестные блоки отбрасываются, по умолчанию — Основа на 10 локациях', () => {
  assert.equal(quoteBlocks(prices.ru, { locations: 1 }).locations, 2, 'одной точке не продаём');
  assert.equal(quoteBlocks(prices.ru, { locations: 500 }).locations, 200);
  assert.equal(quoteBlocks(prices.ru, { locations: 7.9 }).locations, 7);
  assert.deepEqual(quoteBlocks(prices.ru, { blocks: ['loyalty', 'x' as never, 'base'] }).blocks, ['base', 'loyalty'], 'порядок справочника');
  const d = quoteBlocks(prices.ru, defaultBlocksInput(prices.ru));
  assert.equal(d.locations, 10);
  assert.deepEqual(d.blocks, ['base']);
  assert.equal(cents(d.monthly), cents(21900));
});

test('РФ: заявка — формат, согласованный с C (coord.md 12.10 20:18)', () => {
  const q = quoteBlocks(prices.ru, { locations: 20, blocks: ['base', 'loyalty'], uk: true, billing: 'annual' });
  assert.deepEqual(blocksLeadPayload(prices.ru, q), {
    priceVersion: '2026-10-12',
    model: 'blocks',
    segment: 'chain',
    currency: 'RUB',
    locations: 20,
    tier: '11-25',
    blocks: ['base', 'loyalty', 'uk'],
    uk: true,
    billing: 'annual',
    monthly: 76219.5,
    total: 914634,
  });
});

test('словари: блоки РФ подписаны в ru и en, подстановки версии разрешаются', async () => {
  const { versionVars } = await import('../src/lib/pricing-text.ts');
  const nb = String.fromCharCode(0xa0);
  const ru = versionVars('ru');
  assert.equal(ru.annualDiscount, `16,7${nb}%`);
  assert.equal(ru.ukPrice, `29${nb}900${nb}₽`);
  assert.equal(ru.locationsMin, '2');
  assert.equal(ru.locationsMax, '200');
  assert.equal(versionVars('en').locationsMax, '9');
  for (const lang of ['ru', 'en'] as const) {
    const dict = JSON.parse(read(`src/content/${lang}/pricing.json`));
    for (const b of prices.ru.blocks) assert.equal(typeof dict.blocks?.items?.[b.key]?.name, 'string', `${lang}.blocks.items.${b.key}`);
    // Строки, которые рисует модель версии: blocks — группа blocks, условия, вводная и общие подписи оплаты; v16 — всё, кроме blocks.
    const model = prices[lang].model;
    const used = model === 'blocks' ? { blocks: dict.blocks, conditions: dict.conditions, lead: dict.lead, annualNote: dict.calc.annualNote, validFrom: dict.calc.validFrom } : { ...dict, blocks: undefined };
    // FAQ калькулятора больше нет на странице (Р-24): проверяются только строки калькулятора
    const vars = { ...versionVars(lang), tier: '' };
    const missing = [...JSON.stringify([used]).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !(k in vars));
    assert.deepEqual([...new Set(missing)], [], `${lang}: подстановки без значения`);
  }
});
