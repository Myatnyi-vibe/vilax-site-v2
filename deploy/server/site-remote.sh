#!/usr/bin/env bash
# Серверная часть выкладки сайта vilax.ai (ТЗ, этап 13, вариант А). На сервер не устанавливается: deploy/site-release.sh
# передаёт этот файл по ssh (`ssh <хост> bash -s -- <действие> …`), так что на сервере всегда версия из выкладываемого коммита.
#
#   status                      — что в current, какие релизы лежат, последние записи журнала
#   release <коммит> <sha256>   — разложить incoming/site-<коммит>.tgz в releases/<коммит>, переключить current, хранить 5
#   rollback [<коммит>]         — current на предыдущий релиз (или на названный) — за секунду, без reload nginx
#
# nginx отдаёт сайт из $ROOT/current (root в vilax-ai.conf) и сам переходит по ссылке на каждом запросе — переключение
# не требует reload и прав root. Нужны: bash, tar, sha256sum, flock, curl; пользователь с записью в $ROOT.
set -Eeuo pipefail

ROOT="${VILAX_SITE_ROOT:-/opt/vilax-site}"
KEEP=5
HOST="vilax.ai"
[[ "$ROOT" =~ ^/[A-Za-z0-9/_.-]+$ && "$ROOT" != / ]] || { echo "[site] недопустимый ROOT: $ROOT"; exit 2; }
ACTION="${1:-status}"

say() { echo "[site] $*"; }
current_sha() { local t; t="$(readlink "$ROOT/current" 2>/dev/null || true)"; basename "${t:-none}"; }
# Релизы от новых к старым (по времени появления каталога).
releases() { ls -1t "$ROOT/releases" 2>/dev/null | grep -E '^[0-9a-f]{40}$' || true; }

point_current() { # атомарно: новая ссылка рядом, затем rename поверх старой
  ln -sfn "releases/$1" "$ROOT/.current-next"
  mv -Tf "$ROOT/.current-next" "$ROOT/current"
}

# Что отдаёт nginx: commit из /version.json, если запрос дошёл до нового сайта. Пусто — nginx ещё смотрит не сюда
# (до переключения root отвечает прежний лендинг) или проверка недоступна с этого сервера.
served_sha() {
  curl -fsS --max-time 10 --resolve "$HOST:443:127.0.0.1" "https://$HOST/version.json?check=$RANDOM" 2>/dev/null |
    grep -o '"commit": *"[0-9a-f]\{40\}"' | grep -o '[0-9a-f]\{40\}' || true
}

# После переключения: если nginx отдаёт новый сайт — это должен быть именно этот коммит, иначе возврат.
verify_or_back() { # verify_or_back <ожидаемый коммит> <куда вернуть>
  local want="$1" back="$2" got
  got="$(served_sha)"
  if [[ -z "$got" ]]; then
    say "nginx пока не отдаёт /opt/vilax-site/current (до правки root в vilax-ai.conf так и должно быть) — файлы разложены"
    return 0
  fi
  if [[ "$got" == "$want" ]]; then
    say "nginx отдаёт $want ✓"
    return 0
  fi
  say "ОТКАЗ: nginx отдаёт $got вместо $want"
  if [[ -n "$back" && -d "$ROOT/releases/$back" ]]; then
    point_current "$back"
    echo "$(date -u +%FT%TZ) auto-rollback $back (после $want)" >>"$ROOT/releases.log"
    say "current возвращён на $back"
  fi
  return 1
}

lock() {
  exec 9>"$ROOT/.release.lock"
  flock -n 9 || { say "уже идёт другая выкладка ($ROOT/.release.lock)"; exit 75; }
}

