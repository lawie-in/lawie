# T-234: login page copy, legal check (signed, 12 Oct 2026 IST)

Ajay (CLO). Read: `handoff/marketing/copy/login-page-t234.md` (Meera's sign-off of 12 Oct). Only the rows Meera sent me; all other rows are Meera's. Ship the "Final" strings exactly.

| Row | Final string | Mark |
|---|---|---|
| R5 | `Code applied{ — label}. {n} Ink will be added when you create your account.` | Approved, conditions 1–3 |
| R6 | `Code applied. Bonus Ink will be added when you create your account.` | Approved, conditions 1–3 |
| R10 | `{n} Ink added to your account when you sign up` | Approved, conditions 1–3 |
| R11 | (deleted) | Approved: the daily bonus is not promised anywhere (T-201, T-223) |
| R12 | `No card needed to sign up.` | Approved: true only while sign-up asks for no card (Priya, 12 Oct). If a card step is ever added, the line goes first |
| R14 | `Your bonus is added when you create your account.` | Approved, conditions 1–3 |
| C1 | consent line, unchanged | Confirmed word for word, link text exactly "Terms of Service" and "Privacy Policy" |
| Footer | `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` | Approved: same line as the terms §3 and T-253 panel footer. "AI-assisted drafting tool — not a substitute for legal advice." goes |

Conditions on the Ink lines
1. `{n}` is the amount the server actually credits for that code, read from the same source that credits it. Never a number typed into the page.
2. The bonus is credited for a **new** account only, on both email and Google sign-up (Meera's condition 4). If an existing account uses a code, show R7, never R5/R6.
3. If referral Ink can expire, is capped, or is lost on any event, these lines are not complete: tell me before release and I will add the limit. Today I have nothing saying it does.

## Addendum 1 (12 Oct 2026 IST): codes that expire or run out

Facts from Priya (`apps/auth` referral.service.ts): each code may have an expiry date and a use cap; the Ink goes to top-up Ink, which has no expiry today; an expired or used-up code is silently ignored at sign-up. T-298: the grant may not land at all (being checked).

1. **Release gate.** R5, R6, R10 and R14 promise Ink. They do not ship until T-298 shows the grant is credited on a real sign-up (email and Google). Until then, hide the referral box and modal.
2. **No silent drop.** If a code that showed R5/R6 is no longer valid when the account is created, the account is still created and the user sees, once:
   `Your referral code was no longer valid, so no bonus Ink was added.`
3. Priya's line is approved as small text under the referral box (optional, Meera's call to show it):
   `Referral codes may expire or have limited uses.`
4. If Vikram makes top-up Ink expire, R5, R6, R10 and R14 must say so; tell me first.

## Addendum 2 (12 Oct 2026 IST): existing account via Google after a code

When an existing account signs in through "Continue with Google" from Create account after R5/R6 showed, show once, after sign-in, with a "Continue" button (replaces condition 2's R7 for this path only):

`Referral bonuses are for new accounts only, so no bonus Ink was added.`

## Addendum 3 (12 Oct 2026 IST): versions recorded at sign-up; code never applied

1. The consent line covers two documents, so record both: Terms `2026-06-01` and Privacy Policy `2026-10-12`. Preferred: a separate `privacyVersion` field. If that is out of scope, `termsVersion` holds `terms:2026-06-01;privacy:2026-10-12`. Bump the privacy part whenever "Last updated" on /privacy changes (next: T-308/T-310).
2. A code typed but never applied (R5/R6 never shown) and invalid at sign-up shows, once:
   `Your referral code was not valid, so no bonus Ink was added.`
   Addendum 1's "no longer valid" line stays for a code that showed R5/R6 and then expired.
