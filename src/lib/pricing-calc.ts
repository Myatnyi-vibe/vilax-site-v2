// Калькулятор сайта: модель цены задаёт версия сайта (src/data/prices.json, поле model), а выбирает её тип бизнеса.
// «Своё заведение» (independent, ОАЭ, 1–9) — модель v16: выбор посетителя переводится в вызов VilaxPricing.quote и обратно
// в строки показа, своих формул нет. «Сеть» (chain, РФ, 2–200) — модель blocks: цена блоков за локацию по тарифу сети
// (одинакова для всех точек) × число локаций + УК за всю сеть, скидка за год — как лист «Калькулятор» таблицы цен РФ.
// Округление до целых — только при показе (Р-5); в расчёте и в заявке суммы точные.
import { VilaxPricing, type Commercial, type Quote } from './pricing.ts';

export type StaffMode = 'none' | 'academy' | 'people';
export type Billing = 'monthly' | 'annual';
export type Currency = 'RUB' | 'AED';

/** Тип бизнеса (контракт сегмента A: window.__vilaxSegment и data-segment на <html>). */
export type Segment = 'independent' | 'chain';
export const isSegment = (v: unknown): v is Segment => v === 'independent' || v === 'chain';

/** Модель цены: v16 — объект commercial страницы продаж v16; blocks — блоки за локацию по тарифу сети + УК. */
export type PriceModel = 'v16' | 'blocks';

/** Решение 12.10: сеть считается блоками (РФ), своё заведение — моделью v16 (ОАЭ). */
export function modelFor(segment: Segment): PriceModel {
  return segment === 'chain' ? 'blocks' : 'v16';
}

/** Границы и старт поля «локаций» версии. */
export interface LocationLimits {
  min: number;
  max: number;
  start: number;
}

interface VersionBase {
  segment: Segment;
  currency: Currency;
  locale: string;
  taxRate: number;
  taxLabel: string;
  showPrices: boolean;
  version: string | null;
  versionLabel: string;
  source: string;
  locations: LocationLimits;
}

export interface V16Version extends VersionBase {
  model: 'v16';
  commercial: Commercial | null;
}

export type BlockKey = 'base' | 'guests' | 'finance' | 'loyalty' | 'staff';
export interface Tier {
  key: string;
  from: number;
  to: number | null;
}
export interface BlockPrice {
  key: BlockKey;
  /** Цена за локацию в месяц по каждому тарифу (в порядке tiers). */
  prices: number[];
  /** Отмечен в калькуляторе по умолчанию. */
  default?: boolean;
  earlyAccess?: boolean;
}

export interface BlocksVersion extends VersionBase {
  model: 'blocks';
  annualDiscount: number;
  tiers: Tier[];
  blocks: BlockPrice[];
  /** УК — биллинг партнёров: флат за всю сеть в месяц, не за локацию. */
  uk: { price: number };
}

export type PriceVersion = V16Version | BlocksVersion;

/**
 * Сегмент для расчёта. Тип бизнеса задан регионом (12.10: ru — сеть, en — своё заведение), версия продаёт один тип.
 * Значение из контракта A, которого версия не продаёт (например, старое в localStorage), модель не меняет.
 */
export function segmentFor(p: Pick<VersionBase, 'segment'>, wanted: unknown): Segment {
  return isSegment(wanted) && wanted === p.segment ? wanted : p.segment;
}

