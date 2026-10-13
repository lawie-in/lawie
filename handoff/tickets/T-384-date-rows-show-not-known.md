# T-384 — Date rows answered "Not known" don't look blank on the brief

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web) + Rajesh (small design call) |
| Mode   | Small fix |
| Status | To do. Unassigned. After T-372 merges. From Kunal, 13 Oct 2026 |
| Source | T-365 AC2 (Anushka run 3): an answered row must never look empty |

## Acceptance criteria

1. A date row answered "Not known" shows "Not known" on the brief, not an empty date box. Rajesh picks the look (for example a chip beside the input, or the input swapped for the chip with a "Change" link).
2. The advocate can still set a date afterwards.
3. Tests for both.
File: apps/web/src/components/intake/ValueInput.tsx (plus BriefStep.tsx if needed, after Kunal's T-372).
