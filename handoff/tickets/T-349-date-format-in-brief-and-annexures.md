# T-349 — "4 April 2026" in brief drafts and annexures too

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Ajay (format ruled in T-192). Lead (drafting) |
| Mode   | Small fix (legal content) |
| Status | To do. After T-340 (shared formatter) and Mahak's T-338 (brief-drafter.ts). Raised by Tanvi, 12 Oct 2026 |

T-340 makes the template engine print dates as "4 April 2026". Two other paths don't follow it yet:
- `apps/drafting/src/services/brief-drafter.ts` (`filingDate`) prints DD.MM.YYYY.
- `apps/drafting/src/services/annexures.service.ts` prints "10 May 2026" style but with a leading zero on single-digit days ("04 April 2026").

## Acceptance criteria

1. Both paths use T-340's formatter: day without a leading zero, full English month name.
2. Tests for a single-digit day in each path. Any golden that moves goes to Ajay.
