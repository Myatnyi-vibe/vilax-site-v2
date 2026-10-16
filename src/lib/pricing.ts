// Модуль расчёта VilaxPricing — копия со страницы «VILAX — меню и пакеты · версия 16» (05.10.2026, скрипт после #bp-data).
// pricing-v16.js лежит байт в байт и не правится: формулы сайта и страницы продаж не должны разойтись.
// tests/pricing.test.ts сверяет отпечаток файла и семь контрольных расчётов ТЗ до цента.
import './pricing-v16.js';

/** Цены и лимиты в формате объекта commercial страницы v16. */
export interface Commercial {
  base: number;
  guests: number;
  finance: number;
  loyalty: number;
  academySeat: number;
  peopleSeat: number;
  peopleMinimum: number;
  bundle: number;
  bundleSeats: number;
  annualDiscount: number;
  auraIncluded: number;
  coordinatorIncluded: number;
  auraTopup: { units: number; price: number };
  coordinatorTopup: { units: number; price: number };
}

/** Одна локация в расчёте: что подключено и сколько пакетов докупки AI. */
export interface Venue {
  id?: string | number;
  name?: string;
  bundle?: boolean;
  guests?: boolean;
  finance?: boolean;
  loyalty?: boolean;
  people?: boolean;
  academy?: boolean;
  auraBlocks?: number;
  coordBlocks?: number;
}

export interface QuoteOptions {
  billing?: 'monthly' | 'annual';
  academyOnlyEmployees?: number;
}

export interface QuotedVenue {
  id?: string | number;
  name?: string;
  bundle: boolean;
  effective: { guests: boolean; finance: boolean; loyalty: boolean; people: boolean; academy: boolean };
  /** Подписи строк в модуле v16 — на русском; сайт показывает свои подписи из словаря. */
  items: Array<{ name: string; amount: number }>;
  price: number;
  auraBlocks: number;
  coordBlocks: number;
  topups: number;
}

export interface Quote {
  venues: QuotedVenue[];
  software: number;
  team: number;
  academy: number;
  total: number;
  monthly: number;
  monthlyEquivalent: number;
  subscriptionDue: number;
  annual: boolean;
  annualSaving: number;
  discountRate: number;
  topups: number;
  teamEnabled: boolean;
  academyEnabled: boolean;
  standaloneAcademy: boolean;
  academyOnlyEmployees: number;
  uniqueEmployees: number;
  bundleCount: number;
  includedEmployees: number;
  overageEmployees: number;
  coordinatorIncluded: number;
}

export interface Pricing {
  quote(locations: Venue[], employees: number, options?: QuoteOptions): Quote;
}

/** API модуля v16 без изменений: VilaxPricing.create(commercial).quote(locations, employees, options). */
export const VilaxPricing = (globalThis as unknown as { VilaxPricing: { create(c: Commercial): Pricing } }).VilaxPricing;
