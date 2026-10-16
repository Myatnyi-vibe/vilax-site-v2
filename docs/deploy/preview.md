# Превью на GitHub Pages (этап 10)

Превью — копия сайта для показа: https://myatnyi-vibe.github.io/vilax-site/. Репозиторий `Myatnyi-vibe/vilax-site`, публичный (Р-13). Всё делается одной командой и только по команде владельца сайта.

## Что уходит наружу

Только дерево ветки `main`, не история. Каждая публикация — один коммит-снимок «Сайт: <коммит main>» поверх прежнего публичного. Рабочие заметки из локальной истории остаются дома.

Перед публикацией страж `deploy/public-audit.mjs` проверяет дерево. Он не пускает рабочие почты, адреса стейджа и демо-аккаунтов, внутренние ссылки, локальные пути, ключи и токены. Пока он красный, публикация не начнётся.

## Команды

| Что | Команда |
|---|---|
| Посмотреть, что уйдёт (ничего не меняет) | `bash deploy/preview-publish.sh` |
| Опубликовать или обновить превью | `bash deploy/preview-publish.sh --go` |
| Снять превью: репозиторий приватный, Pages выключены | `bash deploy/preview-publish.sh --hide` |

При первом `--go` скрипт сам создаёт публичный репозиторий и включает Pages из GitHub Actions. Учётка — сохранённая в Git Credential Manager для github.com (Myatnyi-vibe). Токен не печатается и никуда не записывается.

После push работает `.github/workflows/preview.yml`. Ход сборки — во вкладке Actions репозитория. Превью обновляется через 2–4 минуты.

## Что проверяет GitHub перед выкладкой превью

1. `npm run check`: типы, сборка, тесты сайта, `verify-dist`; тесты комплекта выкладки (`deploy/tests`).
2. Секреты по всей истории (gitleaks) и страж публичного репозитория.
3. Сборка `preview` под подпутём `/vilax-site/` (`VILAX_SITE=https://myatnyi-vibe.github.io`, `VILAX_BASE=/vilax-site`).
4. CSP в каждой странице (`deploy/csp.mjs`): на Pages нельзя задать заголовки, поэтому политика стоит в meta.
5. Проверка папки (`deploy/check-dist.mjs --mode preview`): все адреса под подпутём и ведут на файлы, у каждой страницы noindex, в файлах нет адреса приёмника и служебных адресов.
6. Браузерная проверка (`deploy/smoke.mjs`): 13 страниц без ошибок и нарушений CSP, шрифты загружены, экран выбора запоминает версию, форма показывает «Превью: заявка не отправлена» и никуда не ходит.
7. Lighthouse — отдельной задачей, для сведения: общие машины GitHub шумят по скорости, бюджет проверяет приёмка.

Красный шаг 1–6 — превью не обновляется, на Pages остаётся прежняя версия.

## Закрыто от поисковиков

- На каждой странице `<meta name="robots" content="noindex, nofollow">` — это и закрывает превью.
- `robots.txt` превью запрещает всё, но поисковики читают его только в корне хоста (`myatnyi-vibe.github.io/robots.txt`), а не в подпути. Поэтому главное — noindex.
- Метрика в превью не включается (`PUBLIC_VILAX_YM_ID` не задаётся), форма в режиме показа.

## Собрать превью у себя так же, как GitHub

```bash
MSYS_NO_PATHCONV=1 VILAX_SITE=https://myatnyi-vibe.github.io VILAX_BASE=/vilax-site npm run build:preview
node deploy/csp.mjs --dist dist --mode preview
MSYS_NO_PATHCONV=1 node deploy/check-dist.mjs --mode preview --site https://myatnyi-vibe.github.io --base /vilax-site
MSYS_NO_PATHCONV=1 node deploy/smoke.mjs --dist dist --base /vilax-site --mode preview
```

`MSYS_NO_PATHCONV=1` нужен только в Git Bash на Windows: без него `/vilax-site` превращается в `C:/Program Files/Git/vilax-site`.

## Правило для разметки

Путь от корня сайта в разметке и скриптах — только через `url()`, `homePath()` или `legalPath()` из `src/lib/site.ts`. Голый `/ru/` или `/shots/…` на превью уведёт мимо подпути. `check-dist` и `smoke` такие места ловят.
