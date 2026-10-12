# T-300 — template-engine: client form keys can overwrite server-computed values

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Legal accuracy |
| Owner  | Arjun (scope: which keys are server-only). Ajay (signs). Mahak (build, same file as T-293) |
| Mode   | Small fix, legal content (template-engine) |
| Status | To do. Found by Mahak in T-293, 12 Oct 2026. After T-293 merges |

In `apps/drafting/src/services/template-engine.service.ts`, `buildPlaceholderContext` flattens the client's formData into the context after the server's own values, so any client key can overwrite a server-computed value (for example `advocate_name`, `current_date`, computed field ids). Same class of bug as T-293, wider.

## Acceptance criteria

1. Arjun lists which context keys are server-only (computed or from the user record) and which the form may set.
2. Server-only keys cannot be overwritten by client formData; a test per class of key.
3. Ajay signs the diff; moved golden snapshots go to him.
