#!/bin/bash
# Global PreToolUse hook on Bash, wired in .claude/settings.json so it applies
# to every agent including the lead. `permissions.deny` already blocks Read
# and the Bash file-read commands Claude Code recognizes (cat, head, tail,
# sed, tee) plus redirection targets — this hook exists only for the residual
# surface that misses: commands that read a file without naming it to that
# recognizer (grep -r, a node/python subprocess that opens the file itself,
# base64 < file, cp, scp, etc).
CMD=$(jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

if echo "$CMD" | grep -qE '(^|[/[:space:]"'"'"'])\.env(\.[A-Za-z0-9_-]+)?\b' \
   && ! echo "$CMD" | grep -qE '\.env(\.[A-Za-z0-9_-]+)?\.example\b'; then
  echo "Blocked: command references a .env file; real values must not be read, printed or copied through Bash ($CMD)" >&2
  exit 2
fi

if echo "$CMD" | grep -qE '(^|[/[:space:]"'"'"'])[A-Za-z0-9_.-]*\.pem\b'; then
  echo "Blocked: command references a .pem file ($CMD)" >&2
  exit 2
fi

exit 0
