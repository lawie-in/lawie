#!/bin/bash
# Restricts the tester agent to editing test files only. The tester must never
# change source to make a test pass — a failing test caused by source is a finding.
# Since T-633 it runs from .claude/settings.json through crew-role.sh (the CLI
# does not apply agent-frontmatter hooks to subagents).
#
# The path is lexically normalised first (`.`/`..` resolved, no filesystem
# access, symlinks not followed), so `src/__tests__/../index.ts` is checked as
# `src/index.ts`. Blocked outright: a path with control characters (newline,
# NUL, ...) and a relative path whose `..` climbs above its start. There is no
# inside-the-repo rule (lead worktrees live outside the main checkout).
if ! command -v jq >/dev/null 2>&1; then
  echo "Blocked: jq is not on PATH, so the tester path check cannot run and fails closed." >&2
  exit 2
fi

# Lexically resolves . and .. segments. Prints the result; returns 1 if a
# relative path escapes upwards. `/..` stays `/`.
normalise_path() {
  local p=$1 abs="" seg
  local -a parts out=()
  [[ $p == /* ]] && abs=/
  IFS=/ read -r -a parts <<< "$p"
  for seg in "${parts[@]}"; do
    case $seg in
      ''|.) ;;
      ..)
        if ((${#out[@]})); then
          unset "out[$((${#out[@]} - 1))]"
        elif [[ -z $abs ]]; then
          return 1
        fi
        ;;
      *) out+=("$seg") ;;
    esac
  done
  local IFS=/
  printf '%s%s\n' "$abs" "${out[*]}"
}

# stdin is read once; every jq call below reads this copy.
INPUT=$(cat)

# Asked of jq, not of the shell: $(...) strips trailing newlines and drops NUL bytes.
if [ "$(printf '%s' "$INPUT" | jq -r '(.tool_input.file_path // "") | tostring | explode | any(. < 32 or . == 127)')" != "false" ]; then
  echo "Blocked: file path contains control characters (newline, NUL, ...)" >&2
  exit 2
fi

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0

if ! NORM=$(normalise_path "$FILE"); then
  echo "Blocked: relative file path escapes upwards with '..' ($FILE)" >&2
  exit 2
fi

case "$NORM" in
  __tests__/*|*/__tests__/*|*.test.ts|*.test.tsx)
    exit 0
    ;;
esac
echo "Blocked: tester may edit test files only ($FILE resolves to $NORM)" >&2
exit 2
