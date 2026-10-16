// Правовые тексты лежат в src/content/{ru,en}/legal/*.html (владелец — сессия C).
// Здесь только загрузка: страницы /privacy, /terms, /support и /ru/-версии отдают их по прежним адресам.
import type { Lang } from './site';
import { BASE } from './site';

export type LegalDoc = 'privacy' | 'terms' | 'support' | 'consent';

const files = import.meta.glob('../content/*/legal/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function legalHtml(lang: Lang, doc: LegalDoc): string {
  const raw = files[`../content/${lang}/legal/${doc}.html`];
  if (!raw) throw new Error(`Нет правового текста: src/content/${lang}/legal/${doc}.html`);
  // служебный комментарий об источнике в страницу не выводим
  // ссылки от корня (href="/privacy") — с подпутём сборки, как у остальных страниц
  return raw.replace(/^\s*<!--[\s\S]*?-->\s*/, '').replaceAll('href="/', `href="${BASE}/`);
}
