#!/bin/bash
# Global PreToolUse hook on Bash and on Edit|Write|MultiEdit|NotebookEdit (T-633), wired in
# .claude/settings.json. The CLI ignores the `hooks:` frontmatter in .claude/agents/dev/*.md
# for subagents, so crew-role enforcement lives here: the hook input's `agent_type` names the
# subagent, and crew-role.mjs runs that role's script on the same payload:
#   reviewer    Bash -> readonly-bash.sh   edits -> blocked
#   doc-writer  Bash -> readonly-bash.sh   edits -> docs-only.sh
#   tester      Bash -> db-readonly.sh     edits -> tests-only.sh
#   developer   Bash -> db-readonly.sh     edits -> no-tests.sh
# Exact, case-sensitive match on those four names; any other or absent agent_type (the main
# thread / lead sessions) passes through.
#
# The dispatch logic lives in crew-role.mjs (node is a hard requirement of the repo).
# Fails closed: no node, unparseable input, a crew role script that cannot run or a
# dispatcher crash all block. Messages never echo the command or path themselves.
HOOK_DIR="${BASH_SOURCE[0]%/*}"
[ "$HOOK_DIR" = "${BASH_SOURCE[0]}" ] && HOOK_DIR=.

if ! command -v node >/dev/null 2>&1; then
  echo "Blocked (crew-role, rule: no-node): node is not on PATH, so the crew-role check cannot run and the hook fails closed." >&2
  exit 2
fi

node "$HOOK_DIR/crew-role.mjs"
rc=$?
[ "$rc" -eq 0 ] && exit 0
[ "$rc" -eq 2 ] && exit 2
echo "Blocked (crew-role, rule: dispatcher-error): the crew-role dispatcher failed (exit $rc), so the hook fails closed." >&2
exit 2
