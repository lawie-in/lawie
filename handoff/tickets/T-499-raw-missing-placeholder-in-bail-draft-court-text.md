# T-499: A raw {{MISSING: date of FIR}} placeholder is printed in the bail draft's court text

| Field  | Value |
| ------ | ----- |
| Status | To do. V1 (Priya, 16 Oct 2026; Ajay's acbec79f rule) |
| Owner  | Tanvi (after T-498) or the lead who is free; Ajay signs the converted text |
| Mode   | Full chain |

## Source

Anushka's bail re-run, 16 Oct 2026 (handoff/quality/2026-10-16-bail-rerun-ledger-on-FAIL.md): para 2 and prayer (a) print "FIR No. 412/2026 dated {{MISSING: date of FIR}}". Expected "[To be confirmed: date of FIR]", highlighted like the other blanks. Vishal flagged the same (T-471 follow-up: the web editor shows raw {{MISSING}}; Ajay: separate v1 ticket).

## What

Ajay's rule (acbec79f): the ledger form `{{MISSING: ...}}` is converted to `[To be confirmed: ...]` before the user sees the draft. T-471 did it for the s.138 path only. Find every path that can show a raw `{{MISSING: ...}}` to the user (draft text, editor, result page, exports, copy) for all packs and fix them in one place; highlight the converted blank like the others; the blank count counts them.

## Acceptance criteria

- No raw `{{MISSING` reaches the user from any pack or path; the same blank appears in the editor, export and blank count.
- Tests for bail_regular with a missing FIR date, plus a scan test over every pack's rendered output.

## Ajay's ruling (088fc4f7, 16 Oct 2026)

No change to acbec79f. Convert {{MISSING}} in every part of the output, prayer included, with a test.
