#!/bin/bash
# Global PreToolUse hook on Bash (T-570), wired in .claude/settings.json so it applies
# to every agent including the lead. Blocks commands that would print the environment
# (env, printenv, export -p/-n, bare set, declare -x/-p, /proc/*/environ, interpreter
# dumps of process.env / os.environ / %ENV / ENV), also when chained, piped, substituted
# or wrapped in bash -c / sh -c / eval / xargs. Agent sessions hold real secrets in
# their environment (incident 22 Oct 2026, handoff/ops/incident-2026-10-22-env-dump.md).
#
# Checking whether a variable is set stays allowed: [ -n "$VAR" ] && echo set.
# Test runs drop variables with the subshell form, which prints nothing:
#   (unset REDIS_URL SENTRY_DSN; yarn workspace @lawie/<ws> test)
#
# The shell parsing lives in no-env-print.mjs (node is a hard requirement of the repo).
# Fails closed: no node, unparseable input or a checker crash all block. The block
# message names the rule only and never echoes the command.
HOOK_DIR="${BASH_SOURCE[0]%/*}"
[ "$HOOK_DIR" = "${BASH_SOURCE[0]}" ] && HOOK_DIR=.

if ! command -v node >/dev/null 2>&1; then
  echo "Blocked (no-env-print, rule: no-node): node is not on PATH, so the env-print check cannot run and the hook fails closed." >&2
  exit 2
fi

node "$HOOK_DIR/no-env-print.mjs"
rc=$?
[ "$rc" -eq 0 ] && exit 0
[ "$rc" -eq 2 ] && exit 2
echo "Blocked (no-env-print, rule: checker-error): the env-print checker failed (exit $rc), so the hook fails closed." >&2
exit 2
