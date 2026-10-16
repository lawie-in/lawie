# T-351 — No free credits for an unverified email sign-up

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (auth). Arjun (glances) |
| Mode   | Small fix (auth) |
| Status | Merged into develop_staging (eae46a9), 12 Oct 2026. Release gate cleared. Anushka tests on develop |

Founder, 12 Oct 2026: with email and password sign-up, nothing checks the address, so anyone can make many accounts and get 5 Ink each instantly. Verification emails need T-220 (sending), which is not ready. This closes the money hole now; T-223 adds the verification link later.

Decision (Priya, on the founder's delegation, 12 Oct 2026): tighter than T-223's option B. An email sign-up gets no free Ink until its address is verified. Google sign-in counts as verified.

## Acceptance criteria

1. `grantSignupBonus` and `tryGrantDailyLoginBonus` (`apps/auth/src/services/credit-bonus.service.ts`) grant nothing unless the user's `authProvider` is `google` or `emailVerified` is true.
2. A Google sign-up still gets the 5 Ink sign-up bonus and the daily bonus, as today.
3. An email sign-up gets 0 Ink and no daily bonus until verified. When T-223 marks the address verified, the sign-up bonus is granted once (not twice).
4. Tests for email unverified, email verified and Google, sign-up and daily bonus.
5. Logs keep the user id only, no address (T-210).

## Out of scope

- Sending the verification email and the verify link (T-223, needs T-220).
- What the web app shows a zero-balance unverified user (T-223 adds the "verify your email" prompt).

## Ruling (Priya, 12 Oct 2026)

- Option A: a user with `googleId` set also counts as verified (older Google users stored as 'email' before T-299, and email accounts that linked Google). Google proved the address; an attacker still needs a real Google account per account.
- The existing auth tests that assume an unverified email user gets the bonus or seed (signup-bonus, t298, t234, t299, t234-helpers) move to verified users. Test files only, inside this ticket.
- Follow-up: the unused `tryGrantDailyLoginBonus` in `apps/drafting/src/services/credits.service.ts` has no check; delete it in a later drafting ticket (nothing calls it today).
