# T-619: Raw court id 'bihar_sessions_patna' shown; 'Police Station Kadamkuan Police Station'; '[To be confirmed: relation]'

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P2; from the prod quality check of 26 Oct 2026) |
| Owner  | Kunal (web) + drafting lead |
| Mode   | Small fix |
| Status | To do. Raised by Priya from Anushka's prod FAIL, 26 Oct 2026. Not assigned: starts when the founder lifts the stop. Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md |

## Problem
The court shows as 'bihar_sessions_patna' in the document header, My documents and Document info; para 2 prints 'Police Station Kadamkuan Police Station' (also seen on 16 Oct); '[To be confirmed: relation]' appears before the father's name although the relation was given. Quality report item 1.

## Acceptance criteria
1. Court names show as display names everywhere.
2. 'Police Station' is never doubled.
3. Relation (S/o, D/o) fills from the answer.

## Files
Lead lists after Explore (web (header, My documents, Document info) and drafting bail pack). Claimed by Priya.

## Added by part 2 (item 11)
Anticipatory bail para 2 prints 'Police Station Mahila Police Station' (same doubled-label bug); the draft says 'himself or herself' although Male was chosen (pronoun should follow the chosen gender).
