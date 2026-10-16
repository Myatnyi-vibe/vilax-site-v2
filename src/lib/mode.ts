// Режим сборки: local | preview | prod (см. astro.config.mjs).
export type SiteMode = 'local' | 'preview' | 'prod';

export const MODE = import.meta.env.VILAX_MODE as SiteMode;

/** Превью и локальная сборка закрыты от поисковиков. */
export const NOINDEX = MODE !== 'prod';
