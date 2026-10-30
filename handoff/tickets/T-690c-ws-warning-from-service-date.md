# T-690c: Written statement limitation warning when only the service date is given

Status: MERGED into develop_staging 2122ecef (30 Oct 2026, CI 1771 green, Ajay approved a3f2b994). Was: READY (tanvi, fix/t-690c-warning-from-service-date @ a3f2b994, 30 Oct 2026); waiting on Ajay's byte check. Was: ASSIGNED tanvi 30 Oct 2026 (v1.3.0, full chain). Was: backlog (ready; Ajay ruled AJ-690c 8b650c1a). Raised 30 Oct 2026 by Priya from Anushka run 5g on prod v1.2.8 (PASS).

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

## Deferred (T-690c)

- `preflight.service.ts` lines 247-248: stale comment names `wsOver90DaysWarningApplies`; the helper is now `wsOver90DaysApplies`. Comment only.
- `intake-brief.ts` ~232: the `Brief.soft_findings` doc comment says "when days_from_service is over 90"; incomplete now that the service date can also trigger it.
- Question for Ajay: the pack also has a required `ws_filing_date` (form flow). With service 2026-06-01, filing 2026-07-20, days 49 and today 2026-10-30, the warning fires, because AJ-690c counts to today, not to the filing date. The code does exactly what he ruled; he may want filing-date counting on the form flow later.
- A service date read from the description text counts as held under AJ-690c. A date such as "we received the legal notice on 1 June 2026" could be placed in `summons_service_date` by the brief's placement rules and warn. Existing placement behaviour, now visible.
- DD.MM.YYYY and other date forms are rejected on purpose (no warning). Only YYYY-MM-DD is read.
