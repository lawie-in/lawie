# T-357 — Template config edge cases after T-350

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Lead (drafting) |
| Mode   | Small fix |
| Status | Merged into develop_staging 7158fc4 (tanvi, 13 Oct 2026). Server error handling only; nothing to test in the UI |

## Acceptance criteria

1. An override file whose JSON is literally `null` fails like any other invalid override (logged, fails the boot check), not a silent fallback.
2. An override file whose name is not a plain id (`^[a-z0-9_-]+$`) fails the boot check instead of being silently left out of the picker.
3. `apps/drafting/src/routes/documents.routes.ts` around lines 665 and 747: a throw from template config loading returns a 500 with a safe message instead of hanging the request (async handler with no try/catch).
4. Tests for each.
