# T-276 — lint-staged prints "[FAILED] paths are ignored" for docs/

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build); Arjun if it needs a call |
| Mode           | Small fix (root config) |
| Status         | Building: mahak (12 Oct 2026) |

`.gitignore` has `docs/`, yet `docs/seeding.md` is tracked. When a commit touches it, lint-staged prints "[FAILED] paths are ignored … docs" and re-adds the file. The commit still goes through with every file intact, but the noise is alarming and could block a hook run where prettier really rewrites a docs file.

Root config (`.gitignore`, lint-staged config): held by one lead at a time.

## Acceptance criteria

1. Committing a change to a tracked `docs/` file prints no FAILED line and keeps the file.
2. Untracked new files under `docs/` stay ignored if that is intended (decide with Arjun).

## Arjun (12 Oct 2026): AC2, docs/ in .gitignore

**Option (a).** Delete the `docs/` line; keep `docs/CLAUDE.md` ignored. `docs/templates/*.json` are runtime overrides that `loadTemplateConfig` reads first, so they are source: a new override silently left out of a commit would ship a different template than the one tested. An exception list (b) fails the same way for the next folder someone adds. Check after the change: `git status --ignored docs/` lists only `docs/CLAUDE.md`, and `git add docs/templates/<new>.json` works without `-f`. `.gitignore` is root config: it must be in Mahak's claim row.

Addendum (Arjun, 12 Oct 2026): **yes, add `docs/templates/` to `.prettierignore`**, beside the legal config paths already there. Those JSON files are legal content; they change only through Ajay-signed diffs, never by a formatter. `docs/seeding.md` is formatted normally. Check: `prettier --check docs/` passes with no change to any `docs/templates/*.json` byte. `.prettierignore` is root config, so Priya adds it to Mahak's row first.
