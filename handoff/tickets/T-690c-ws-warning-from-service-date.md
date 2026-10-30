# T-690c: Written statement limitation warning when only the service date is given

Status: ASSIGNED tanvi 30 Oct 2026 (v1.3.0, full chain). Was: backlog (ready; Ajay ruled AJ-690c 8b650c1a). Raised 30 Oct 2026 by Priya from Anushka run 5g on prod v1.2.8 (PASS).

The 90-day warning (T-690b) fires only on the typed "days from service" figure. If the brief has the service-of-summons date but the days are blank, nothing warns, and the draft carries "[To be confirmed: days from service…]".

Gate: Ajay rules whether the date alone should warn, and with what wording (legal content).

## Acceptance criteria (after Ajay)
1. With a service date and blank days, the days are computed from the date (or the warning shows), exactly as Ajay rules.
2. Confirm still works and Ink is charged as usual.
3. Tests for the date-only, days-only and both cases.

## Ajay AJ-690c (8b650c1a)
- If the days are blank and the service date is valid: compute the days in IST, from the service date to today. Over 90 shows the SAME signed warning, with no new wording.
- If both are given: warn when either one is over 90. A future or invalid date gives no warning.
- The computed figure is for the warning only. It never goes into the draft or the ledger, and the blank stays. Soft warning only.
- The tests are in Ajay's run5-rulings. Legal content: Ajay byte-checks the final SHA.
