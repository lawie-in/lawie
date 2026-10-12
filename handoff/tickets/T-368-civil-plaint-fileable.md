# T-368 — Civil plaint for recovery of money: right court and pleadings

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (templates) + Ajay (sign the template) |
| Mode   | Full chain |
| Status | To do. RELEASE GATE for main (Anushka FAIL). Ajay signed; ready for a lead. Unassigned. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: none (found in the realistic-draft check) |

## Acceptance criteria

1. Addressed to the right civil court for the value and place given (never "Additional Sessions Judge").
2. The cause title carries both parties' names when given.
3. Limitation is pleaded under the article Ajay names (Art. 14/15 for money lent or goods sold, not Art. 23), or left as a blank to check.
4. s.12A Commercial Courts Act: the plaint never pleads its own non-compliance. Where the suit is commercial, it asks whether pre-institution mediation was done and pleads that, or the urgent-relief exemption, or leaves a blank with a warning.
5. No invented interest rate: the rate given, or a blank.
6. Prayer and verification each print once. No "DISCLAIMER" paragraph inside the pleading.
7. Golden-set case from Anushka's Delhi plaint. Ajay signs.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.

## Ajay (13 Oct 2026)

Ajay signed (dff323f, handoff/legal/). The advocate picks the court, never a criminal court. Limitation: Art. 19/21 for loans, 14/15 for goods, otherwise a blank. s.12A: plead mediation done, or urgent relief, or a blank plus a warning. Interest: as given, or a blank. This replaces AC3's "Art. 14/15" with his rows.
