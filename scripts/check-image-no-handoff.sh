#!/usr/bin/env bash
# T-533 (founder rule, 21 Oct 2026): no handoff docs in production images.
#
# Usage: scripts/check-image-no-handoff.sh <image-ref>
#
# Runs the image once with `--entrypoint sh` (no network, as root so nothing is hidden by
# permissions) and looks for handoff/, .claude/, CLAUDE.md and copilot-instructions.md anywhere
# in the filesystem. /proc, /sys, /dev and every node_modules directory are skipped: third-party
# packages may ship their own CLAUDE.md or README, and those are not ours.
#
# Exit codes:
#   0  image is clean
#   1  offending paths found (printed, one per line)
#   2  usage error
#   3  the image could not be inspected (pull/run failed, no `sh`, scan did not finish)
#
# DOCKER can be set to a fake for tests (default: docker).

set -euo pipefail

DOCKER="${DOCKER:-docker}"

if [[ $# -ne 1 || -z "${1:-}" ]]; then
  echo "usage: $0 <image-ref>" >&2
  exit 2
fi

image="$1"
sentinel='__LAWIE_SCAN_DONE__'

# The scan prints matches, then the sentinel. No sentinel means the scan did not run to the end.
scan='find / \( -path /proc -o -path /sys -o -path /dev -o -name node_modules \) -prune -o \
  \( -name handoff -o -name .claude -o -name CLAUDE.md -o -name copilot-instructions.md \) -print \
  2>/dev/null; echo '"$sentinel"

set +e
output="$($DOCKER run --rm --network none --user 0 --entrypoint sh "$image" -c "$scan" 2>&1)"
rc=$?
set -e

if [[ $rc -ne 0 ]] || ! grep -qx "$sentinel" <<<"$output"; then
  echo "check-image-no-handoff: could not scan $image (docker exit $rc):" >&2
  printf '%s\n' "$output" >&2
  exit 3
fi

offenders="$(grep -vx "$sentinel" <<<"$output" | grep -v '^[[:space:]]*$' || true)"

if [[ -n "$offenders" ]]; then
  echo "check-image-no-handoff: $image contains handoff content:" >&2
  printf '%s\n' "$offenders"
  exit 1
fi

echo "check-image-no-handoff: $image is clean"
