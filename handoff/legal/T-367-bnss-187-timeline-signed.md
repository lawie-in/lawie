# T-367: BNSS 187 remand and default-bail date (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST.

## Rules

1. **Police custody (BNSS 187(2)).** Police custody totals at most 15 days. The Magistrate may authorise it in one go or in parts, at any time within the first 40 days (offences with a 60-day period) or the first 60 days (offences with a 90-day period). After that window, only judicial custody.
2. **Total detention before charge sheet (BNSS 187(3)).** The limit is 90 days where the offence is punishable with death, imprisonment for life, or imprisonment of 10 years or more, and 60 days for any other offence. Cite **187(3)**, not 187(4).
3. **Day count (ED v. Kapil Wadhawan, Supreme Court, 2023).** The date of the first remand order is day 1.
   - Last day of the period = first remand date + 59 days (60-day period) or + 89 days (90-day period).
   - If no charge sheet has been filed by the end of that last day, the right to default bail arises the next day: first remand date + 60 or + 90 days.
   - Example: first remand on 1 January 2026, 60-day period. The last day is 1 March 2026, and default bail is available from 2 March 2026.
   - Law report citation: verify before quoting (none is used in user text).

## Lines shown in the tracker (exact)

| Id | Text |
|---|---|
| R1 | `Police custody: up to 15 days in total, in one go or in parts, within the first {40/60} days of detention (BNSS 187(2)).` |
| R2 | `Detention limit before charge sheet: {60/90} days (BNSS 187(3)), counting the date of the first remand as day 1.` |
| R3 | `Last day for the charge sheet: {date}. If none is filed by then, default bail is available from {date+1}.` |

Dates are printed as `4 April 2026`. Tests pin R1 to R3 and the worked example, including a leap-year February.

## Addendum 1: Shashank's seven points, 13 Oct 2026

| # | Ruling and exact text |
|---|---|
| 1 | Input label: `Date of first remand`. Help text below it: `The date the Magistrate first ordered the accused into custody. This is day 1.` Start milestone: `Day 1: first remand`. Remove "All custody periods begin from this date". |
| 2 | Yes. The 40/60-day police window uses the same day-1 rule: its last day is first remand + 39 or + 59 days. |
| 3 | OK. With no fixed period, show `Depends on the offence. Check BNSS section 187.` and no police-custody date. |
| 4 | Milestone label: `Last day for police custody (day {40/60})`. "Police Custody Limit" reads as if police custody could last 40 or 60 days, so it goes. |
| 5 | Remove the remand breakdown. A "days 1 to 15 police, then judicial" layout suggests police custody must come first and all in one go; R1 already says it may be in parts at any time in the window. |
| 6 | Remove both unsigned lines: the "Default bail accrues…" line and the "stringent conditions" sentence. R2 and R3 say it. |
| 7 | Replace the Legal Reference item with exactly: `BNSS 187(3): if the investigation is not completed within 60 or 90 days, the accused is to be released on bail if prepared to and does furnish bail (default bail).` |

The worked example stands: first remand on 1 January 2026 gives a last day of 1 March 2026 (police window: 9 February 2026, the 40th day), and default bail from 2 March 2026.

## Addendum 2: remaining labels, 13 Oct 2026

| # | Where | Exact text |
|---|---|---|
| 1 | Start milestone description | `The date the Magistrate first ordered the accused into custody. This is day 1.` (the same as the input help text) |
| 2 | defaultBailExplanation | Replace every variant with R2 followed by R3. Drop the unsigned sentences, including "indefeasible right" and the "&lt; 10 years" wording. |
| 3a | Milestone | `Last day for the charge sheet (day {60/90})` |
| 3b | Milestone | `Default bail available from (day {61/91})` |
| 3c | Page day label | `Day {61/91}: default bail (BNSS 187(3))` |
| 3d | Section heading | `Default bail (BNSS 187(3))` |
| 3e | bnssSectionTitle | `BNSS 187(3): detention limit before the charge sheet` |
| 3f | Page disclaimer | `This tracker counts dates from the date you enter. It is not legal advice. Check the remand orders and the BNSS before relying on it.` |

"Chargesheet" is spelt `charge sheet` everywhere on this page.
