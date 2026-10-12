# T-350 — An invalid template override fails loudly

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Lead (drafting) |
| Mode   | Small fix |
| Status | Building: tanvi, with T-349 (12 Oct 2026) |

`loadTemplateConfig` in `apps/drafting/src/services/template-engine.service.ts` silently falls back to the registry when a `docs/templates` override is invalid JSON. A broken signed override would go unnoticed and the old text would be used.

## Acceptance criteria

1. An invalid override JSON is logged as an error (template id only, no content) and fails the boot check from T-345, not a silent fallback.
2. A missing override still falls back to the registry as today.
3. Tests for invalid, missing and valid overrides.
