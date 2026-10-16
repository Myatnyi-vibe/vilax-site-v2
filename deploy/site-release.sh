#!/usr/bin/env bash
# Выкладка сайта на vilax.ai (ТЗ, этап 13, вариант А): релизы в /opt/vilax-site/releases/<коммит>, ссылка current,
# хранится 5 последних, откат — одной командой. Запуск из рабочей копии репозитория сайта (Git Bash или Linux).
#
#   bash deploy/site-release.sh                       — показ: ничего не меняет (код 2) — что в main, что на сервере, команда
#   bash deploy/site-release.sh <коммит>              — выкладка этого коммита main
#   bash deploy/site-release.sh <коммит> --build-only — всё, кроме сервера: проверки, сборка prod, пакет (для репетиции)
#   bash deploy/site-release.sh rollback [<коммит>]   — откат за секунду: current на прежний релиз (или на названный)
#   bash deploy/site-release.sh status                — что в current, релизы, журнал
#   bash deploy/site-release.sh setup                 — напечатать разовую настройку сервера (для Ильяса), ничего не делает
#
# Выкладка: коммит из main → npm run check и тесты комплекта на чистой выгрузке коммита → сборка prod с адресом приёмника →
# version.json → CSP (deploy/csp.mjs) → проверка папки (deploy/check-dist.mjs) → браузерная проверка (deploy/smoke.mjs,
# форма не отправляется) → пакет и sha256 → scp в incoming → на сервере deploy/server/site-remote.sh из этого же коммита →
# проверка боевого сайта (deploy/check-prod.sh after, если задан снимок «до»).
#
# Настройки — окружение или файл deploy/.env.release (в git не попадает):
#   VILAX_SITE_SSH       пользователь@сервер для выкладки (выдаёт Ильяс; отдельный пользователь с записью только в ROOT)
#   VILAX_SITE_ROOT      каталог сайта на сервере, по умолчанию /opt/vilax-site
#   PUBLIC_VILAX_YM_ID   номер счётчика Яндекс Метрики (Р-11); пусто — Метрики нет
#   VILAX_PROD_SNAPSHOT  папка снимка «как до выкладки» (deploy/check-prod.sh snapshot …) — для проверки после
set -Eeuo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEAD="https://tracker.vilax.ai/api/site/demo-request"
SITE="https://vilax.ai"
[[ -f "$REPO/deploy/.env.release" ]] && { set -a; . "$REPO/deploy/.env.release"; set +a; }
ROOT="${VILAX_SITE_ROOT:-/opt/vilax-site}"
SSH_TARGET="${VILAX_SITE_SSH:-}"
YM="${PUBLIC_VILAX_YM_ID:-}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)
WINDOWS=0; [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]] && WINDOWS=1

say() { echo "[release] $*"; }
die() { echo "[release] ОТКАЗ: $*" >&2; exit 1; }
need_ssh() { [[ -n "$SSH_TARGET" ]] || die "не задан VILAX_SITE_SSH (пользователь@сервер) — его выдаёт Ильяс, см. «setup»"; }
remote() { # remote <действие> [аргументы] — серверная часть из файла $REMOTE_SCRIPT
  need_ssh
  # MSYS_NO_PATHCONV: Git Bash не должен превращать /opt/vilax-site в путь Windows
  MSYS_NO_PATHCONV=1 ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "VILAX_SITE_ROOT='$ROOT' bash -s -- $*" <"$REMOTE_SCRIPT"
}
served() { # какой коммит отдаёт боевой сайт (только GET)
  curl -fsS --max-time 15 "$SITE/version.json?check=$RANDOM" 2>/dev/null | grep -o '"commit": *"[0-9a-f]\{40\}"' | grep -o '[0-9a-f]\{40\}' || true
}
REMOTE_SCRIPT="$REPO/deploy/server/site-remote.sh"

