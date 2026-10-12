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

## Addendum 1 (12 Oct 2026 IST): unlock texts, fields, complaint

| Item | Ruling |
|---|---|
| `presented_within_validity` twin text (`unlocked_by` A1) | `The said cheque dated {L1} was presented for payment on {L3}, within the period of its validity.` |
| `notice_within_thirty_days` twin text (`unlocked_by` B1) | `This notice is issued within thirty days of the receipt, on {L4}, of the information from the bank regarding the return of the said cheque unpaid.` |
| Dates in twin texts | Filled by code from the ledger, in the `10 January 2026` form. The model never writes them. |
| Fields | Add L2, L4 and L5 to `legal_notice_s138` with the exact labels above. L1 and L3 are the existing `cheque_date` and `presentation_date`. |
| L5 | Given by the advocate. When it is given, the notice's date line uses L5. When it is missing, the date line stays as today's date, the entry stays banned, and the brief shows B4. |
| `ni_complaint_s138` | Overrides both entries back to banned (never). Extending the checks to the complaint needs a separate ticket and a new sign-off. |

## Addendum 2 (12 Oct 2026 IST): FACTS display, conflicting L2, date format

| Item | Ruling |
|---|---|
| Model-facing FACTS display on a pass | `Presented in time: yes (checked by Lawie from the dates given)` / `Notice in time: yes (checked by Lawie from the dates given)`. A1/B1 appear only in the brief for the advocate; the notice may use only the twin texts. |
| L2 unresolved (conflicting values) | Counts as missing: A4 with `[To be confirmed: Last date of validity printed on the cheque, if any]`. No fallback. Only an absent L2 falls back to 3 months. |
| Date format on the notice's date line | `4 April 2026` (no leading zero) for both L5 and today's date. |

## Build sign-off (12 Oct 2026 IST)

- Build `527421d` approved. Since `11991f9` it changes the leaf order (inputs first, computed key last), adds the L5 leaf, and uses the signed L1/L3/L4 labels.
- `_averments/legal_notice_s138.json` SHA-256: `80905077cc412fac8e6041bf40dd97910be57aec959a2c37642cbafdd676fb9d`. Any change to that file voids this sign-off.
- `return_memo_received_on` now unlocks from L4. Approved.
- The date format is deferred to T-340.

## T-342 sign-off (12 Oct 2026 IST): reading L2, L4 and L5 from the description

Build `59eff64` (`fix/t-342-s138-date-meanings`) is approved: kinds `memo_received`, `notice_sent` and `cheque_validity`, scoped to s138 packs only.
- Questions use the L4 and L5 labels.
- `not_with`: dated, दिनांक, dinank, dt.
- "received the memo" counts as L4. Approved, because in an s138 pack the memo is the return memo.
- A bare "validity" with a cheque word counts as L2. Approved and fail-safe: L2 can only shorten the 3-month window (the computation caps it), so a misread can never pass a late presentation.
- `date-meanings.json` `_meta.signed` may cite this section.
