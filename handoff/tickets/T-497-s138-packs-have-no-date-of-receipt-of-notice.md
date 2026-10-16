# T-497: The s.138 packs have no date-of-receipt-of-notice field

| Field  | Value |
| ------ | ----- |
| Status | To do. Severity with Arjun (v1 or V1.1); Ajay asked for the ticket (ref b37ed330, 16 Oct 2026). Priya |
| Owner  | Lead who is free after the v1 blockers; Ajay signs the wording |
| Mode   | Full chain (legal content path) |

## Source

Ajay, 16 Oct 2026, ref b37ed330: the s.138 packs have no date-of-receipt-of-notice field, yet the 15-day period (the drawer's time to pay) and the cause of action run from the date the drawer receives the notice.

## What

Add `notice_received_date` to the s.138 packs (the notice and the complaint packs that use it), with an intake question for it. Ajay writes the question and the field label. Never default or invent the date (T-496: a partial date counts as unknown; the blank reads "[To be confirmed: exact date of notice_received_date]" and nothing is computed from it). Where the pack computes limitation or the 15-day period, it uses this date.

## Acceptance criteria

- The s.138 packs ask for the date of receipt of the notice; the intake brief asks it; the draft uses it where the 15-day period and the cause of action are stated.
- Not given or partial: signed blank, nothing computed.
- Same files as T-476 (s.138/141 complaint pack): coordinate or fold into T-476; Ajay's ref; goldens move only as he signs.
