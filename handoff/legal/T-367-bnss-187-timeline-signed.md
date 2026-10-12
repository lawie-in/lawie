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
