# T-362 — "Checks run for you" stops reporting things that are in the draft

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay (CLAUSE_CUES is legal content) |
| Mode   | Full chain |
| Status | To do. RELEASE GATE for main (Anushka FAIL). Unassigned. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-200, T-279, T-194 |

## Acceptance criteria

1. The clause-presence check finds earlier bail "None", antecedents, recovery, the sections and the applicant's name when the draft has them (Anushka's six drafts are the test cases).
2. "72 years" (an age) is not flagged as a period.
3. A draft is labelled "starting draft" only for real findings.
4. The plaint's own headings (PRAYER, VERIFICATION, …) are not flagged "may not belong" (14 false warnings today).
5. The export warning count matches the result page's "N blanks to fill".
6. Ajay signs any CLAUSE_CUES change.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.

## ADR-025

**Arjun, ADR-025 (13 Oct):** built on T-373; the checks panel reads rendered clause ids. Do not tune CLAUSE_CUES first.
