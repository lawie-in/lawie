# T-445: Fix two stale entries in the legal-content list

| Field  | Value |
| ------ | ----- |
| Status | To do. Mahak, after T-116 merges. Priya, 15 Oct 2026 |
| Owner  | Mahak (build), Ajay (rules the list) |
| Mode   | Small fix (one Markdown file) |

## Source

Ajay, 15 Oct 2026, from the T-116 sign-off. Risk, not Blocker.

## Acceptance criteria

1. `.claude/docs/legal-content-paths.md` names `apps/drafting/src/assistant/prompt/` (line ~22). That path does not exist on develop_staging. Find out whether it was renamed or never landed. Fix the path. If the Lawie Assistant prompt lives elsewhere now, list its real file (that would be a legal-content gap).
2. The same file says "the template seed scripts" (line ~10) and names no path. Candidates: `apps/drafting/src/scripts/seed-templates.ts`, `seed-sections.ts`, `seed-courts.ts`, `apps/drafting/src/services/template-seed.service.ts`. Name the exact files that hold template or section text.
3. Send Ajay the list to rule on before merging. His sign-off reference goes in the merge commit.

## Scope

One file: `.claude/docs/legal-content-paths.md`. No code.
