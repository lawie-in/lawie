# T-364 — Ink cost and plan shown in the app match the pricing page

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + billing read) |
| Mode   | Small fix |
| Status | To do. RELEASE GATE for main (Anushka FAIL). Unassigned. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-227, T-238 |

## Acceptance criteria

1. The Ink cost of the draft shows before "Confirm brief and continue".
2. Dashboard and settings show the Ink balance, not "8 of 5 documents used — 0 remaining".
3. Settings offers the plans exactly as the pricing page shows them (Pro ₹1,999 for 150 Ink, …). No "₹799 Unlimited". One source of plan data for both pages.
4. Tests for 2 and 3.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.
