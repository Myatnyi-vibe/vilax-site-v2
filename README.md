# vilax-site — сайт vilax.ai

Одна страница `/` с тремя независимыми переключателями: язык (RU · EN), валюта (₽ · AED) и тема (тёмная · светлая).
Дизайн — прототип Claude Design от 14.10.2026, перенесён один в один (SITE-20…24); описание — [DESIGN.md](DESIGN.md).
Выкладка — только по команде владельца: превью на GitHub Pages — [docs/deploy/preview.md](docs/deploy/preview.md), боевой vilax.ai — [docs/deploy/prod.md](docs/deploy/prod.md).

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер на 4321 (B — `npm run dev -- --port 4322`, C — `--port 4323`) |
| `npm run media` | собрать `src/data/media.json` из проверок снимков и роликов (сам запускается перед dev, сборкой и тестами) |
| `npm run check` | типы (`astro check`) → сборка `local` → тесты → проверка `dist/` |
| `npm run build:local` / `build:preview` / `build:prod` | сборка в режиме (см. ниже); preview и prod падают, если медиа не хватает |
| `npm test` | тесты `tests/**/*.test.ts` на встроенном `node:test` |
| `npm run lighthouse` | Lighthouse против бюджета ТЗ — только под HEAVY LOCK |

## Одна страница и три оси

- Оси живут на `<html>`: `lang`, `data-currency` (`rub` | `aed`), `data-theme` (`dark` | `light`). Их ставит маленький скрипт в `<head>` до первой отрисовки: параметры адреса `?lang=&cur=&theme=` → запомненный выбор (`localStorage` `vilax.prefs`) → по умолчанию (язык браузера → валюта от языка → тема от валюты).
- Тексты четырёх сочетаний «валюта × язык» — `src/content/site/{rub-ru,rub-en,aed-en,aed-ru}.json`; строки интерфейса по языку — `src/i18n/{ru,en}.json`. Разметка выводит все варианты (`src/components/T.astro`), видимый выбирает CSS (`.v` в `src/styles/site.css`) — без мигания и сдвига вёрстки.
- Старые адреса `/ru/`, `/en/`, `/ru/en/`, `/en/ru/` ведут на `/` с тем же сочетанием. Правовые страницы — прежние адреса: документы РФ — `/ru/…`, ОАЭ — в корне.
- Медиа (снимки и ролик обложки) — строго своего сочетания, контракт — [docs/media-contract.md](docs/media-contract.md).

## Режимы сборки

`VILAX_MODE` = `local` (по умолчанию) · `preview` · `prod`. В коде — `src/lib/mode.ts` (`MODE`, `NOINDEX`).
Режим задаёт адрес приёмника заявок, плашку режима и строгость медиа (заглушки — только в `local`).

## Где что лежит

| Путь | Что | Владелец |
|---|---|---|
| `src/pages/`, `src/layouts/`, `src/components/`, `src/styles/`, `src/scripts/`, `src/scenes/` | страницы, каркас, секции, скрипт страницы, 3D (`vilax3d.js`) | A |
| `src/content/site/`, `src/i18n/` | тексты сочетаний и интерфейса | A |
| `src/content/{ru,en}/legal/` | правовые тексты и версии согласия | A |
| `src/lib/lead.ts` | форма заявки → приёмник SITE-15 | A |
| `public/shots/**`, `src/data/shots-checks.json` | снимки демо по сочетаниям | B |
| `public/video/**`, `src/data/video-checks.json` | ролики обложки по сочетаниям | C |
| `src/data/prices.json`, `src/lib/pricing*`, `src/components/calculator/` | цены и калькулятор — на странице не выводятся (Р-24) | — |

Правила:

- В разметке нет видимых строк — только из словарей (`tests/templates.test.ts` ловит кириллицу в `.astro`).
- У четырёх сочетаний одинаковые ключи; в `rub-en` и `aed-en` нет кириллицы (`tests/dictionaries.test.ts`).
- В английских документах (`/privacy`, `/terms`, `/support`, `/en/…`) нет ни одной русской буквы (`scripts/verify-dist.mjs`).
- Фиолетового нет (канон с 29.09.2026): `#7B5CFF` в сборке — ошибка.

## Бренд

- `public/logo.svg`, `public/wordmark.svg` — знак и надпись VILAX, градиент Data Cyan → Signal Blue. Контуры для встраивания — `src/components/brand/logo-paths.ts`.
- Шрифты — `public/fonts/`: Inter (латиница и кириллица) и JetBrains Mono (цифры), SIL OFL 1.1.
- `public/google1e0ecdafaa681c29.html` — подтверждение Google Search Console, переносится как есть.
