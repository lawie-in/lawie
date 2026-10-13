# T-349 — "4 April 2026" in brief drafts and annexures too

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Ajay (format ruled in T-192). Lead (drafting) |
| Mode   | Small fix (legal content) |
| Status | Merged into develop_staging 6be8b14 (tanvi, 12 Oct 2026). Waiting for Anushka on develop |

T-340 makes the template engine print dates as "4 April 2026". Two other paths don't follow it yet:
- `apps/drafting/src/services/brief-drafter.ts` (`filingDate`) prints DD.MM.YYYY.
- `apps/drafting/src/services/annexures.service.ts` prints "10 May 2026" style but with a leading zero on single-digit days ("04 April 2026").

- The AI system prompt in `apps/drafting/src/services/template-engine.service.ts` (around line 1730) still says "Use today's date format (DD/MM/YYYY)". Prompt text, so Ajay words the change (found by Tanvi in T-340).

## Acceptance criteria

1. Both paths use T-340's formatter: day without a leading zero, full English month name.
2. The template-engine prompt line asks for "4 April 2026" style, in Ajay's wording.
3. Tests for a single-digit day in each path. Any golden that moves goes to Ajay.
