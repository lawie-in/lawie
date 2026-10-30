# T-615: No-template drafts (vehicle release on superdari): wrong opposite party, empty fields, advocate details missing

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P2; from the prod quality check of 26 Oct 2026) |
| Owner  | Shashank (drafting) |
| Mode   | Small fix |
| Status | To do. Raised by Priya from Anushka's prod FAIL, 26 Oct 2026. Not assigned: starts when the founder lifts the stop. Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md |

## Problem
The brief named the court (CJM Patna) as the opposite party; 'person the document is for' and 'what is asked for' were empty though in the description; the applicant address given in round 1 is missing; the advocate's name and enrolment number are blank though the account has them; one blank reads '[To be confirmed: a detail we could not find in your words]'. Quality report item 5.

## Acceptance criteria
1. Opposite party defaults to the State (or is asked), never the court.
2. Described subject and relief fill the brief; round-1 answers carry to the draft.
3. Advocate name and enrolment come from the account.
4. Blank labels name the missing detail.

## Files
Lead lists after Explore (drafting generic path). Claimed by Priya.
