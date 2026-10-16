# Контракт медиа сайта (SITE-25)

Снимки экранов и ролик обложки показываются строго для своего сочетания **валюта × язык × тема**. Подмена чужим вариантом запрещена: вариант, который не прошёл проверку, на сайте не показывается (функция идёт без снимка, Р-22).

Владельцы: сессия B — `public/shots/**` и `src/data/shots-checks.json`; сессия C — `public/video/**` и `src/data/video-checks.json`; всё остальное, включая этот файл, `src/data/media-required.json` и `scripts/media.mjs`, — сессия A. Меняет контракт только A, с записью в журнал координации.

## Оси

| Ось | Значения | На сайте |
| --- | --- | --- |
| валюта `cur` | `rub` · `aed` | `<html data-currency>` |
| язык `lang` | `ru` · `en` | `<html lang>` |
| тема `theme` | `dark` · `light` | `<html data-theme>` |

Какие экраны нужны каждой валюте — `src/data/media-required.json` (24 экрана `rub`, 22 экрана `aed`). Каждый экран нужен в 4 вариантах своей валюты, ролик — в 8 сочетаниях и 2 форматах.

## Файлы

- Снимок: `public/shots/{cur}/{lang}/{theme}/{id}.webp` — webp ровно 1600 × 800 (2:1).
- Ролик: `public/video/hero-{cur}-{lang}-{theme}-{fmt}.{ext}`, где `fmt` = `16x9` (1600 × 900) | `9x16` (720 × 1280), `ext` = `webm` · `mp4` (ролик) · `webp` · `avif` (кадр-обложка, первый кадр ролика). 64 файла.
- Бюджет: ролик 16:9 ≤ 4 МБ, 9:16 ≤ 2,5 МБ (каждый из webm и mp4), кадр-обложка ≤ 120 КБ.
- Старые `public/shots/{ru,en}/*.webp` и `public/video/hero-{ru,en}-*` удаляются после приёмки — их удаляют B и C в своих ветках.

## `src/data/shots-checks.json` (пишет B)

```json
{
  "version": 1,
  "generatedAt": "2026-10-15T10:00:00Z",
  "shots": [
    {
      "cur": "rub", "lang": "ru", "theme": "dark", "id": "t001",
      "file": "shots/rub/ru/dark/t001.webp",
      "width": 1600, "height": 800, "bytes": 51234,
      "capturedAt": "2026-10-15",
      "luma": 0.12,
      "checks": { "lang": true, "currency": true, "theme": true, "notEmpty": true, "masks": true },
      "status": "pass"
    },
    {
      "cur": "aed", "lang": "en", "theme": "light", "id": "t065",
      "status": "fail",
      "reason": "кириллица в легенде графика",
      "bug": "DEMO-50"
    }
  ]
}
```

- Одна запись на каждый вариант из `media-required.json` (24 × 4 + 22 × 4 = 184). Нет записи — вариант считается несделанным.
- `status: "pass"` — файл обязан лежать по `file` (путь от `public/`, без ведущего `/`), размер 1600 × 800, все `checks` = `true`.
- `status: "fail"` — файла может не быть; обязательны `reason` и, если причина в продукте, `bug` (ключ задачи DEMO). На сайте функция в этом сочетании идёт без снимка.
- `luma` — средняя яркость кадра 0…1; у тёмного варианта она должна быть ниже, чем у светлого той же пары.
- Без адресов стейджа, слагов сетей, имён и e-mail — страж публичности `deploy/public-audit.mjs` проверяет и этот файл.

## `src/data/video-checks.json` (пишет C)

