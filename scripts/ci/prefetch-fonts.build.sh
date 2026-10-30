#!/usr/bin/env bash
# T-695 (CI font resilience): the CI "Web build" step. Runs the Google Fonts prefetch, then
# `yarn workspace @lawie/web build`. If the build fails AND its output shows a Google Fonts fetch
# error, it waits, prefetches again and runs the build ONE more time. Any other failure fails at
# once, with no retry. If the retry fails on a font fetch error too, it prints a GitHub ::error::
# and exits non-zero.
#
# Why: CI runs 1540 and 1549 went red because `next build` could not fetch the Google font Lora
# (module-not-found in lora_*.module.css); both passed on re-run (Arjun: CI must not go red on a
# font fetch).
#
# Overrides (for tests; no network needed):
#   FONT_RETRY_SLEEP      seconds to wait before the retry (default 15)
#   FONT_RETRY_PREFETCH_BUDGET  prefetch budget before the retry, seconds (default 20; the first
#                         prefetch uses FONT_PREFETCH_BUDGET, default 60)
#   PREFETCH_FONTS_SCRIPT the prefetch to run (default: prefetch-fonts.sh next to this file);
#                         it also passes through FONTS_CSS_BASE / FONTS_CSS_QUERIES etc.
#   WEB_BUILD_LOG_DIR     where the build logs go (default: a new temp dir)
# yarn is taken from PATH. Prints no environment and no secrets.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFETCH="${PREFETCH_FONTS_SCRIPT:-$HERE/prefetch-fonts.sh}"
SLEEP_S="${FONT_RETRY_SLEEP:-15}"
LOG_DIR="${WEB_BUILD_LOG_DIR:-$(mktemp -d)}"
mkdir -p "$LOG_DIR"

# A Google Fonts fetch error in the build output (Next's webpack and Turbopack wordings).
FONT_ERROR_RE='fonts\.googleapis\.com|fonts\.gstatic\.com|Failed to fetch `[^`]*` from Google Fonts|issue establishing a connection while requesting|next/font/google|@vercel/turbopack-next/internal/font/google|internal/font/google/|lora_[[:alnum:]_]*\.module\.css'

is_font_error() { grep -Eq "$FONT_ERROR_RE" "$1"; }

prefetch() { bash "$PREFETCH" || echo "::warning::font prefetch script failed; building anyway"; }

build() { # attempt-number -> exit status of the build; output also goes to the job log
  local log="$LOG_DIR/web-build-$1.log"
  local status=0
  echo "web-build: attempt $1"
  set +e
  yarn workspace @lawie/web build 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  set -e
  return "$status"
}

prefetch

status=0
build 1 || status=$?
if [ "$status" -eq 0 ]; then exit 0; fi

if ! is_font_error "$LOG_DIR/web-build-1.log"; then
  echo "web-build: failed (exit $status), not a Google Fonts fetch error: no retry"
  exit "$status"
fi

echo "::warning::Web build hit a Google Fonts fetch error; retrying once in ${SLEEP_S}s"
sleep "$SLEEP_S"
# A shorter prefetch before the retry, so prefetch + build + wait + prefetch + build stays inside
# the step's 3 minutes even when Google Fonts is down and every prefetch runs to its budget.
FONT_PREFETCH_BUDGET="${FONT_RETRY_PREFETCH_BUDGET:-20}" prefetch

status=0
build 2 || status=$?
if [ "$status" -eq 0 ]; then
  echo "web-build: passed on the retry"
  exit 0
fi

if is_font_error "$LOG_DIR/web-build-2.log"; then
  echo "::error::Web build failed twice on a Google Fonts fetch error (fonts.googleapis.com unreachable or blocked)"
else
  echo "web-build: retry failed (exit $status), not a Google Fonts fetch error"
fi
exit "$status"
