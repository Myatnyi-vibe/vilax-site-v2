// Аналитика (Р-11, по умолчанию ТЗ): Яндекс Метрика на обеих версиях, только после согласия в плашке cookie, без Вебвизора.
// Выключатель — номер счётчика из окружения при сборке: PUBLIC_VILAX_YM_ID. Пустой или не число — ничего не грузится,
// плашки нет, на страницах ни одного запроса к mc.yandex.ru. Номер задаёт сборка превью/прода (зона C), в код не вшивается.

/** Номер счётчика, если он задан и похож на номер; иначе пустая строка. */
export function ymId(raw: string | undefined): string {
  const id = (raw ?? '').trim();
  return /^\d{4,12}$/.test(id) ? id : '';
}

export const YM_ID = ymId(import.meta.env?.PUBLIC_VILAX_YM_ID);
export const ANALYTICS_ON = YM_ID !== '';

/** Ключ решения посетителя в localStorage: 'granted' | 'denied'. */
export const CONSENT_KEY = 'vilax.consent';

/** Цели Метрики — одно место для событий сайта. */
export const GOALS = {
  version: 'version_choose', // выбор версии на экране выбора
  demo: 'demo_click', // нажатие «Запросить демо», параметр section
  leadOpen: 'lead_open', // форма открыта
  leadSent: 'lead_sent', // заявка принята приёмником
  calc: 'calc_use', // калькулятор пересчитан посетителем (раз за визит)
  pricing: 'pricing_view', // доскролл до цен (раз за визит)
} as const;

/** Настройки счётчика: без Вебвизора и карты кликов, ссылки и отказы — да. */
export const YM_INIT = {
  webvisor: false,
  clickmap: false,
  trackLinks: true,
  accurateTrackBounce: true,
} as const;
