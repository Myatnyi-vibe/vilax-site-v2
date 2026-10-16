#!/usr/bin/env bash
# Публикация превью v2 (SITE-54, слово Данила 16.10): отдельный публичный репозиторий Myatnyi-vibe/vilax-site-v2 и
# GitHub Pages https://myatnyi-vibe.github.io/vilax-site-v2/ из локальной ветки v2. Превью первой версии
# (Myatnyi-vibe/vilax-site из ветки main) этот файл не трогает — его публикует deploy/preview-publish.sh ветки main.
# Запуск — только по команде Данила.
#
#   bash deploy/preview-publish.sh          — показ (код 2): что уйдёт, проверки, есть ли репозиторий; ничего не меняет
#   bash deploy/preview-publish.sh --go     — публикация: при первом запуске создать репозиторий и включить Pages,
#                                             затем снимок дерева main новым коммитом поверх публичной main и push
#   bash deploy/preview-publish.sh --hide   — откат этапа 10: репозиторий приватный, Pages выключены
#
# Наружу уходит только дерево main, а не история: каждый запуск — один коммит-снимок «Сайт: <коммит main>» поверх
# прежнего публичного (локальная история с рабочими заметками остаётся дома). Перед этим — страж deploy/public-audit.mjs.
# Учётка — сохранённая в Git Credential Manager для github.com (Myatnyi-vibe); токен не печатается и никуда не пишется.
# Сборку, проверки и выкладку на Pages делает .github/workflows/preview.yml после push.
set -Eeuo pipefail

OWNER="Myatnyi-vibe"
NAME="vilax-site-v2"
SRC="v2"   # локальная ветка, дерево которой уходит наружу
API="https://api.github.com"
REPO_URL="https://github.com/$OWNER/$NAME"
PAGES_URL="https://myatnyi-vibe.github.io/$NAME/"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-}"
cd "$ROOT"

say() { echo "[preview] $*"; }
die() { echo "[preview] ОТКАЗ: $*" >&2; exit 1; }

token() {
  printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p'
}
api() { # api <метод> <путь> [тело JSON] → тело ответа; код — в $CODE
  local out body=()
  out="$(mktemp)"
  [[ -n "${3:-}" ]] && body=(-H 'Content-Type: application/json' --data "$3")
  CODE="$(curl -sS -o "$out" -w '%{http_code}' -X "$1" "$API$2" \
    -H "Authorization: Bearer $TOKEN" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' \
    "${body[@]}")"
  cat "$out"
  rm -f "$out"
}
# Чтение публичного репозитория — без учётки и без окон входа (несуществующий репозиторий не должен звать GCM).
anon_git() { GIT_TERMINAL_PROMPT=0 git -c credential.helper= "$@"; }

MAIN="$(git rev-parse "$SRC")"
TREE="$(git rev-parse "$SRC^{tree}")"
say "$SRC: $(git log -1 --format='%h %s' "$SRC")"
node deploy/public-audit.mjs --ref "$SRC" || die "в дереве $SRC есть то, чему не место в открытом репозитории (выше) — сначала убрать"

REMOTE_HEAD="$(anon_git ls-remote "$REPO_URL.git" refs/heads/main 2>/dev/null | cut -f1 || true)"
if [[ -z "$REMOTE_HEAD" ]]; then say "публичной main ещё нет: $REPO_URL"; else say "публичная main: ${REMOTE_HEAD:0:12}"; fi

case "$MODE" in
  "")
    say "опубликовать:  bash deploy/preview-publish.sh --go"
    say "после push: проверки и сборка — $REPO_URL/actions, превью — $PAGES_URL"
    exit 2
    ;;
  --go | --hide) ;;
  *) die "ключи: --go | --hide" ;;
esac

TOKEN="$(token)"
[[ -n "$TOKEN" ]] || die "нет сохранённой учётки GitHub для github.com"
LOGIN="$(api GET /user | grep -o '"login": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
[[ "$LOGIN" == "$OWNER" ]] || die "сохранённая учётка — «$LOGIN», нужна $OWNER"

if [[ "$MODE" == --hide ]]; then
  api DELETE "/repos/$OWNER/$NAME/pages" >/dev/null
  say "Pages: код $CODE (204 — выключены, 404 — и так нет)"
  api PATCH "/repos/$OWNER/$NAME" '{"private":true}' >/dev/null
  [[ "$CODE" == 200 ]] || die "не удалось сделать репозиторий приватным (код $CODE)"
  say "репозиторий приватный, превью снято"
  exit 0
fi

api GET "/repos/$OWNER/$NAME" >/dev/null
if [[ "$CODE" == 404 ]]; then
  api POST /user/repos "{\"name\":\"$NAME\",\"description\":\"Сайт vilax.ai — превью v2\",\"homepage\":\"$PAGES_URL\",\"private\":false,\"has_issues\":false,\"has_wiki\":false,\"has_projects\":false,\"auto_init\":false}" >/dev/null
  [[ "$CODE" == 201 ]] || die "репозиторий не создан (код $CODE)"
  say "создан публичный репозиторий $REPO_URL"
elif [[ "$CODE" != 200 ]]; then
  die "GitHub ответил $CODE на чтение репозитория"
fi

api GET "/repos/$OWNER/$NAME/pages" >/dev/null
if [[ "$CODE" == 404 ]]; then
  api POST "/repos/$OWNER/$NAME/pages" '{"build_type":"workflow"}' >/dev/null
  [[ "$CODE" == 201 ]] || die "Pages не включились (код $CODE)"
  say "Pages включены: сборка из GitHub Actions"
fi

PARENT=()
if [[ -n "$REMOTE_HEAD" ]]; then
  anon_git fetch -q "$REPO_URL.git" main
  [[ "$(git rev-parse 'FETCH_HEAD^{tree}')" == "$TREE" ]] && { say "на GitHub уже это дерево — публиковать нечего"; exit 0; }
  PARENT=(-p "$REMOTE_HEAD")
fi
MSG="Сайт v2: $(git log -1 --format='%h %s' "$SRC")

Снимок дерева $SRC ${MAIN:0:12}.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
COMMIT="$(GIT_AUTHOR_NAME="$OWNER" GIT_AUTHOR_EMAIL="$OWNER@users.noreply.github.com" \
  GIT_COMMITTER_NAME="$OWNER" GIT_COMMITTER_EMAIL="$OWNER@users.noreply.github.com" \
  git commit-tree "$TREE" "${PARENT[@]}" -m "$MSG")"
git push -q "$REPO_URL.git" "$COMMIT:refs/heads/main"
say "опубликован снимок ${COMMIT:0:12} ($SRC ${MAIN:0:12})"
say "проверки и сборка: $REPO_URL/actions — превью появится через 2–4 минуты: $PAGES_URL"
