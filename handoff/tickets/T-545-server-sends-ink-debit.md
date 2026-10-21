# T-545: The draft "done" event carries the real Ink debit

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a drafting lead (build), Ajay checks |
| Mode   | Full chain (drafting, web) |
| Status | To do. BEFORE MAIN (Ajay, AJ-521-BC, 21 Oct 2026). Priya |
| Source | T-521 report; Ajay |

## Problem
The "{n} Ink used" chip shows the quoted cost (T-388) because the SSE `done` event carries no debit. Ajay allowed this for v1 because the quote equals the charge. That stops being true if a quote and a charge can differ (see T-540 coupons, refunds on release).

## Acceptance criteria
1. The `done` event carries the Ink actually settled for the run (0 and absent are different: no settle means no field).
2. Web shows the chip from that field only; none on a failed or released draft; never "0 Ink used".
3. Tests for a settled run, a released run and an old client ignoring the field.
4. Ajay confirms the wording at READY.
