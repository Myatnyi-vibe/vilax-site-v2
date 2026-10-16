#!/usr/bin/env bash
# Боевой vilax.ai: снимок «как до выкладки» и проверка после неё (ТЗ, «Проверка после выкладки на прод», ворота 3).
#
#   bash deploy/check-prod.sh snapshot <папка>   — сохранить ответы как есть (до выкладки нового сайта)
#   bash deploy/check-prod.sh after <папка>      — после выкладки: пять пунктов ТЗ и сверка со снимком из <папки>
#
# Только чтение: на vilax.ai, www, vilax.io, app.vilax.ai и tracker.vilax.ai — GET; на приёмник заявок — только
# OPTIONS (любой POST туда заводит настоящую сделку в CRM). Снимок в репозиторий не кладём: в старом лендинге есть
# названия клиентов — папка снимка живёт вне репозитория (рядом с координацией сайта, у того, кто выкладывает).
# Код возврата: 0 — всё сошлось, 1 — есть отказы (перечислены в конце), 2 — ошибка запуска.
set -Eeuo pipefail

MODE="${1:-}"
DIR="${2:-}"
[[ "$MODE" == snapshot || "$MODE" == after ]] && [[ -n "$DIR" ]] || {
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

SITE="https://vilax.ai"
LEAD="https://tracker.vilax.ai/api/site/demo-request"
GOOGLE="/google1e0ecdafaa681c29.html"
UA="vilax-check-prod/1 (+$SITE)"

# имя|метод|адрес|Origin (только для OPTIONS). Переадресации не проходим: сверяем статус и Location как есть.
PROBES=(
  "home|GET|$SITE/"
  "ru|GET|$SITE/ru/"
  "en|GET|$SITE/en/"
  "privacy|GET|$SITE/privacy"
  "terms|GET|$SITE/terms"
  "support|GET|$SITE/support"
  "ru-privacy|GET|$SITE/ru/privacy"
  "ru-terms|GET|$SITE/ru/terms"
  "ru-support|GET|$SITE/ru/support"
  "aasa|GET|$SITE/.well-known/apple-app-site-association"
  "aasa-www|GET|https://www.vilax.ai/.well-known/apple-app-site-association"
  "google|GET|$SITE$GOOGLE"
  "robots|GET|$SITE/robots.txt"
  "sitemap|GET|$SITE/sitemap.xml"
  "missing|GET|$SITE/__vilax-check-missing-page"
  "www|GET|https://www.vilax.ai/privacy?check=1"
  "http|GET|http://vilax.ai/privacy?check=1"
  "io|GET|https://vilax.io/privacy?check=1"
  "io-www|GET|https://www.vilax.io/"
  "io-http|GET|http://vilax.io/"
  "app|GET|https://app.vilax.ai/"
  "tracker|GET|https://tracker.vilax.ai/"
  "lead-site|OPTIONS|$LEAD|$SITE"
  "lead-foreign|OPTIONS|$LEAD|https://example.com"
)

probe() { # probe <папка> <имя> <метод> <адрес> [Origin]
  local out="$1" name="$2" method="$3" url="$4" origin="${5:-}"
  local args=(-sS --max-time 25 -A "$UA" -o "$out/$name.body" -D "$out/$name.raw" -X "$method")
  [[ -n "$origin" ]] && args+=(-H "Origin: $origin" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type")
  if ! curl "${args[@]}" "$url" 2>"$out/$name.err"; then
    echo "000 $(tr -d '\r\n' <"$out/$name.err")" >"$out/$name.head"
    : >"$out/$name.body"
    return 0
  fi
  rm -f "$out/$name.err"
  # Строка статуса + заголовки без \r; имена заголовков — в нижнем регистре. Берём последний блок: перед ним
  # может стоять ответ прокси на CONNECT («HTTP/1.1 200 Connection established»).
  tr -d '\r' <"$out/$name.raw" | awk '
    /^HTTP\// {n=0; buf[n++]=$0; next}
    /^$/ {next}
    {i=index($0,":"); buf[n++]=tolower(substr($0,1,i-1)) substr($0,i)}
    END {for (k=0; k<n; k++) print buf[k]}' >"$out/$name.head"
  rm -f "$out/$name.raw"
}

status() { awk 'NR==1{print $2; exit}' "$1/$2.head"; }
header() { grep -i "^$3:" "$1/$2.head" | tail -1 | cut -d: -f2- | sed 's/^ *//' || true; }
sha() { sha256sum "$1/$2.body" | cut -c1-64; }

run_all() { # run_all <папка>
  mkdir -p "$1"
  local p name method url origin
  printf 'имя\tметод\tадрес\tстатус\tбайт\tsha256\n' >"$1/index.tsv"
  for p in "${PROBES[@]}"; do
    IFS='|' read -r name method url origin <<<"$p"
    probe "$1" "$name" "$method" "$url" "$origin"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$name" "$method" "$url" "$(status "$1" "$name")" \
      "$(wc -c <"$1/$name.body" | tr -d ' ')" "$(sha "$1" "$name")" >>"$1/index.tsv"
  done
}

if [[ "$MODE" == snapshot ]]; then
  [[ -e "$DIR/index.tsv" ]] && { echo "Снимок уже есть: $DIR — выберите другую папку, прежний не перезаписываю." >&2; exit 2; }
  run_all "$DIR"
  date -u '+%Y-%m-%dT%H:%M:%SZ' >"$DIR/taken-at.txt"
  echo "Снимок сохранён: $DIR ($(date -u '+%Y-%m-%d %H:%M UTC'))"
  column -t -s $'\t' "$DIR/index.tsv" 2>/dev/null || cat "$DIR/index.tsv"
  exit 0
fi

# ---- after: проверка после выкладки ----
[[ -f "$DIR/index.tsv" ]] || { echo "Нет снимка «до» в $DIR — сначала: bash deploy/check-prod.sh snapshot $DIR" >&2; exit 2; }
NOW="$DIR/after-$(date -u '+%Y%m%dT%H%M%SZ')"
run_all "$NOW"

FAILS=()
ok() { printf '  ✓ %s\n' "$1"; }
bad() { printf '  ✗ %s\n' "$1"; FAILS+=("$1"); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
same_redirect() { # тот же статус и тот же Location, что в снимке
  [[ "$(status "$DIR" "$1")" == "$(status "$NOW" "$1")" && "$(header "$DIR" "$1" location)" == "$(header "$NOW" "$1" location)" ]]
}
html_ok() { [[ "$(status "$NOW" "$1")" == 200 && "$(header "$NOW" "$1" content-type)" == text/html* ]]; }
body_has() { grep -q -- "$2" "$NOW/$1.body"; }

echo "1. vilax.ai, /ru/, /en/, www → vilax.ai, vilax.io → vilax.ai"
check "/ отвечает 200, это новый сайт в режиме prod" 'html_ok home && body_has home "data-mode=\"prod\""'
check "/ru/ — 200, lang=ru" 'html_ok ru && body_has ru "lang=\"ru\""'
check "/en/ — 200, lang=en" 'html_ok en && body_has en "lang=\"en\""'
check "www.vilax.ai → https://vilax.ai с тем же путём, постоянной переадресацией" \
  '[[ "$(status "$NOW" www)" =~ ^30[18]$ && "$(header "$NOW" www location)" == "https://vilax.ai/privacy?check=1" ]]'
check "http://vilax.ai → https — как до выкладки" 'same_redirect http'
for n in io io-www io-http; do check "vilax.io ($n) → vilax.ai — как до выкладки" "same_redirect $n"; done
check "несуществующий адрес — 404, а не главная" '[[ "$(status "$NOW" missing)" == 404 ]]'

echo "2. /.well-known/apple-app-site-association — как до выкладки (Face ID)"
check "AASA: тот же статус" '[[ "$(status "$DIR" aasa)" == "$(status "$NOW" aasa)" ]]'
check "AASA: тот же Content-Type" '[[ "$(header "$DIR" aasa content-type)" == "$(header "$NOW" aasa content-type)" ]]'
check "AASA: тело совпадает байт в байт ($(sha "$DIR" aasa | cut -c1-12)…)" 'cmp -s "$DIR/aasa.body" "$NOW/aasa.body"'
check "AASA на www: прежний ответ или переадресация на vilax.ai" \
  'cmp -s "$DIR/aasa-www.body" "$NOW/aasa-www.body" || [[ "$(header "$NOW" aasa-www location)" == "https://vilax.ai/.well-known/apple-app-site-association" ]]'
echo "  … вход по Face ID в приложении iPhone — руками, на телефоне"

echo "3. Правовые страницы и файл подтверждения Google"
for n in privacy terms support ru-privacy ru-terms ru-support; do check "/${n/-//} — 200" "html_ok $n"; done
check "файл Google на месте, байт в байт как до выкладки" '[[ "$(status "$NOW" google)" == 200 ]] && cmp -s "$DIR/google.body" "$NOW/google.body"'

echo "4. Заявки: приёмник трекера (только OPTIONS)"
check "OPTIONS с Origin https://vilax.ai — 204 и разрешение этому Origin" \
  '[[ "$(status "$NOW" lead-site)" == 204 && "$(header "$NOW" lead-site access-control-allow-origin)" == "$SITE" ]]'
check "OPTIONS с чужого Origin — 403" '[[ "$(status "$NOW" lead-foreign)" == 403 ]]'
check "в странице нет адреса стенда (localhost)" '! body_has home localhost && ! body_has en localhost'
echo "  … одна настоящая заявка с vilax.ai → CRM и группа «Коммерции», затем обезличить — руками (POST скриптом не шлём)"

echo "5. Заголовки безопасности и кэша; app.vilax.ai и трекер как раньше"
for n in home ru en privacy; do
  check "$n: HSTS" '[[ "$(header "$NOW" '"$n"' strict-transport-security)" == *max-age=* ]]'
  check "$n: CSP пускает запросы только к приёмнику" '[[ "$(header "$NOW" '"$n"' content-security-policy)" == *"connect-src"*"https://tracker.vilax.ai"* ]]'
  check "$n: X-Content-Type-Options nosniff" '[[ "$(header "$NOW" '"$n"' x-content-type-options)" == nosniff ]]'
  check "$n: Referrer-Policy и Permissions-Policy" '[[ -n "$(header "$NOW" '"$n"' referrer-policy)" && -n "$(header "$NOW" '"$n"' permissions-policy)" ]]'
  check "$n: HTML не кэшируется" '[[ "$(header "$NOW" '"$n"' cache-control)" == *no-cache* || "$(header "$NOW" '"$n"' cache-control)" == *no-store* ]]'
  check "$n: открыта поисковикам (нет noindex)" '! grep -qi "noindex" "$NOW/'"$n"'.body" && [[ "$(header "$NOW" '"$n"' x-robots-tag)" != *noindex* ]]'
done
ASSET="$(grep -o '/_astro/[A-Za-z0-9._-]*\.\(css\|js\)' "$NOW/home.body" | head -1 || true)"
if [[ -n "$ASSET" ]]; then
  probe "$NOW" asset GET "$SITE$ASSET"
  check "файл с отпечатком ($ASSET) кэшируется на год" '[[ "$(header "$NOW" asset cache-control)" == *max-age=31536000* ]]'
else
  bad "на главной не нашлось файла /_astro/… — сборка не та"
fi
check "robots.txt открывает сайт и называет sitemap" 'body_has robots "Allow: /" && body_has robots "Sitemap: https://vilax.ai/sitemap.xml"'
check "sitemap.xml с /ru/ и /en/" 'body_has sitemap "https://vilax.ai/ru/" && body_has sitemap "https://vilax.ai/en/"'
check "app.vilax.ai — тот же статус, что до выкладки ($(status "$DIR" app))" '[[ "$(status "$DIR" app)" == "$(status "$NOW" app)" ]]'
check "tracker.vilax.ai — тот же статус, что до выкладки ($(status "$DIR" tracker))" '[[ "$(status "$DIR" tracker)" == "$(status "$NOW" tracker)" ]]'

echo
echo "Ответы после выкладки: $NOW"
if ((${#FAILS[@]})); then
  echo "ОТКАЗОВ: ${#FAILS[@]}. Откат за секунду: bash deploy/site-release.sh rollback"
  exit 1
fi
echo "Все проверки прошли. Осталось руками: Face ID на iPhone и одна настоящая заявка (п. 2 и 4)."
