# T-276 — lint-staged prints "[FAILED] paths are ignored" for docs/

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build); Arjun if it needs a call |
| Mode           | Small fix (root config) |
| Status         | To do. Unassigned. Raised by Shashank (T-250 commit), 12 Oct 2026 |

`.gitignore` has `docs/`, yet `docs/seeding.md` is tracked. When a commit touches it, lint-staged prints "[FAILED] paths are ignored … docs" and re-adds the file. The commit still goes through with every file intact, but the noise is alarming and could block a hook run where prettier really rewrites a docs file.

Root config (`.gitignore`, lint-staged config): held by one lead at a time.

## Acceptance criteria

1. Committing a change to a tracked `docs/` file prints no FAILED line and keeps the file.
2. Untracked new files under `docs/` stay ignored if that is intended (decide with Arjun).
