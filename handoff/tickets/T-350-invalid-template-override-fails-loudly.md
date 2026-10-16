# T-350 — An invalid template override fails loudly

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Lead (drafting) |
| Mode   | Small fix |
| Status | Merged into develop_staging 6be8b14 (tanvi, 12 Oct 2026). Waiting for Anushka on develop |

`loadTemplateConfig` in `apps/drafting/src/services/template-engine.service.ts` silently falls back to the registry when a `docs/templates` override is invalid JSON. A broken signed override would go unnoticed and the old text would be used.

## Acceptance criteria

1. An invalid override JSON is logged as an error (template id only, no content) and fails the boot check from T-345, not a silent fallback.
2. A missing override still falls back to the registry as today.
3. Tests for invalid, missing and valid overrides.
4. Security (added by Priya, 12 Oct 2026, from Tanvi): `loadTemplateConfig` joins `templateId` into a file path unchecked. `documents.routes.ts` passes `req.params.id` (around line 665) and a body `template_id` (around line 747) straight in, and Express decodes `%2F`, so `..%2F..%2Fpackage` could read a JSON file outside `docs/templates`. `loadTemplateConfig` accepts only ids matching `^[a-z0-9_-]+$` (or a known catalogue id) and returns null otherwise. Test with `../`, `%2F` and absolute paths.
