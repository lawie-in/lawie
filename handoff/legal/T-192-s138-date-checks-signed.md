# T-192: s.138 NI Act date checks (signed logic)

Signed: Ajay (CLO), 12 Oct 2026 IST. Applies to `legal_notice_s138` only. Code computes everything below; the model never computes or states a date difference.

## Law

- Proviso (a): the cheque must be presented within six months from the date it is drawn, or within its validity, whichever is earlier. RBI has set cheque validity at three months (verify: circular reference; it is not used in any user-facing text). In practice, then, three months, or less if the cheque says less.
- Proviso (b): the payee must give the drawer written notice within thirty days of receiving the bank's information that the cheque was returned unpaid.
- Counting: General Clauses Act 1897, s.9. The first day ("from" or "of") is excluded and the last day is included. A month is a calendar month.

## Inputs (ledger facts only)

| Key | Label (exact) | Required |
|---|---|---|
| L1 | `Date on the cheque` | (a) |
| L2 | `Last date of validity printed on the cheque, if any` | No |
| L3 | `Date the cheque was presented to the bank` | (a) |
| L4 | `Date the return memo was received` | (b) |
| L5 | `Date the notice is sent` | (b) |

L3 is the date shown on the return memo. L5 is the date of dispatch. Sending within the period is enough; when the drawer receives the notice is not part of this check.

## Computation

- (a) Validity end = the earlier of: (i) L1 plus 3 calendar months, the same date number (or the last day of that month if the date number doesn't exist: 30 Nov → 28/29 Feb); (ii) L2, if given. If L2 is later than (i), use (i).
  - Pass if L1 ≤ L3 ≤ validity end.
- (b) Last day = L4 plus 30 days.
  - Pass if L4 ≤ L5 ≤ last day.
- Worked examples:
  - L1 10 Jan 2026 → validity end 10 Apr 2026: presented 10 Apr passes, 11 Apr fails.
  - L4 5 Mar 2026 → last day 4 Apr 2026: sent 4 Apr passes, 5 Apr fails.
- Tests per AC7: one day inside, the last day, one day outside, the month-end case (30 Nov, 31 Jan) and the leap year.

## Result lines (exact; dates as `10 January 2026`)

| Id | When | Text |
|---|---|---|
| A1 | (a) pass | `Presented in time: the cheque dated {L1} was presented on {L3}, within its validity, which ended on {end}.` |
| A2 | (a) L3 after end | `Not presented in time: the cheque dated {L1} was presented on {L3}, after its validity ended on {end}. Check the dates before sending the notice.` |
| A3 | (a) L3 before L1 | `Check the dates: the cheque was presented on {L3}, before the date on the cheque, {L1}.` |
| A4 | (a) L1 or L3 missing | `Presentation in time not checked.` followed by `[To be confirmed: {label}]` for each missing input |
| B1 | (b) pass | `Notice in time: the return memo was received on {L4} and the notice is sent on {L5}, within 30 days (last day {end}).` |
| B2 | (b) L5 after end | `Notice not in time: the notice is sent on {L5}, after {end}, the last of the 30 days from receipt of the return memo on {L4}. Check the dates before sending.` |
| B3 | (b) L5 before L4 | `Check the dates: the notice is sent on {L5}, before the return memo was received on {L4}.` |
| B4 | (b) only L5 missing | `Send the notice on or before {end} (30 days from receipt of the return memo on {L4}).` followed by `[To be confirmed: Date the notice is sent]` |
| B5 | (b) L4 missing | `Notice in time not checked.` followed by `[To be confirmed: {label}]` for each missing input |

- A1 unlocks `presented_within_validity`; B1 unlocks `notice_within_thirty_days`. Every other line keeps its entry banned.
- A missing L2 is not a missing input; the check uses three months.
- These lines go in the brief for the advocate, never into the notice body.

## Out of scope

The complaint's own limitation (s.142) and the 15-day payment period after the notice is received.
