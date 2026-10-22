# T-498: The intake rounds still ask seven facts already given in the description (bail, ledger on)

| Field  | Value |
| ------ | ----- |
| Status | To do. V1 (major). Priya, 16 Oct 2026 |
| Owner  | Tanvi (free), with Vishal's notes; Ajay sees any wording change |
| Mode   | Full chain |

## Source

Anushka's bail re-run with the ledger on (handoff/quality/2026-10-16-bail-rerun-ledger-on-FAIL.md). The exact description and answers are in that file. T-480 was closed as config because Vishal's golden fixture (27) had no re-asks, but the fixture does not model the question rounds in the app.

## What she saw

Round 1 and round 2 asked again name, in custody since, FIR number, sections, police station, custody status and father's name, all in the description. The brief did read them (ledger on). The brief's "Still unknown" list also still named Age, Residential Address, Brief Facts and Grounds although they were filled.

## What

Reproduce with her exact text through the real question rounds (not the golden harness): which component decides what to ask (checklist questions from the intake step), why the facts the ledger/brief already holds are asked anyway. Fix so a fact read from the description is not asked again, or is shown pre-filled with "Please check" instead of empty. Fix the stale "Still unknown" list.

## Acceptance criteria

- Her description gives no re-asked fact in rounds 1 and 2 (other than those the description does not state); "Still unknown" lists only truly missing fields.
- Test that drives the rounds (or the question builder) with her description; golden fixture 27 stays green.
- First step: read the generation row of document 6ad24921f6dbe58fccc23311 (ledger on/off) before concluding.

## Update 16 Oct 2026, 22:40 IST (Anushka's second re-run, after the update and reseed)

Seven re-asks are now two: "In custody since" (a date) and "Sections Charged in FIR" (a list). The "Still unknown" list is gone. Scope of this ticket is now these two: find why the ledger/extractor facts for those two keys do not mark them as read (key mismatch, date or list type). See handoff/quality/2026-10-16-bail-rerun-2-after-reseed-FAIL.md.
