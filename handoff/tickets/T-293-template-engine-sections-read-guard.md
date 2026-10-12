# T-293 — template-engine: guard the sections pre-read key

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Legal accuracy |
| Owner  | Lead (build). Ajay sees the diff (template-engine is legal content) |
| Mode   | Small fix (drafting) |
| Status         | Merged into develop_staging (cf05202, 12 Oct 2026). Waiting for Anushka on develop |

In `apps/drafting/src/services/template-engine.service.ts`, a formData key `__sections_charged_read` sent by the client can overwrite the server's own pre-read of the sections, and bad JSON in it throws while the prompt is built. It only affects the requester's own draft, but it must not be possible.

## Acceptance criteria

1. Client formData can never set `__sections_charged_read`; the server always computes it.
2. Bad JSON never throws while building the prompt; the draft falls back to the normal read.
3. Two tests: a client-sent key is ignored; bad JSON does not throw.
