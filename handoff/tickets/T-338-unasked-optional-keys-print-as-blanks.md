# T-338 — Unasked optional ledger keys reach the Drafter as visible blanks

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Ajay (gate). Lead (build, drafting) |
| Mode   | Small fix (legal content) |
| Status | Merged into develop_staging 10faf08 (12 Oct 2026). Ajay signed 2db8acb; his fact_ledger gate for this gap is cleared. Anushka tests on develop |

With `feature.fact_ledger` on, an optional unresolved key that goes unasked (past the question cap) never reaches the Drafter as a blank. Ajay wants a visible blank.

## Acceptance criteria

1. `ledgerDrafterFacts` in `apps/drafting/src/services/brief-drafter.ts` passes every unresolved optional key that wasn't asked as a visible blank.
2. One call site in `apps/drafting/src/services/ai.service.ts` passes them through. Sequence this after Shashank's T-270 and T-333, which hold that file.
3. Tests: an unasked optional key prints as a blank; an answered key prints its value.
4. Ajay sees the diff.