case "${1:-}" in
  "")
    MAIN="$(git -C "$REPO" rev-parse main)"
    say "main: $(git -C "$REPO" log -1 --format='%h %s' main)"
    say "боевой vilax.ai отдаёт: $(served | sed 's/^$/— (прежний лендинг или нет version.json)/')"
    if [[ -n "$SSH_TARGET" ]]; then remote status || true; else say "сервер: VILAX_SITE_SSH не задан — состояние не смотрю"; fi
    say "выложить main:   bash deploy/site-release.sh $MAIN"
    say "репетиция:       bash deploy/site-release.sh $MAIN --build-only"
    exit 2
    ;;
  status) remote status; exit ;;
  rollback)
    [[ -z "${2:-}" || "${2:-}" =~ ^[0-9a-f]{40}$ ]] || die "rollback [<коммит из 40 знаков>]"
    remote rollback "${2:-}"
    say "боевой vilax.ai отдаёт: $(served | sed 's/^$/— (version.json нет: nginx смотрит не в \/opt\/vilax-site)/')"
    exit
    ;;
  setup)
    cat <<EOF
# Разово, под root на сервере vilax.ai (делает или разрешает Ильяс). Ничего, кроме этого, сайту не нужно.
useradd --system --create-home --shell /bin/bash vilax-site          # отдельный пользователь, без sudo
install -d -o vilax-site -g vilax-site -m 755 $ROOT $ROOT/releases $ROOT/incoming
install -d -o vilax-site -g vilax-site -m 700 /home/vilax-site/.ssh
echo '<открытый ключ того, кто выкладывает>' >> /home/vilax-site/.ssh/authorized_keys
chown vilax-site:vilax-site /home/vilax-site/.ssh/authorized_keys && chmod 600 /home/vilax-site/.ssh/authorized_keys
command -v flock curl sha256sum tar                                   # всё есть в Ubuntu
# Первый релиз — bash deploy/site-release.sh <коммит> (файлы разложатся, nginx ещё смотрит в старый лендинг).
# Затем правка vilax-ai.conf (root → $ROOT/current, 404, www → vilax.ai, заголовки) → nginx -t → systemctl reload nginx.
# После этого откат релиза — bash deploy/site-release.sh rollback (без reload nginx);
# полный возврат к прежнему лендингу — root обратно на /opt/vilax/current/landing и reload.
EOF
    exit 0
    ;;
esac

# ---- выкладка коммита ----
SHA="$(git -C "$REPO" rev-parse --verify --quiet "${1}^{commit}" || true)"
[[ -n "$SHA" ]] || die "нет коммита $1"
BUILD_ONLY=0; [[ "${2:-}" == --build-only ]] && BUILD_ONLY=1
[[ "${2:-}" == "" || "$BUILD_ONLY" == 1 ]] || die "непонятный ключ ${2}"
# Выкладываем только слитое в main; другая ветка (VILAX_RELEASE_BRANCH) — только для репетиции --build-only.
BRANCH="${VILAX_RELEASE_BRANCH:-main}"
[[ "$BRANCH" == main || "$BUILD_ONLY" == 1 ]] || die "ветка $BRANCH — только с --build-only; на сервер идёт только main"
git -C "$REPO" merge-base --is-ancestor "$SHA" "$BRANCH" || die "$SHA не в $BRANCH — выкладываем только слитое в main"
((BUILD_ONLY)) || need_ssh
git -C "$REPO" cat-file -e "$SHA:deploy/server/site-remote.sh" 2>/dev/null || die "в $SHA нет комплекта выкладки (deploy/)"
[[ -d "$REPO/node_modules" ]] || die "нет node_modules — npm ci в $REPO"
git -C "$REPO" diff --quiet "$SHA" -- package-lock.json ||
  die "package-lock.json в $SHA не такой, как в рабочей копии — сначала git switch на этот коммит и npm ci"
say "коммит $(git -C "$REPO" log -1 --format='%h %s' "$SHA")"

