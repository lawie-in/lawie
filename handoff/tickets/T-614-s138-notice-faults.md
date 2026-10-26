# T-614: s.138 notice: 'Rs. Rs', false checks flags, State asked though given, irrelevant partner/director fields

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P2; from the prod quality check of 26 Oct 2026) |
| Owner  | Vishal (drafting); Ajay for wording |
| Mode   | Small fix |
| Status | To do. Raised by Priya from Anushka's prod FAIL, 26 Oct 2026. Not assigned: starts when the founder lifts the stop. Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md |

## Problem
'Rs. Rs 3,50,000' in the subject line and the demand; the checks panel says 'Missing part: Cheque Details' though para 4 lists them and flags 'thirty days' (the statutory period) as not in the brief; it asked for the State although Patna was written; partner and director fields are shown though the drawer is an individual. Quality report item 3 (the {{MISSING}} faults are T-611).

## Acceptance criteria
1. Single 'Rs.' in subject and demand.
2. Checks panel: no false flags for contents present or for statutory periods.
3. State is read from the city when given; partner/director fields hidden for an individual drawer.

## Files
Lead lists after Explore (drafting s.138 pack). Claimed by Priya.
