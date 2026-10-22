# T-496: A month and year with no day becomes an invented exact date

| Field  | Value |
| ------ | ----- |
| Status | Merged into develop_staging 7236c1d7, 16 Oct (Ajay 604af4bd, 8f0d980a, c585cf80; byte check 470b51e6). A partial date gives no date; the default-bail timeline computes nothing from it. CI on 7236c1d7 pending. Priya |
| Owner | Vishal (same chain as T-469, second commit with its own tests), Ajay signs |
| Mode   | Full chain (legal content: dates in drafts) |

## Source

Vishal, T-469 (16 Oct 2026): normalizeDate("June 2026") returns 2026-06-20. A date with a month and a year but no day becomes an invented exact date, and the draft then prints a day the advocate never gave.

## What

A partial date must stay partial or become a signed blank ("[To be confirmed: date]"); it must never become an exact day. Ajay rules which: keep "June 2026" as written, or ask for the day. Arjun rules whether this is a v1 blocker (an invented date in a legal draft is a wrong fact) or V1.1. Do it in the same area as T-469 (packages/shared date.ts), after T-469 merges, to avoid a shared-file conflict.

## Acceptance criteria

- No input with a missing day produces an exact date anywhere (ledger, forms, drafts).
- Month-only, year-only and month+year are tested.
- Ajay's ref; the before/after table of every date fixture is read by Ajay.

## Rulings (16 Oct 2026)

- Ajay 604af4bd: a month with no day, e.g. "June 2026", is read today as 20 June 2026, which is an invented fact. It must stay blank. V1 ticket.
- Reach (Vishal): normalizeDate is called by fact-ledger.service.ts (normalizeForItem, the ledger path, now on for v1), fact-verifier.ts (draft checks) and fact-diff-log.ts (logs only). Forms and the no-ledger brief path do not use it. So a date span from the advocate's description could become a ledger fact "20 June 2026" and print in the draft.

- Arjun: v1 blocker. normalizeDate returns no date for a partial (month+year, year-only, "mid-June"); the field stays blank or asked, never a synthesised day. Same file as T-469 (date.ts, Vishal's claim), so it goes to Vishal in the same chain as a second commit with its own tests, not to another lead. Ajay's before/after table covers both.
- Ajay 8f0d980a: never supply a day. Calculation dates (limitation, s.138, default bail, notice periods): a month and year alone counts as unknown. Ask for the day; if none is given, print "[To be confirmed: exact date of {field}]" and compute nothing. Narrative dates: print as written ("in June 2026"), never with a day added. Same class as T-472.