W="$(mktemp -d "${TMPDIR:-/tmp}/vilax-site-release-${SHA:0:12}-XXXXXX")"
cleanup() {
  # node_modules в выгрузке — ссылка на рабочую копию: снимаем саму ссылку, а не её содержимое
  if [[ -e "$W/node_modules" || -L "$W/node_modules" ]]; then
    if ((WINDOWS)); then cmd //c rmdir "$(cygpath -w "$W/node_modules")" >/dev/null 2>&1 || true; else rm -f "$W/node_modules"; fi
  fi
  [[ -e "$W/node_modules" ]] || rm -rf "$W"
}
trap cleanup EXIT
git -C "$REPO" archive "$SHA" | tar -x -C "$W"
if ((WINDOWS)); then
  cmd //c mklink //J "$(cygpath -w "$W/node_modules")" "$(cygpath -w "$REPO/node_modules")" >/dev/null
else
  ln -s "$REPO/node_modules" "$W/node_modules"
fi
REMOTE_SCRIPT="$W/deploy/server/site-remote.sh"
cd "$W"

say "1/6 проверки коммита: npm run check и тесты комплекта"
env -u VILAX_MODE -u VILAX_SITE -u VILAX_BASE -u PUBLIC_VILAX_LEAD_URL -u PUBLIC_VILAX_YM_ID npm run check >"$W/check.log" 2>&1 ||
  { tail -n 40 "$W/check.log"; die "npm run check не прошёл"; }
node --test "deploy/tests/*.test.mjs" >"$W/deploy-tests.log" 2>&1 || { tail -n 40 "$W/deploy-tests.log"; die "тесты комплекта не прошли"; }

say "2/6 сборка prod: приёмник $LEAD${YM:+, Метрика $YM}"
rm -rf dist
env -u VILAX_SITE -u VILAX_BASE VILAX_MODE=prod PUBLIC_VILAX_LEAD_URL="$LEAD" PUBLIC_VILAX_YM_ID="$YM" npx astro build >"$W/build.log" 2>&1 ||
  { tail -n 40 "$W/build.log"; die "сборка prod упала"; }
printf '{"commit": "%s", "builtAt": "%s"}\n' "$SHA" "$(date -u +%FT%TZ)" >dist/version.json

say "3/6 CSP и проверка папки"
YMFLAG=(); [[ -n "$YM" ]] && YMFLAG=(--ym)
node deploy/csp.mjs --dist dist --mode prod --lead "$LEAD" "${YMFLAG[@]}"
node deploy/check-dist.mjs --dist dist --mode prod --lead "$LEAD" "${YMFLAG[@]}"

say "4/6 браузерная проверка (headless Chrome; форма не отправляется)"
node deploy/smoke.mjs --dist dist --mode prod

PKG="$W/site-$SHA.tgz"
tar -czf "$PKG" -C dist .
SUM="$(sha256sum "$PKG" | cut -c1-64)"
say "пакет: $(du -h "$PKG" | cut -f1), sha256 ${SUM:0:16}…"
if ((BUILD_ONLY)); then
  mkdir -p "$REPO/node_modules/.vilax-release"
  cp "$PKG" "$REPO/node_modules/.vilax-release/"
  say "репетиция окончена: всё зелёное, на сервер ничего не ушло. Пакет: node_modules/.vilax-release/site-$SHA.tgz"
  exit 0
fi

say "5/6 сервер: $SSH_TARGET:$ROOT"
MSYS_NO_PATHCONV=1 scp -q "${SSH_OPTS[@]}" "$PKG" "$SSH_TARGET:$ROOT/incoming/site-$SHA.tgz"
remote release "$SHA" "$SUM"

say "6/6 боевой сайт"
GOT="$(served)"
if [[ "$GOT" != "$SHA" ]]; then
  say "vilax.ai пока отдаёт не новый сайт (${GOT:-version.json нет}) — до правки root в nginx так и должно быть."
  say "после правки nginx: bash deploy/check-prod.sh after <папка снимка>"
  exit 0
fi
say "vilax.ai отдаёт $SHA ✓"
if [[ -n "${VILAX_PROD_SNAPSHOT:-}" ]]; then
  bash "$W/deploy/check-prod.sh" after "$VILAX_PROD_SNAPSHOT" || {
    say "проверка после выкладки нашла отказы — откат: bash deploy/site-release.sh rollback"
    exit 1
  }
else
  say "VILAX_PROD_SNAPSHOT не задан — проверку «после» запустите сами: bash deploy/check-prod.sh after <папка снимка>"
fi
