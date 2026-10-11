# T-234 — Email and password sign-up and sign-in in the web app

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Rajesh (design review of the form), Madhuri (copy), Lead (build), Arjun (heads-up), Anushka (verdict) |
| Mode           | Design check first, then build, full chain (web, auth) |
| Status         | To do. Needs Rajesh's design check |
| Size           | S to M |
| Depends on     | T-208 (validation messages, merged), T-209 (merged), T-210 (merged). T-221 and T-223 ship with it for v1 |
| Gate           | Before v1 go-live (T-403) |
| Branch         | feature/t-234-password-sign-up |
| Legal sign-off | Not needed for the form. Terms and privacy consent line as today for Google |
| Created        | 2026-10-11 |
| Source         | Founder, 11 Oct 2026 (in the Priya session and on the board): email and password sign-up and sign-in ship in this release, alongside Google. This replaces the 17 May 2026 'Google only for Phase 1' decision. |

## Problem

`apps/web/src/app/(auth)/login/page.tsx` hides the email and password form behind `ENABLE_PASSWORD_LOGIN = false`. The auth API for register and login already works (T-208, T-209, T-210).

## Acceptance criteria

1. The login page offers email and password sign-in and sign-up next to Google, as Rajesh's design check says.
2. Sign-up shows the real validation messages (T-208) and asks for the same consent as Google sign-up.
3. "Forgot password?" goes to T-221's page (ships together, or the link stays hidden until T-221 merges).
4. A new password user gets the same sign-up bonus and referral handling as a Google user; nothing is granted twice.
5. Manual browser check at 375 and 1280 px in the report.

## References

- T-208, T-209, T-210, T-221, T-222, T-223
