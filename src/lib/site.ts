// Адреса, оси сайта (язык × валюта × тема) и карта тонов — одно место для каркаса, страниц и скриптов.
// Сайт — одна страница «/» с тремя независимыми переключателями (ТЗ медиа 14.10.2026, Р-25).
import type { LegalDoc } from './legal';

export type Lang = 'ru' | 'en';
export type Cur = 'rub' | 'aed';
export type Theme = 'dark' | 'light';

export const LANGS: Lang[] = ['ru', 'en'];
export const CURS: Cur[] = ['rub', 'aed'];
export const THEMES: Theme[] = ['dark', 'light'];

/** Четыре набора текстов: валюта × язык. rub = «регион ru» прототипа, aed = «регион en». */
export const VARIANTS = [
  { cur: 'rub', lang: 'ru' },
  { cur: 'rub', lang: 'en' },
  { cur: 'aed', lang: 'en' },
  { cur: 'aed', lang: 'ru' },
] as const satisfies readonly { cur: Cur; lang: Lang }[];
export type Variant = (typeof VARIANTS)[number];
export const variantKey = (v: { cur: Cur; lang: Lang }) => `${v.cur}-${v.lang}` as const;

/** Первый визит: язык — по браузеру, валюта — от языка, тема — от валюты (правило дизайна). */
export const DEFAULT_CUR: Record<Lang, Cur> = { ru: 'rub', en: 'aed' };
export const DEFAULT_THEME: Record<Cur, Theme> = { rub: 'dark', aed: 'light' };
/** Ручной выбор: localStorage[PREFS_KEY] = {lang, cur, theme}; параметры адреса ?lang=&cur=&theme= важнее. */
export const PREFS_KEY = 'vilax.prefs';

/** Подпуть сборки (base в astro.config): '' на vilax.ai, '/vilax-site' на превью в GitHub Pages. */
export const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/+$/, '');
/** Адрес от корня сайта с учётом подпути: url('/privacy') → '/vilax-site/privacy' на превью. */
export function url(path: string): string {
  return path.startsWith('/') ? BASE + path : path;
}
/** Хост сборки без пути: https://vilax.ai или хост превью. */
export const SITE_URL = (import.meta.env?.SITE ?? 'https://vilax.ai').replace(/\/+$/, '');
export const APP_URL = 'https://app.vilax.ai';
export const SUPPORT_EMAIL = 'support@vilax.ai';

/** Якоря меню: Платформа · Цены · Подключение · Вопросы. */
export const NAV_SECTIONS = ['platform', 'pricing', 'onboarding', 'faq'] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

export const LEGAL_DOCS: LegalDoc[] = ['privacy', 'terms', 'support', 'consent'];
/** Правовые документы — по валюте: ₽ — документы РФ (/ru/…), AED — документы ОАЭ (английские, в корне). */
export const LEGAL_LANG: Record<Cur, Lang> = { rub: 'ru', aed: 'en' };

/** Адрес правовой страницы на языке документа: английские — в корне, русские — под /ru/; согласие — /ru|en/consent. */
export function legalPath(lang: Lang, doc: LegalDoc): string {
  if (doc === 'consent') return url(`/${lang}/consent`);
  return url(lang === 'ru' ? `/ru/${doc}` : `/${doc}`);
}

/**
 * Тона листов (README handoff, «Карта тонов»): в тёмной теме — только тёмные тона, в светлой — только светлые.
 * Элемент несёт оба имени: data-td (тёмная) и data-tl (светлая); переменные включает тема на <html>.
 */
export const TONES = {
  base: ['navy0', 'paper'],
  hero: ['navy0', 'paper'],
  fusion: ['navy1', 'white'],
  platform: ['navy3', 'ice'],
  blocks: ['navy0', 'mist'],
  onboarding: ['navy1', 'paper'],
  pricing: ['navyB', 'white'],
  form: ['navy0', 'ice'],
  faq: ['navy0', 'ice'],
  cta: ['navy2', 'white'],
  footer: ['navy0', 'mist'],
  fab: ['navy0', 'paper'],
} as const;
export type ToneSlot = keyof typeof TONES;
/** Атрибуты тона для разметки: <section {...tone('hero')}>. */
export const tone = (slot: ToneSlot) => ({ 'data-td': TONES[slot][0], 'data-tl': TONES[slot][1] });
