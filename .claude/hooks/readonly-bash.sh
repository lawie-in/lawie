#!/bin/bash
# Restricts Bash to read-only git inspection commands, for the reviewer and
# doc-writer agents. A tools allowlist alone isn't enough here: both agents
# have Bash in their allowlist (for running git diff/log/status etc.), and
# Bash access is unrestricted by default, so this hook is the actual boundary.
#
# A naive "does the command start with git status/diff/..." check is not
# safe on its own: `git status; rm -rf .` starts with an allowed command but
# runs something else after a semicolon. So this hook rejects any chaining or
# substitution outright, then allows exactly one case worth keeping — a
# single pipe into a read-only text filter (e.g. `git log | grep fix`) — by
# checking BOTH sides of the pipe against the allowlist, not just the first.
CMD=$(jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

if echo "$CMD" | grep -qE '(;|&&|\|\||`|\$\()'; then
  echo "Blocked: compound or substituted command not allowed for read-only Bash ($CMD)" >&2
  exit 2
fi

READ_CMD_RE='^[[:space:]]*(git[[:space:]]+(diff|log|show|status|blame)\b|grep\b|cat\b|head\b|tail\b|wc\b|less\b|cut\b|jq\b)'

if echo "$CMD" | grep -q '|'; then
  LEFT=$(echo "$CMD" | cut -d'|' -f1)
  RIGHT=$(echo "$CMD" | cut -d'|' -f2-)
  if echo "$LEFT" | grep -qE "$READ_CMD_RE" && echo "$RIGHT" | grep -qE "$READ_CMD_RE"; then
    exit 0
  fi
  echo "Blocked: only read-only git/text commands may be piped together ($CMD)" >&2
  exit 2
fi

if echo "$CMD" | grep -qE "$READ_CMD_RE"; then
  exit 0
fi

echo "Blocked: Bash is restricted to read-only git inspection here ($CMD). Note: yarn lint is also off-limits — every lint script runs eslint --fix and rewrites files." >&2
exit 2
