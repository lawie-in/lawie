# T-469: Read a date that follows a neutral label ("remand 4 June 2026")

| Field  | Value                                                                       |
| ------ | --------------------------------------------------------------------------- |
| Status | To do. V1.1, not a v1 blocker. Split out of T-453 (Priya, 15 Oct 2026)      |
| Owner  | Lead (build), Ajay (checks the allowlist), Arjun (design call)              |
| Mode   | Full chain (touches packages/shared, held by one lead at a time)            |

## Source

Vishal's T-453 follow-up. His date-label strip failed its second review: filler words such as "next" or "filed" change which date is meant. He stopped and escalated to Arjun; no third attempt without a ruling. Today these dates come out blank (the draft shows a "to be confirmed" blank), which is a missing fact, not a wrong one, so v1 does not wait for this.

## What

Let the date parser read a date after a label, for example "remand 4 June 2026" or "FIR dated 12.03.2026".

## Rules (Ajay, 15 Oct 2026, T-245 file)

- Only an allowlist of neutral labels is read. Ajay checks the list at merge.
- A read date fills only the field its label names (remand → remand date, FIR → FIR date).
- A label not on the list, or a date with two labels, stays blank.
- Qualifiers ("before", "not later than", "around", "till", "on or about") and filler words ("next", "filed", and similar) stay blank.

## Files (to confirm after Explore)

packages/shared/src/utils/normalize/date.ts and its test; apps/drafting/src/services/fact-ledger.service.ts (normalizeForItem only) and its t147b tests; scripts/golden-set/lib/calibrate.ts if the before/after table is needed.

## Acceptance criteria

- Neutral-label dates are read into the right field; every case in the rules above has a test.
- Before/after table on the golden set sent to Ajay.
- Ajay's ref and the allowlist in the merge body.

## Arjun's scope (15 Oct 2026, 22:09 UTC; replaces the loose wording above where they differ)

- date.ts accepts a leading label before a date ("remand 4 June 2026", "FIR dated 12.03.2026", "on 4th June, 2026") without changing its meaning.
- Qualifiers ("before", "after", "by") are never read as exact dates.
- Fillers are limited to an explicit allowlist: on, dated, date, of, the, dt, w.e.f, wef.
- A label maps to a field only when the label names the field (Ajay's rule): "next" → next_hearing_date only; "filed" does not become order_date.
- Tests for every case. Before/after table of every date fixture for Ajay.
- Legal-content gate: Ajay. Owner: Vishal, after T-453 closes (his R1+R2 branch carries the work). Mode: full chain.
- Not blocking v1, unless Anushka reports unrecognised dates in the bail flows.

## Arjun (16 Oct 2026) — go

Vishal may edit packages/shared/src/utils/normalize/date.ts and its tests, nothing else in shared. Conditions as ticketed (qualifier allowlist; Ajay's label-must-name-the-field rule; before/after table of every date fixture read by Ajay before the reviewer); full chain; shared merge waits for CI (rule 7). T-496 rides the same chain as a second commit. Off the v1 critical path: it does not hold the develop merge.
