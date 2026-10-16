// Медиа-слой (SITE-25): что есть для каждого сочетания «валюта × язык × тема». Источник — src/data/media.json,
// его собирает scripts/media.mjs из проверок сессий B и C (контракт docs/media-contract.md).
// Правило: снимок и ролик — строго своего сочетания; нет или «не прошёл» — без снимка / без ролика (Р-22).
import media from '../data/media.json';
import { url, type Cur, type Lang, type Theme } from './site';

type Entry = { src?: string | null; placeholder?: boolean; webm?: string; mp4?: string; webp?: string; avif?: string };
type Media = {
  mode: string;
  shots: Record<Cur, Record<string, Partial<Record<`${Lang}-${Theme}`, Entry>>>>;
  app?: Record<Cur, Record<string, Partial<Record<`${Lang}-${Theme}`, Entry>>>>;
  video: Record<string, Partial<Record<'16x9' | '9x16', Entry>>>;
};
const M = media as unknown as Media;

/** Код варианта: '1' — файл есть, 'p' — заглушка разработки (только local), '0' — нет (не прошёл проверку). */
const code = (e: Entry | undefined) => (!e ? '0' : e.placeholder ? 'p' : '1');
export const SLOTS = ['ru-dark', 'ru-light', 'en-dark', 'en-light'] as const;

/** Карта для скрипта страницы: shots[cur][id] = 4 знака по SLOTS, app[cur][id] — то же для кадров приложения
 * (SITE-55, только экраны, у которых есть хоть один кадр), video[cur-lang-theme] = 2 знака (16x9, 9x16). */
export function mediaMap() {
  const shots: Record<string, Record<string, string>> = {};
  for (const cur of Object.keys(M.shots) as Cur[]) {
    shots[cur] = {};
    for (const [id, vs] of Object.entries(M.shots[cur])) shots[cur][id] = SLOTS.map((s) => code(vs[s])).join('');
  }
  const app: Record<string, Record<string, string>> = {};
  for (const cur of Object.keys(M.app ?? {}) as Cur[]) {
    app[cur] = {};
    for (const [id, vs] of Object.entries(M.app![cur])) app[cur][id] = SLOTS.map((s) => code(vs[s])).join('');
  }
  const video: Record<string, string> = {};
  for (const [combo, fm] of Object.entries(M.video)) video[combo] = code(fm['16x9']) + code(fm['9x16']);
  return { base: url('/'), shots, app, video };
}

/** Есть ли снимок (или заглушка) у экрана в сочетании. */
export function hasShot(cur: Cur, lang: Lang, theme: Theme, id: string): boolean {
  return !!id && code(M.shots[cur]?.[id]?.[`${lang}-${theme}`]) !== '0';
}

export const shotSrc = (cur: Cur, lang: Lang, theme: Theme, id: string) => url(`/shots/${cur}/${lang}/${theme}/${id}.webp`);
export const videoBase = (cur: Cur, lang: Lang, theme: Theme, fmt: '16x9' | '9x16') => url(`/video/hero-${cur}-${lang}-${theme}-${fmt}`);
