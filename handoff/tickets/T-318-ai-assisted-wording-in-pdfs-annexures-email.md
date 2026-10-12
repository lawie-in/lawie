# T-318 — "AI-assisted" wording in the server PDF footer, annexures and the welcome email

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release. Before go-live |
| Owner  | Ajay (signs text, approves the moved goldens). Lead (build, drafting + email-worker) |
| Mode   | Small fix (legal content; golden snapshots move) |
| Status | Merged into develop_staging (f5e7edb, 12 Oct 2026). Waiting for Anushka on develop |

Three places still use the old "AI-assisted" wording:

1. `apps/drafting/src/services/pdf-export.service.ts` ~150: the footer on server-made PDFs. It also appears in the golden snapshots.
2. `apps/drafting/src/services/annexures.service.ts`: 6 places.
3. `apps/email-worker` `welcome.tsx` ~73: the welcome email.

## Acceptance criteria

1. Every place uses Ajay's signed text, word for word.
2. The golden snapshots are updated only after Ajay approves the moved lines (see `.claude/docs/golden-snapshots.md`).
3. No other change.