```json
{
  "version": 1,
  "generatedAt": "2026-10-16T10:00:00Z",
  "videos": [
    {
      "cur": "rub", "lang": "ru", "theme": "dark", "fmt": "16x9",
      "width": 1600, "height": 900, "durationSec": 22, "fps": 30, "audio": false,
      "files": {
        "webm": { "file": "video/hero-rub-ru-dark-16x9.webm", "bytes": 3100000 },
        "mp4":  { "file": "video/hero-rub-ru-dark-16x9.mp4",  "bytes": 3500000 },
        "webp": { "file": "video/hero-rub-ru-dark-16x9.webp", "bytes": 60000 },
        "avif": { "file": "video/hero-rub-ru-dark-16x9.avif", "bytes": 40000 }
      },
      "luma": 0.14,
      "checks": { "lang": true, "currency": true, "theme": true, "loop": true, "budget": true },
      "status": "pass"
    }
  ]
}
```

- Одна запись на каждое из 16 сочетаний (8 × 2 формата). `status: "fail"` — с `reason`; на сайте в этом сочетании рамка ролика не показывается (ни кадра-обложки, ни чужого варианта).

## `src/data/shots-app-checks.json` — кадры приложения (SITE-55, сайт v2)

Экраны самого приложения VILAX (iPhone 15 Pro, 1179×2556, без строки состояния iOS) для «Блоков платформы» на телефоне
(< 768): `public/shots-app/{cur}/{lang}/{theme}/{id}.webp`, 590×1279 (`media-required.json → shotsApp.size`), webp q80.
Те же `id`, что у настольных снимков. Пишет скрипт `export-app.mjs` из рабочих инструментов съёмки
из `manifest.json` съёмки (`shoot.mjs --app --native`). Запись — как в `shots-checks.json` (`file`, `width`, `height`,
`bytes`, `capturedAt`, `luma`, `checks`, `status`, при `fail` — `reason`); не снятые экраны — без записи.

Слой **необязательный** ни в одном режиме: нет записи, `fail` — на телефоне у функции настольный снимок в MacBook, нет и
его — функция без снимка (Р-22). Ошибка сборки — только у `pass` без файла нужного размера, дубля или лишней записи.
В `media.json` — `app[cur][id][lang-theme]`, на странице — `D.media.app[cur][id]` (4 знака по слотам, как `shots`).

## `src/data/media.json` (собирает A, в git не хранится)

`node scripts/media.mjs` читает `media-required.json` и оба файла проверок, сверяет их с файлами в `public/` и пишет `src/data/media.json`. Скрипт запускается сам перед `dev`, `build:*` и `test`.

```json
{
  "version": 1,
  "mode": "local",
  "shots": {
    "rub": { "t001": { "ru-dark": { "src": "shots/rub/ru/dark/t001.webp", "w": 1600, "h": 800, "date": "2026-10-15" } } }
  },
  "video": {
    "rub-ru-dark": { "16x9": { "webm": "video/…webm", "mp4": "video/…mp4", "webp": "video/…webp", "avif": "video/…avif" } }
  },
  "missing": [],
  "failed": []
}
```

- **Этап 1 выкладки (слово владельца 14.10.2026):** ролик необязателен. Нет файлов ролика у сочетания — обложка показывает снимок блока этого же сочетания (₽ — `t001`, AED — `t014`) в рамке 2:1, как режим `heroPanel: 'shot'` прототипа; ролики появятся — обложка перейдёт на них сама. Снимки по-прежнему строгие.
- Вариант со `status: "fail"` в `media.json` не попадает (в `failed`): сайт показывает функцию без снимка, ролик — без видео.
- Варианта нет или файла нет: в режиме `local` (dev и `npm run check`) — заглушка `placeholder: true` с подписью сочетания, только для разработки; в режимах `preview` и `prod` скрипт завершается ошибкой и сборка падает.
- Тест `tests/media.test.ts` проверяет полноту: у каждого экрана и ролика все варианты либо есть с файлом нужного размера, либо отмечены `fail` с причиной.

## Как проверить свою ветку

```
node scripts/media.mjs --mode preview   # строгая проверка: всё на месте или fail с причиной
npm run check
node deploy/public-audit.mjs
```
