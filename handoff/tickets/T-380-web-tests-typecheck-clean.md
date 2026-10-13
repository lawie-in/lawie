# T-380 — Web test files typecheck clean; remove the exclusion

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web) |
| Mode   | Small fix |
| Status | Merged into develop_staging 9349b6a (mahak, 13 Oct 2026). Test-only; nothing to test in the UI. Priya |
| Source | T-369 (Arjun): the CI web typecheck excludes `__tests__` through apps/web/tsconfig.typecheck.json |

## Acceptance criteria

1. The 4 web test files with ~60 type errors typecheck clean under tsc.
2. `__tests__` is removed from the exclusion in apps/web/tsconfig.typecheck.json (or the file is dropped if nothing else needs it).
3. The CI web typecheck step stays green.
