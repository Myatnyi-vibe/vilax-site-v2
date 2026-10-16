// Общее для скриптов страницы: оси сочетания, данные страницы (#vlx-data), коды медиа, прокрутка к якорю.
export type Lang = 'ru' | 'en';
export type Cur = 'rub' | 'aed';
export type Theme = 'dark' | 'light';
export type Axes = { lang: Lang; cur: Cur; theme: Theme };

type UiBits = {
  themeToLight: string; themeToDark: string; menuOpen: string; menuClose: string;
  video: { pause: string; play: string }; shotAlt: string; send: Record<string, string>;
};
export type PageData = {
  key: string;
  page: 'home' | 'legal' | '404';
  fixCur: Cur | null;
  media: { base: string; shots: Record<Cur, Record<string, string>>; app: Record<Cur, Record<string, string>>; video: Record<string, string> };
  meta: { titles: Record<Lang, string>; descriptions: Record<Lang, string> };
  ui: Record<Lang, UiBits>;
  lead: Record<string, { err: Record<string, string>; phonePh: string; doneTitle: string; doneText: string }>;
};

const SLOTS = ['ru-dark', 'ru-light', 'en-dark', 'en-light'];
/** Код медиа-варианта: '1' — файл, 'p' — заглушка разработки, '0' — нет (Р-22: без снимка / без ролика). */
export function shotCode(D: PageData, a: Axes, id: string): string {
  if (!id) return '0';
  const s = D.media.shots[a.cur]?.[id];
  return s ? s[SLOTS.indexOf(`${a.lang}-${a.theme}`)] ?? '0' : '0';
}
export const shotUrl = (D: PageData, a: Axes, id: string) => `${D.media.base}shots/${a.cur}/${a.lang}/${a.theme}/${id}.webp`;
/** Кадр приложения (SITE-55) своего сочетания есть — для «Блоков платформы» на телефоне. */
export const hasApp = (D: PageData, a: Axes, id: string) => !!id && D.media.app?.[a.cur]?.[id]?.[SLOTS.indexOf(`${a.lang}-${a.theme}`)] === '1';
export const appUrl = (D: PageData, a: Axes, id: string) => `${D.media.base}shots-app/${a.cur}/${a.lang}/${a.theme}/${id}.webp`;

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const listeners: Array<(a: Axes, changed: keyof Axes | null) => void> = [];
export const onAxes = (fn: (a: Axes, changed: keyof Axes | null) => void) => listeners.push(fn);

const html = document.documentElement;
export function axes(): Axes {
  return {
    lang: html.lang === 'en' ? 'en' : 'ru',
    cur: html.dataset.currency === 'aed' ? 'aed' : 'rub',
    theme: html.dataset.theme === 'light' ? 'light' : 'dark',
  };
}


export function scrollToId(id: string, instant = false) {
  const el = document.getElementById(id);
  if (!el) return;
  scrollTo({ top: el.getBoundingClientRect().top + scrollY - 56, behavior: reduced || instant ? 'auto' : 'smooth' });
}

