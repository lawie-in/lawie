# T-613: Order 39 injunction: blank cause title, past date in prayer, wrong suit number, court list gaps

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P1; from the prod quality check of 26 Oct 2026) |
| Owner  | Shashank (drafting); Ajay signs wording and lists |
| Mode   | Full chain |
| Status | To do. Raised by Priya from Anushka's prod FAIL, 26 Oct 2026. Not assigned: starts when the founder lifts the stop. Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md |

## Problem
Cause title leaves both parties blank though para 1 names them; 'Civil Suit No. ___' though Title Suit 245/2026 was given; prayer (a) restrains digging 'on 20 October 2026', a past date (should restrain any construction on the suit land); checks panel says 'Missing part: Prima Facie Case' though para 8 is exactly that; labelled 'Petition'. The court list has no Civil Judge (Junior Division) or Munsif; the State list here includes 'India' and lists Andaman twice and differs from the bail one. Quality report item 4.

## Acceptance criteria
1. Cause title carries both parties; suit number prints as given (Title Suit / Civil Suit).
2. Prayer (a) restrains construction on the suit land, not the dated act.
3. Court list adds Civil Judge (Junior Division) / Munsif; one shared State list everywhere (no 'India', no duplicates).
4. Checks panel no longer flags a part the draft contains; the label is 'Application' not 'Petition'.
5. Ajay signs all wording and the court-level names (legal content).

## Files
Lead lists after Explore (drafting pack legal_content (injunction), court and state lists). Claimed by Priya.
