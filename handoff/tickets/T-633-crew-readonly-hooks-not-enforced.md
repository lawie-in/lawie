# T-633: Reviewer, doc-writer and tester role hooks are not enforced

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (crew integrity, HIGH) |
| Owner  | mahak (root config), after T-593 |
| Mode   | Full chain |
| Status | To do. Raised 26 Oct 2026 (Mahak's T-593 reviewer; Arjun's spec). Priya |

## Problem
The reviewer's read-only hook is declared in .claude/agents/dev/reviewer.md frontmatter (PreToolUse Bash → .claude/hooks/readonly-bash.sh), but a `;` command went through in a reviewer run. The CLI may not apply agent-frontmatter hooks.

## Acceptance criteria
1. Reproduce: a reviewer subagent runs `git status; echo x` and it is blocked.
2. If frontmatter hooks are ignored, enforcement moves into settings.json PreToolUse, keyed on the agent name in the hook input (verify the field exists). Fallback: a CLAUDE_AGENT_ROLE env that the lead's packet sets per spawn.
3. The same for tests-only.sh (tester) and docs-only.sh (doc-writer).
4. A scripts test feeds the hook a reviewer payload with `;` and expects exit 2.
5. Interim, until merged: every reviewer report states "reviewer ran read-only commands only", and leads check changed files against each crew role.
