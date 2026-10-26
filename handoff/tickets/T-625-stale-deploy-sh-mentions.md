# T-625: Remove the last deploy.sh mentions after T-606

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (docs hygiene) |
| Owner  | any lead, after their current ticket |
| Mode   | Small fix (docs + one code comment) |
| Status | To do. Raised 26 Oct 2026 (Arjun's split after T-606). Priya |

## Scope
- LOCAL-SETUP-DECISION.md: point to scripts/deploy-local.sh and docs/DEPLOY.md.
- apps/web sentry.*.config.ts line 18: comment only.
Not in scope: .claude/agents/nikhil.md (Arjun) or handoff/ops runbooks (Nikhil).

## Acceptance criteria
1. `git grep -n "deploy.sh"` shows no mention outside deploy-local.sh, its tests, and the Arjun/Nikhil files.
2. No behaviour change.
