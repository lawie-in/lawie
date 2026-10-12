# T-115a — Encrypt saved case details (formInputs and Fact Ledger)

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Arjun designed it |
| Mode           | Small build (drafting) |
| Status         | To do. Unassigned. Waits for T-226 (both edit `documents.routes.ts`). Backfill on production is a founder task after an offline backup of the encryption key |
| Parent         | T-115 |

Per Arjun's revised design in `T-115-permanent-delete-and-encrypted-inputs.md`: app-level `encrypt()` for Document `formInputs` and `FactLedger.facts`; reads work from the old or new field; then a one-off migration (develop first). Losing the encryption key loses every draft and there are no database backups, so the key is backed up offline BEFORE any backfill (founder).

## Acceptance criteria

See the slice list and acceptance criteria in `T-115-permanent-delete-and-encrypted-inputs.md` (Arjun, 12 Oct 2026, revised design). Gate before v1 go-live.