case "$ACTION" in
  status)
    say "current: $(current_sha)"
    say "nginx отдаёт: $(served_sha | sed 's/^$/— (не этот каталог)/')"
    say "релизы (новые сверху):"
    releases | sed 's/^/  /'
    say "журнал:"
    tail -n 10 "$ROOT/releases.log" 2>/dev/null | sed 's/^/  /' || true
    ;;

  release)
    lock
    SHA="${2:-}"; SUM="${3:-}"
    [[ "$SHA" =~ ^[0-9a-f]{40}$ && "$SUM" =~ ^[0-9a-f]{64}$ ]] || { say "нужны коммит (40 hex) и sha256 пакета"; exit 2; }
    PKG="$ROOT/incoming/site-$SHA.tgz"
    [[ -f "$PKG" ]] || { say "нет пакета $PKG"; exit 1; }
    [[ "$(sha256sum "$PKG" | cut -c1-64)" == "$SUM" ]] || { say "sha256 пакета не сошёлся — передача испорчена"; exit 1; }
    PREV="$(current_sha)"
    if [[ "$PREV" == "$SHA" ]]; then say "$SHA уже в current — ничего не меняю"; rm -f "$PKG"; exit 0; fi

    TMP="$(mktemp -d "$ROOT/releases/.tmp-${SHA:0:12}.XXXXXX")"
    trap 'rm -rf "$TMP"' EXIT
    tar -xzf "$PKG" --no-same-owner --no-same-permissions -C "$TMP"
    # nginx (www-data) читает файлы с диска: каталоги o+rx, файлы o+r (mktemp даёт 0700 — так лендинг уже лежал с 500)
    chmod -R u=rwX,go=rX "$TMP"
    for f in index.html ru/index.html en/index.html 404.html privacy.html terms.html support.html \
      ru/privacy.html ru/terms.html ru/support.html google1e0ecdafaa681c29.html robots.txt sitemap.xml version.json; do
      [[ -s "$TMP/$f" ]] || { say "в пакете нет $f — не выкладываю"; exit 1; }
    done
    [[ ! -e "$TMP/.well-known" ]] || { say "в пакете есть .well-known — AASA отдаёт приложение, не сайт; не выкладываю"; exit 1; }
    grep -q "\"commit\": *\"$SHA\"" "$TMP/version.json" || { say "version.json не от $SHA"; exit 1; }

    rm -rf "$ROOT/releases/$SHA"
    mv "$TMP" "$ROOT/releases/$SHA"
    trap - EXIT
    touch "$ROOT/releases/$SHA"
    point_current "$SHA"
    echo "$(date -u +%FT%TZ) release $SHA prev=$PREV" >>"$ROOT/releases.log"
    say "current → $SHA (было $PREV)"
    rm -f "$PKG"

    verify_or_back "$SHA" "$PREV" || exit 1

    # хранить $KEEP последних по времени выкладки; текущий и предыдущий не трогаем никогда
    n=0
    for r in $(releases); do
      n=$((n + 1))
      if ((n > KEEP)) && [[ "$r" != "$SHA" && "$r" != "$PREV" ]]; then rm -rf "${ROOT:?}/releases/$r"; say "убран старый релиз $r"; fi
    done
    ;;

  rollback)
    lock
    CUR="$(current_sha)"
    TARGET="${2:-}"
    if [[ -z "$TARGET" ]]; then
      # на шаг назад: то, что стояло в current до выкладки текущего (журнал: «release <текущий> prev=<он>»);
      # повторный rollback уходит ещё на шаг назад, вперёд — только назвав коммит. Нет записи — релиз старше по времени.
      TARGET="$(grep -E "^[^ ]+ release $CUR prev=[0-9a-f]{40}$" "$ROOT/releases.log" 2>/dev/null | tail -n 1 | sed 's/.*prev=//' || true)"
      [[ -n "$TARGET" && -d "$ROOT/releases/$TARGET" ]] ||
        TARGET="$(releases | awk -v cur="$CUR" 'found { print; exit } $0 == cur { found = 1 }')"
      [[ -n "$TARGET" ]] || { say "откатывать не на что: релиза старше $CUR нет"; exit 1; }
    fi
    [[ "$TARGET" =~ ^[0-9a-f]{40}$ && -d "$ROOT/releases/$TARGET" ]] || { say "нет релиза $TARGET"; exit 1; }
    point_current "$TARGET"
    echo "$(date -u +%FT%TZ) rollback $TARGET prev=$CUR" >>"$ROOT/releases.log"
    say "откат: current → $TARGET (было $CUR)"
    verify_or_back "$TARGET" "" || exit 1
    ;;

  *)
    say "действия: status | release <коммит> <sha256> | rollback [<коммит>]"
    exit 2
    ;;
esac