const int = (v: unknown, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/* ───────────────────────── Модель v16 (ОАЭ) ───────────────────────── */

/** Выбор в калькуляторе v16: состав одинаков для всех локаций (ТЗ, «Калькулятор»). */
export interface CalcInput {
  locations: number;
  guests: boolean;
  finance: boolean;
  loyalty: boolean;
  /** «Всё включено» — галочки дополнений не нужны. */
  bundle: boolean;
  staff: StaffMode;
  employees: number;
  billing: Billing;
  /** Пакеты докупки AI на локацию — в «Дополнительно». */
  auraBlocks: number;
  coordBlocks: number;
}

/** Пределы ввода модуля; поле локаций на странице уже — по версии (prices.json → locations). */
export const LIMITS = { locationsMin: 1, locationsMax: 200, employeesMax: 20000, blocksMax: 20 } as const;

export const DEFAULT_INPUT: CalcInput = {
  locations: 1,
  guests: false,
  finance: false,
  loyalty: false,
  bundle: false,
  staff: 'none',
  employees: 0,
  billing: 'monthly',
  auraBlocks: 0,
  coordBlocks: 0,
};

/** Приводит ввод к допустимому: 1–200 локаций, целые неотрицательные числа. */
export function normalize(input: Partial<CalcInput>): CalcInput {
  const i = { ...DEFAULT_INPUT, ...input };
  return {
    locations: int(i.locations, LIMITS.locationsMin, LIMITS.locationsMax),
    guests: !!i.guests,
    finance: !!i.finance,
    loyalty: !!i.loyalty,
    bundle: !!i.bundle,
    staff: i.staff === 'academy' || i.staff === 'people' ? i.staff : 'none',
    employees: int(i.employees, 0, LIMITS.employeesMax),
    billing: i.billing === 'annual' ? 'annual' : 'monthly',
    auraBlocks: int(i.auraBlocks, 0, LIMITS.blocksMax),
    coordBlocks: int(i.coordBlocks, 0, LIMITS.blocksMax),
  };
}

/** Расчёт модулем v16. Сотрудники считаются, когда выбран режим сотрудников или «Всё включено» (лимит 50 HR на локацию). */
export function quoteFor(c: Commercial, raw: Partial<CalcInput>): Quote {
  const i = normalize(raw);
  const venue = {
    bundle: i.bundle,
    guests: i.guests,
    finance: i.finance,
    loyalty: i.loyalty,
    people: i.staff === 'people',
    academy: i.staff === 'academy',
    auraBlocks: i.auraBlocks,
    coordBlocks: i.coordBlocks,
  };
  const locations = Array.from({ length: i.locations }, (_, k) => ({ id: k + 1, ...venue }));
  const employees = i.staff === 'none' && !i.bundle ? 0 : i.employees;
  return VilaxPricing.create(c).quote(locations, employees, { billing: i.billing });
}

/** Строка раскладки для показа: ключ подписи в словаре и сумма в месяц. */
export interface Line {
  key: 'base' | 'bundle' | 'guests' | 'finance' | 'loyalty' | 'people' | 'academy' | 'aura' | 'coordinator';
  amount: number;
}

/** Раскладка по строкам в месяц до скидки за год; докупка AI — отдельными строками «в месяц, сверх подписки» (Р-5). */
export function lines(c: Commercial, q: Quote): Line[] {
  const n = q.venues.length;
  const v = q.venues[0];
  if (!v) return [];
  const out: Line[] = [];
  if (v.bundle) out.push({ key: 'bundle', amount: c.bundle * n });
  else {
    out.push({ key: 'base', amount: c.base * n });
    if (v.effective.guests) out.push({ key: 'guests', amount: c.guests * n });
    if (v.effective.finance) out.push({ key: 'finance', amount: c.finance * n });
    if (v.effective.loyalty) out.push({ key: 'loyalty', amount: c.loyalty * n });
  }
  if (q.team) out.push({ key: 'people', amount: q.team });
  if (q.academy) out.push({ key: 'academy', amount: q.academy });
  const aura = q.venues.reduce((s, x) => s + x.auraBlocks, 0) * c.auraTopup.price;
  const coord = q.venues.reduce((s, x) => s + x.coordBlocks, 0) * c.coordinatorTopup.price;
  if (aura) out.push({ key: 'aura', amount: aura });
  if (coord) out.push({ key: 'coordinator', amount: coord });
  return out.map((l) => ({ ...l, amount: cents(l.amount) }));
}

/* ───────────────────────── Модель blocks (РФ) ───────────────────────── */

/** Выбор в калькуляторе сети: число локаций, блоки (одинаковы для всех точек), УК, оплата. */
export interface BlocksInput {
  locations: number;
  blocks: BlockKey[];
  uk: boolean;
  billing: Billing;
}

export function defaultBlocksInput(p: BlocksVersion): BlocksInput {
  return { locations: p.locations.start, blocks: p.blocks.filter((b) => b.default).map((b) => b.key), uk: false, billing: 'monthly' };
}

/** Приводит ввод к допустимому: локации в границах версии (РФ 2–200), только известные блоки в порядке справочника. */
export function normalizeBlocks(p: BlocksVersion, raw: Partial<BlocksInput>): BlocksInput {
  const d = defaultBlocksInput(p);
  const want: unknown[] = Array.isArray(raw.blocks) ? raw.blocks : d.blocks;
  return {
    locations: int(raw.locations ?? d.locations, p.locations.min, p.locations.max),
    blocks: p.blocks.map((b) => b.key).filter((k) => want.includes(k)),
    uk: !!raw.uk,
    billing: raw.billing === 'annual' ? 'annual' : 'monthly',
  };
}

/** Тариф сети по числу локаций: последняя ступень, чья нижняя граница ≤ n (как ПОИСКПОЗ(n; границы; 1) в таблице). */
export function tierIndex(p: Pick<BlocksVersion, 'tiers'>, n: number): number {
  let k = 0;
  p.tiers.forEach((t, i) => {
    if (n >= t.from) k = i;
  });
  return k;
}

export interface BlocksQuote {
  locations: number;
  tier: Tier;
  tierIndex: number;
  blocks: BlockKey[];
  uk: boolean;
  /** Сумма выбранных блоков за одну локацию по тарифу сети, до скидки. */
  perLocation: number;
  /** То же с учётом скидки за год. */
  perLocationEquivalent: number;
  /** Блоки по всей сети: локации × perLocation. */
  software: number;
  ukPrice: number;
  /** Итого в месяц до скидки. */
  monthly: number;
  annual: boolean;
  discountRate: number;
  /** Итого в месяц с учётом скидки за год — то, что показано крупно. */
  monthlyEquivalent: number;
  /** За 12 месяцев: при годовой — к оплате за год со скидкой, при помесячной — 12 × месяц. */
  yearly: number;
  annualSaving: number;
  /** К оплате: за месяц или за год. */
  total: number;
}

/** Итог = локации × сумма выбранных блоков по тарифу + УК; за год — × 12 × (1 − скидка) (лист «Калькулятор», E15–E17). */
export function quoteBlocks(p: BlocksVersion, raw: Partial<BlocksInput>): BlocksQuote {
  const i = normalizeBlocks(p, raw);
  const k = tierIndex(p, i.locations);
  const perLocation = p.blocks.filter((b) => i.blocks.includes(b.key)).reduce((s, b) => s + b.prices[k], 0);
  const software = perLocation * i.locations;
  const ukPrice = i.uk ? p.uk.price : 0;
  const monthly = software + ukPrice;
  const annual = i.billing === 'annual';
  const discountRate = annual ? p.annualDiscount : 0;
  const yearly = cents(monthly * 12 * (1 - discountRate));
  return {
    locations: i.locations,
    tier: p.tiers[k],
    tierIndex: k,
    blocks: i.blocks,
    uk: i.uk,
    perLocation,
    perLocationEquivalent: cents(perLocation * (1 - discountRate)),
    software,
    ukPrice,
    monthly,
    annual,
    discountRate,
    monthlyEquivalent: cents(monthly * (1 - discountRate)),
    yearly,
    annualSaving: cents(monthly * 12 - yearly),
    total: annual ? yearly : monthly,
  };
}

export interface BlocksLine {
  key: BlockKey | 'uk' | 'discount';
  /** Цена за локацию по тарифу (для блоков), иначе null. */
  perLocation: number | null;
  amount: number;
}

/** Раскладка в месяц: блоки по сети, УК, при годовой — строка скидки; сумма строк = итог в месяц на экране. */
export function blocksLines(p: BlocksVersion, q: BlocksQuote): BlocksLine[] {
  const out: BlocksLine[] = p.blocks
    .filter((b) => q.blocks.includes(b.key))
    .map((b) => ({ key: b.key, perLocation: b.prices[q.tierIndex], amount: b.prices[q.tierIndex] * q.locations }));
  if (q.uk) out.push({ key: 'uk', perLocation: null, amount: q.ukPrice });
  if (q.annual && q.monthlyEquivalent !== q.monthly) out.push({ key: 'discount', perLocation: null, amount: cents(q.monthlyEquivalent - q.monthly) });
  return out;
}

/* ───────────────────────── Показ и заявка ───────────────────────── */

/** Округление до целых — только при показе (Р-5); в расчёте и в заявке суммы точные. */
export function formatMoney(amount: number, lang: 'ru' | 'en', currency: Currency): string {
  const whole = Math.round(amount);
  if (lang === 'ru') return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(whole)} ${currency === 'RUB' ? '₽' : currency}`;
  return `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(whole)}`;
}

/**
 * Выбор в калькуляторе v16 для заявки (data-demo-calc → detail.calc события vilax:demo).
 * Только коды из справочника и числа — без текста посетителя. Имена согласованы с C (src/lib/lead.ts, coord.md 12.10 20:18).
 */
export interface CalcLead {
  priceVersion: string;
  model: 'v16';
  segment: Segment;
  currency: Currency;
  locations: number;
  modules: Array<'base' | 'guests' | 'finance' | 'loyalty' | 'bundle'>;
  staff: StaffMode;
  employees: number;
  billing: Billing;
  auraBlocks: number;
  coordBlocks: number;
  monthly: number;
  total: number;
}

export function leadPayload(raw: Partial<CalcInput>, q: Quote, priceVersion: string, currency: Currency, segment: Segment = 'independent'): CalcLead {
  const i = normalize(raw);
  const modules: CalcLead['modules'] = i.bundle
    ? ['bundle']
    : ['base', ...(['guests', 'finance', 'loyalty'] as const).filter((k) => i[k])];
  return {
    priceVersion,
    model: 'v16',
    segment,
    currency,
    locations: i.locations,
    modules,
    staff: i.bundle && i.staff === 'none' ? 'people' : i.staff,
    employees: i.staff === 'none' && !i.bundle ? 0 : i.employees,
    billing: i.billing,
    auraBlocks: i.auraBlocks,
    coordBlocks: i.coordBlocks,
    monthly: cents(q.monthly),
    total: cents(q.total),
  };
}

/**
 * Выбор в калькуляторе сети для заявки. blocks — выбранные блоки и 'uk', если выбрана УК (и флаг uk);
 * monthly — итог в месяц как на экране (при годовой — уже со скидкой), total — к оплате за месяц или за год.
 */
export interface BlocksLead {
  priceVersion: string;
  model: 'blocks';
  segment: Segment;
  currency: Currency;
  locations: number;
  tier: string;
  blocks: Array<BlockKey | 'uk'>;
  uk: boolean;
  billing: Billing;
  monthly: number;
  total: number;
}

export function blocksLeadPayload(p: BlocksVersion, q: BlocksQuote): BlocksLead {
  return {
    priceVersion: p.version ?? '',
    model: 'blocks',
    segment: p.segment,
    currency: p.currency,
    locations: q.locations,
    tier: q.tier.key,
    blocks: [...q.blocks, ...(q.uk ? (['uk'] as const) : [])],
    uk: q.uk,
    billing: q.annual ? 'annual' : 'monthly',
    monthly: q.monthlyEquivalent,
    total: q.total,
  };
}
