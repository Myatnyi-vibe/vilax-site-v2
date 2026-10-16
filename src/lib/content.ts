// Тексты сайта: четыре набора «валюта × язык» (src/content/site/*.json, перенесены из прототипа content.js
// с решениями владельца 13.10.2026) и строки интерфейса по языку (src/i18n/*.json).
import rubRu from '../content/site/rub-ru.json';
import rubEn from '../content/site/rub-en.json';
import aedEn from '../content/site/aed-en.json';
import aedRu from '../content/site/aed-ru.json';
import { ui, type UiDict } from '../i18n';
import { VARIANTS, LANGS, variantKey, type Cur, type Lang } from './site';

export type SiteDict = typeof rubRu;
export type Block = SiteDict['blocks'][number];
export type Feature = Block['features'][number];

const SITE: Record<`${Cur}-${Lang}`, SiteDict> = { 'rub-ru': rubRu, 'rub-en': rubEn, 'aed-en': aedEn, 'aed-ru': aedRu };

export const siteOf = (v: { cur: Cur; lang: Lang }): SiteDict => SITE[variantKey(v)];

export type Pick = (s: SiteDict, u: UiDict, v: { cur: Cur; lang: Lang }) => string;

/**
 * Значение строки во всех четырёх сочетаниях, сжатое до минимума: одно на всё, по языку или по сочетанию.
 * Разметка рисует столько вариантов, сколько реально разных (компонент T, атрибуты va()).
 */
export function variants(get: Pick):
  | { kind: 'one'; value: string }
  | { kind: 'lang'; items: { lang: Lang; value: string }[] }
  | { kind: 'all'; items: { cur: Cur; lang: Lang; value: string }[] } {
  const all = VARIANTS.map((v) => ({ cur: v.cur, lang: v.lang, value: get(siteOf(v), ui(v.lang), v) }));
  if (all.every((x) => x.value === all[0].value)) return { kind: 'one', value: all[0].value };
  const byLang = LANGS.map((lang) => all.filter((x) => x.lang === lang));
  if (byLang.every((xs) => xs.every((x) => x.value === xs[0].value))) {
    return { kind: 'lang', items: LANGS.map((lang, i) => ({ lang, value: byLang[i][0].value })) };
  }
  return { kind: 'all', items: all };
}

/**
 * Атрибут, зависящий от сочетания: значение для сборки (₽ · RU) + копии data-<attr>-<cur>-<lang>, которые
 * скрипт страницы подставляет при смене языка или валюты (src/scripts/app.ts, applyVariantAttrs).
 */
export function va(attr: string, get: Pick): Record<string, string> {
  const out: Record<string, string> = { [attr]: get(siteOf(VARIANTS[0]), ui('ru'), VARIANTS[0]) };
  const vs = variants(get);
  if (vs.kind === 'one') return out;
  out['data-va'] = attr;
  for (const v of VARIANTS) out[`data-va-${attr}-${v.cur}-${v.lang}`] = get(siteOf(v), ui(v.lang), v);
  return out;
}

/** Подстановка {name} в шаблон строки. */
export const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
