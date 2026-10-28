#!/bin/bash
# Restricts Bash to read-only git inspection commands, for the reviewer and
# doc-writer agents. A tools allowlist alone isn't enough here: both agents
# have Bash in their allowlist (for running git diff/log/status etc.), and
# Bash access is unrestricted by default, so this hook is the actual boundary.
# Since T-633 it runs from .claude/settings.json through crew-role.sh (the CLI
# does not apply agent-frontmatter hooks to subagents).
#
# A naive "does the command start with git status/diff/..." check is not
# safe on its own: `git status; rm -rf .` starts with an allowed command but
# runs something else after a semicolon. So this hook rejects, anywhere in the
# raw command string (inside quotes too, so quoting cannot hide them):
#   - any control character except tab (newline, carriage return, NUL, ...)
#   - ;  &  (covers &&, background &, &>, |&)  ||
#   - >  <  (every redirection, here-docs, process substitution <( >( )
#   - backtick and any `$` (substitution, parameter expansion including word
#     splitting through IFS, $'..' and $".." quoting)
# Then it splits on every `|` (at most 3 segments). Each segment is judged as
# the shell would pass it to the program: every single quote, double quote and
# backslash is deleted first (quote removal), so a quoted, backslash-escaped or
# empty-quote-spliced command word or flag is compared in its unquoted form.
# EVERY segment must then start with an allowlisted read command:
#   git [-C <dir>] diff|log|show|status|blame, grep, cat, head, tail, wc, cut, jq
# (`less` is not allowed: a pager can shell out.) Per segment:
#   - git: rejects --output and its abbreviations (--ou...), --ext-diff
#     (--ext...) and --textconv (--textc...): the first writes files, the
#     other two run external programs.
#   - jq: rejects -f / --from-file (a program the hook cannot see).
#
# Accepted false positives (blocked although harmless, by design):
#   git log --grep='a;b', grep ">" file, grep '<div' file, grep 'x&y' file,
#   any `$` anywhere (grep 'x$' file, git log --grep='^fix$'), a 4th pipe
#   segment or a `|` inside a quoted pattern counting as one,
#   git diff --output-indicator-new=+, multi-line --grep patterns, a quoted
#   search pattern or argument that reads as a denied flag once quotes and
#   backslashes are removed (git log --grep ' --output'), git -C with a
#   dash-leading path.
# Known gaps: repo or user git config that runs programs (diff.external,
# core.fsmonitor, textconv drivers) still runs under git diff/status; writing
# that config needs write access this hook denies, but a lead or another
# agent could have set it.
if ! command -v jq >/dev/null 2>&1; then
  echo "Blocked: jq is not on PATH, so the read-only Bash check cannot run and fails closed." >&2
  exit 2
fi

# stdin is read once; every jq call below reads this copy.
INPUT=$(cat)

# Asked of jq, not of the shell: $(...) strips trailing newlines and drops NUL bytes.
if [ "$(printf '%s' "$INPUT" | jq -r '(.tool_input.command // "") | tostring | explode | any((. < 32 and . != 9) or . == 127)')" != "false" ]; then
  echo "Blocked: control characters (newline, carriage return, NUL, ...) are not allowed in read-only Bash; run one command per call." >&2
  exit 2
fi

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

if [[ "$CMD" == *$'\n'* || "$CMD" == *$'\r'* ]]; then
  echo "Blocked: control characters (newline, carriage return, NUL, ...) are not allowed in read-only Bash; run one command per call." >&2
  exit 2
fi

if printf '%s\n' "$CMD" | grep -qE '(;|&|\|\||`|\$)'; then
  echo "Blocked: compound, background, substituted or expanded command (; & || backtick \$) not allowed for read-only Bash ($CMD)" >&2
  exit 2
fi

if printf '%s\n' "$CMD" | grep -qE '[<>]'; then
  echo "Blocked: redirection (> < >> <( >( here-docs) is not allowed for read-only Bash, even inside quotes ($CMD)" >&2
  exit 2
fi

READ_CMD_RE='^[[:space:]]*(git([[:space:]]+-C[[:space:]]+[^-[:space:]][^[:space:]]*)?[[:space:]]+(diff|log|show|status|blame)|grep|cat|head|tail|wc|cut|jq)([[:space:]]|$)'
GIT_RE='^[[:space:]]*git[[:space:]]'
GIT_BAD_FLAG_RE='(^|[[:space:]])(--ou|--ext|--textc)'
JQ_RE='^[[:space:]]*jq([[:space:]]|$)'
JQ_BAD_FLAG_RE='(^|[[:space:]])(-[A-Za-z]*f[A-Za-z]*|--from-file)([[:space:]=]|$)'
MAX_SEGMENTS=3

PIPES=$(printf '%s' "$CMD" | tr -cd '|' | wc -c)
NSEG=$((PIPES + 1))
if [ "$NSEG" -gt "$MAX_SEGMENTS" ]; then
  echo "Blocked: at most $MAX_SEGMENTS piped read-only commands are allowed ($CMD)" >&2
  exit 2
fi

IFS='|' read -r -a SEGMENTS <<< "$CMD"
if [ "${#SEGMENTS[@]}" -ne "$NSEG" ]; then
  echo "Blocked: empty pipe segment in read-only Bash ($CMD)" >&2
  exit 2
fi

for RAWSEG in "${SEGMENTS[@]}"; do
  # Quote removal as the shell does it, before every check below: delete all
  # single quotes, double quotes and backslashes.
  SEG=$(printf '%s' "$RAWSEG" | tr -d "'\"\\\\")
  if ! printf '%s\n' "$SEG" | grep -qE "$READ_CMD_RE"; then
    if [ "$NSEG" -gt 1 ]; then
      echo "Blocked: only read-only git/text commands may be piped together, and every piped command is checked ($CMD)" >&2
    else
      echo "Blocked: Bash is restricted to read-only git inspection here ($CMD). Note: yarn lint is also off-limits — every lint script runs eslint --fix and rewrites files." >&2
    fi
    exit 2
  fi
  if printf '%s\n' "$SEG" | grep -qE "$GIT_RE" && printf '%s\n' "$SEG" | grep -qE "$GIT_BAD_FLAG_RE"; then
    echo "Blocked: git --output (writes files) and --ext-diff/--textconv (run programs) are not allowed for read-only Bash, also when quoted or escaped ($CMD)" >&2
    exit 2
  fi
  if printf '%s\n' "$SEG" | grep -qE "$JQ_RE" && printf '%s\n' "$SEG" | grep -qE "$JQ_BAD_FLAG_RE"; then
    echo "Blocked: jq -f/--from-file is not allowed for read-only Bash; pass the filter inline ($CMD)" >&2
    exit 2
  fi
done

exit 0
