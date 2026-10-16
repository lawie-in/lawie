# T-496: A month and year with no day becomes an invented exact date

| Field  | Value |
| ------ | ----- |
| Status | To do. Severity for v1 with Ajay and Arjun (Priya, 16 Oct 2026) |
| Owner  | Vishal (owns the date normaliser, T-469), Ajay signs |
| Mode   | Full chain (legal content: dates in drafts) |

## Source

Vishal, T-469 (16 Oct 2026): normalizeDate("June 2026") returns 2026-06-20. A date with a month and a year but no day becomes an invented exact date, and the draft then prints a day the advocate never gave.

## What

A partial date must stay partial or become a signed blank ("[To be confirmed: date]"); it must never become an exact day. Ajay rules which: keep "June 2026" as written, or ask for the day. Arjun rules whether this is a v1 blocker (an invented date in a legal draft is a wrong fact) or V1.1. Do it in the same area as T-469 (packages/shared date.ts), after T-469 merges, to avoid a shared-file conflict.

## Acceptance criteria

- No input with a missing day produces an exact date anywhere (ledger, forms, drafts).
- Month-only, year-only and month+year are tested.
- Ajay's ref; the before/after table of every date fixture is read by Ajay.
