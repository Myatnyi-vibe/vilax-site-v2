// Подстановки цифр из справочника цен в строки словаря: {base}, {auraIncluded}, {annualDiscount}, {taxRate}, {date}…
// Цифр в словарях нет — только здесь, из src/data/prices.json.
import type { Commercial } from './pricing.ts';
import { formatMoney, type Currency, type PriceVersion } from './pricing-calc.ts';
import prices from '../data/prices.json' with { type: 'json' };

export type Lang = 'ru' | 'en';
export type { Currency };

const NBSP = String.fromCharCode(0xa0);

export function formatCount(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 0 }).format(n).replace(/\s/g, NBSP);
}

export function formatPercent(rate: number, lang: Lang): string {
  const v = Math.round(rate * 1000) / 10;
  return lang === 'ru' ? `${String(v).replace('.', ',')}${NBSP}%` : `${v}%`;
}

export function formatPrice(amount: number, lang: Lang, currency: Currency): string {
  return formatMoney(amount, lang, currency).replace(/\s/g, NBSP);
}

/** Дата версии прайса: «5 октября 2026» / «5 October 2026». */
export function formatDate(iso: string, lang: Lang): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(d)
    .replace(/\s?г\.$/, '');
}

/** Ставка налога версии по валюте ({taxRate}: «22 %» / «5%»). Читается только внутри vars — в клиентский код справочник не попадает. */
function taxRateOf(currency: Currency): number | null {
  for (const p of Object.values(prices) as Array<{ currency?: string; taxRate?: number }>) {
    if (p && typeof p === 'object' && p.currency === currency && typeof p.taxRate === 'number') return p.taxRate;
  }
  return null;
}

const MONEY_KEYS = ['base', 'guests', 'finance', 'loyalty', 'academySeat', 'peopleSeat', 'peopleMinimum', 'bundle'] as const;

/** Значения подстановок для версии. */
export function vars(c: Commercial, lang: Lang, currency: Currency, version?: string | null): Record<string, string> {
  const v: Record<string, string> = {
    auraIncluded: formatCount(c.auraIncluded, lang),
    coordinatorIncluded: formatCount(c.coordinatorIncluded, lang),
    bundleSeats: formatCount(c.bundleSeats, lang),
    auraUnits: formatCount(c.auraTopup.units, lang),
    coordinatorUnits: formatCount(c.coordinatorTopup.units, lang),
    auraTopup: formatPrice(c.auraTopup.price, lang, currency),
    coordinatorTopup: formatPrice(c.coordinatorTopup.price, lang, currency),
    annualDiscount: formatPercent(c.annualDiscount, lang),
  };
  for (const k of MONEY_KEYS) v[k] = formatPrice(c[k], lang, currency);
  const tax = taxRateOf(currency);
  if (tax !== null) v.taxRate = formatPercent(tax, lang);
  if (version) v.date = formatDate(version, lang);
  return v;
}

/** Версия справочника цен для языка сайта (ru — сеть РФ, модель blocks; en — ОАЭ, модель v16). */
export function priceVersion(lang: Lang): PriceVersion {
  return (prices as unknown as Record<Lang, PriceVersion>)[lang];
}

/**
 * Подстановки версии для любой модели: v16 — всё из commercial (см. vars); blocks — {annualDiscount}, {ukPrice};
 * обеим — {locationsMin}, {locationsMax}, {taxRate}, {date}. Цены версии нет (showPrices=false) — только общие.
 */
export function versionVars(lang: Lang): Record<string, string> {
  const p = priceVersion(lang);
  const v: Record<string, string> =
    p.model === 'v16'
      ? p.commercial
        ? vars(p.commercial, lang, p.currency)
        : {}
      : { annualDiscount: formatPercent(p.annualDiscount, lang), ukPrice: formatPrice(p.uk.price, lang, p.currency) };
  v.locationsMin = formatCount(p.locations.min, lang);
  v.locationsMax = formatCount(p.locations.max, lang);
  v.taxRate = formatPercent(p.taxRate, lang);
  if (p.version) v.date = formatDate(p.version, lang);
  return v;
}

/** Подставляет {ключ}; неизвестный ключ оставляет как есть — тест словарей его поймает. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}
