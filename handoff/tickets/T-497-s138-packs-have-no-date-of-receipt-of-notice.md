# T-497: The s.138 packs have no date-of-receipt-of-notice field

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1 (Arjun, 16 Oct 2026; Ajay asked, ref b37ed330). Fold with T-476. Priya |
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

## Arjun's ruling (16 Oct 2026)

V1.1. The only s.138 pack in v1 is the demand notice (legal_notice_s138.json). It prints the period relatively, "within fifteen days of receipt of this notice", with no computed date; a notice cannot know its own receipt date. The field notice_received_date belongs to the s.138 complaint pack (T-476), which is not in v1. Fold into T-476. Acceptance: the field plus its intake question on the complaint pack; the 15-day date and the one-month date (s.142(1)(b)) are computed only when the receipt date is given, blank otherwise, per T-496's rule. Ajay confirms the reading of b37ed330.

## Ajay confirms (b37ed330, 16 Oct 2026)

Arjun's reading is right: the demand notice prints "within fifteen days of receipt of this notice" and needs no receipt date, so v1 is fine. The complaint (T-476) needs the receipt date: the cause of action arises when the 15 days end, and s.142(1)(b) gives one month from then. Compute both only from given dates; otherwise blank. A complaint filed late takes the T-472 pattern: a delay paragraph plus a condonation application under the proviso to s.142(1)(b).

## Arjun (16 Oct 2026) — V1.1

The only s.138 pack in v1 is the demand notice (legal_notice_s138.json), which prints the period relatively ("within fifteen days of receipt of this notice") and computes no date; a notice cannot know its own receipt date. notice_received_date belongs to the s.138 complaint pack, not in v1. Fold with T-476. AC: field + intake question on the complaint pack; the 15-day and one-month (s.142(1)(b)) dates computed only when given, blank otherwise (T-496 rule).
