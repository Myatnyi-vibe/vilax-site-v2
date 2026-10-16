// Строки каркаса (шапка, подвал, экран выбора, 404, подписи для экранных дикторов) — зона A.
// Тексты секций, FAQ, контакты и юрблок — словари B в src/content/{ru,en}; правовые тексты — C в src/content/{ru,en}/legal.
import ru from './ru.json';
import en from './en.json';

export type Lang = 'ru' | 'en';
export type UiDict = typeof ru;

const dicts: Record<Lang, UiDict> = { ru, en };

export function ui(lang: Lang): UiDict {
  return dicts[lang];
}

export const LANGS: Lang[] = ['ru', 'en'];
