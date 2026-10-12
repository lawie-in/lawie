# T-336 — Re-ask a description-read "None" on earlier bail applications, even with the ledger off

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft. Before release (Ajay) |
| Owner  | Ajay (rule). Lead (build, drafting) |
| Mode   | Small fix (legal content) |
| Status | To do. Before release. Mahak right after T-190 (same files), ahead of T-334 and T-335. Raised by Ajay via Mahak, 12 Oct 2026 |

With `feature.fact_ledger` off, a "None" read from the description for `earlier_bail_applications` is not confirmed. It reaches the non-ledger draft as an averment the advocate never made.

## Acceptance criteria

1. With the ledger on or off, a description-read "None" for `earlier_bail_applications` is re-asked as a confirm question before drafting.
2. Until the advocate confirms it, the draft does not aver "no earlier bail application".
3. Tests for ledger on and ledger off. Ajay sees the diff.
