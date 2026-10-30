#!/usr/bin/env bash
# T-695 (CI font resilience): warm up and check Google Fonts before `next build`.
#
# apps/web loads its fonts with next/font/google, and `next build` fetches the Google Fonts CSS
# and font files over the network ITSELF, at build time. This script does NOT feed Next: it does
# not fill any Next cache (none was verified to exist for this), and the build fetches again on
# its own. What it does: it requests the same css2 URLs next/font generates for our five font
# calls, then the font files they name, with retries. That warms DNS and the CDN edge for the
# build that follows, and gives a clear, early line in the log when Google Fonts is unreachable.
# It never fails the job: if Google Fonts stays unreachable it prints a GitHub ::warning:: and
# exits 0, and the build (scripts/ci/prefetch-fonts.build.sh) gets its single retry.
#
# Bounded: the whole prefetch stops after FONT_PREFETCH_BUDGET seconds (default 60).
#
# Overrides (for tests; no network needed):
#   FONTS_CSS_BASE        css2 endpoint (default https://fonts.googleapis.com/css2)
#   FONTS_CSS_QUERIES     newline-separated css2 query strings (default: the five font calls below)
#   FONT_PREFETCH_DIR     where to put the downloaded files (default: a new temp dir)
#   FONT_PREFETCH_BUDGET  total seconds for the prefetch (default 60)
#   FONT_CURL_RETRY_DELAY seconds between curl retries (default 5)
# curl is taken from PATH. Prints no environment and no secrets.
set -euo pipefail

CSS_BASE="${FONTS_CSS_BASE:-https://fonts.googleapis.com/css2}"
BUDGET="${FONT_PREFETCH_BUDGET:-60}"
RETRY_DELAY="${FONT_CURL_RETRY_DELAY:-5}"
# The User-Agent next/font sends, so Google answers with the same woff2 CSS the build gets.
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36'

# The css2 queries next/font/google builds for apps/web/src/app/layout.tsx (Inter, Lora 600,
# Mukta 400/500, Tiro Devanagari Hindi 400) and apps/web/src/app/(marketing)/layout.tsx (Inter,
# Lora 500/600/700, Fraunces with the opsz axis). Inter's two calls give the same URL.
DEFAULT_QUERIES='family=Inter:wght@100..900&display=swap
family=Lora:wght@600&display=swap
family=Lora:wght@500;600;700&display=swap
family=Mukta:wght@400;500&display=swap
family=Tiro+Devanagari+Hindi:wght@400&display=swap
family=Fraunces:opsz,wght@9..144,100..900&display=swap'
QUERIES="${FONTS_CSS_QUERIES:-$DEFAULT_QUERIES}"

DIR="${FONT_PREFETCH_DIR:-$(mktemp -d)}"
mkdir -p "$DIR"

start=$SECONDS
left() { echo $((BUDGET - (SECONDS - start))); }

# One request, retried, never longer than the time left in the budget.
fetch() { # url outfile
  local t
  t=$(left)
  if [ "$t" -le 0 ]; then return 1; fi
  local per=20
  if [ "$t" -lt "$per" ]; then per="$t"; fi
  curl -sS -f -o "$2" -A "$UA" \
    --connect-timeout 10 --max-time "$per" \
    --retry 5 --retry-delay "$RETRY_DELAY" --retry-all-errors --retry-max-time "$t" \
    "$1"
}

css_ok=0
css_failed=0
files=0
files_failed=0
n=0
while IFS= read -r q; do
  [ -n "$q" ] || continue
  n=$((n + 1))
  css="$DIR/css-$n.css"
  if ! fetch "$CSS_BASE?$q" "$css"; then
    css_failed=$((css_failed + 1))
    echo "prefetch-fonts: could not fetch $CSS_BASE?$q"
    continue
  fi
  css_ok=$((css_ok + 1))
  # Each @font-face names its file as src: url(https://fonts.gstatic.com/...) format('woff2').
  while IFS= read -r furl; do
    [ -n "$furl" ] || continue
    files=$((files + 1))
    if ! fetch "$furl" "$DIR/font-$n-$files"; then
      files_failed=$((files_failed + 1))
    fi
  done < <(grep -oE 'url\([^)]+\)' "$css" | sed -E 's/^url\(//; s/\)$//' | sort -u)
done <<< "$QUERIES"

took=$((SECONDS - start))
echo "prefetch-fonts: css ${css_ok}/${n} ok, font files $((files - files_failed))/${files} ok, ${took}s"
if [ "$css_failed" -gt 0 ] || [ "$files_failed" -gt 0 ]; then
  echo "::warning::Google Fonts prefetch incomplete (css failed: ${css_failed}, font files failed: ${files_failed}); the web build will try anyway and retries once on a font fetch error"
fi
exit 0
