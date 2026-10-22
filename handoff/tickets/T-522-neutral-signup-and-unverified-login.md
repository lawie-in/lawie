# T-522: Neutral sign-up answer and unverified-login rule (from T-517)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), Ajay (copy), an auth lead (build) |
| Mode   | Full chain (auth, web) |
| Status | To do. V1.1, due before any release after v1 (Vishal's T-517 report, 21 Oct 2026). Priya |
| Source | Ajay AJ-511-M3; T-517 findings |

## Problem
Signed copy (M3) wants the same "Check your email" screen for a new and an existing email. The build differs: an existing email returns 409, new sign-ups are logged straight in, and login never blocks unverified users. The server password rule is 8+ characters with upper, lower and a digit.

## Acceptance criteria
1. Arjun rules whether sign-up reveals an existing account, and whether unverified users can log in; written in this ticket.
2. Auth and web are changed to match the ruling; the signed copy and the behaviour agree (Ajay checks).
3. The web password hint states the real server rule.
4. Tests for new and existing email, unverified login and the password rule.
5. AJ-517-M18: a new account created through Google from the Sign in tab is detected and asked for consent with the M16 box at its next sign-in, recorded as its own acceptance. v1 ships without this on Ajay's conditions (the T-234 "By continuing" line stays beside the Google button with links to both documents, and the stored record keeps `acceptedVia: 'google'`); his sign-off does not extend past v1, so this ships before any release after v1.

## Arjun (22 Oct 2026) — ruling on AC1

**(1) Neutral sign-up. Yes — the same "Check your email" screen for a new and an existing address.** No 409, no "account exists", and sign-up **no longer logs the user straight in**.
- New address: create the account unverified, send the verification link. Clicking it verifies **and** signs the user in (one-time token, 30 min, single use).
- Existing address: create nothing; send that address a different mail — "Someone tried to sign up with this email. If it was you, log in or reset your password" — with login and reset links. No information leaves the server that distinguishes the two cases: same JSON, same status, response padded to a constant minimum latency (≈ 300 ms) so timing does not tell either.
- Rate limits: per IP and per email on sign-up (T-512's per-account throttle covers the email side); a repeated existing-address sign-up sends at most one mail per hour per address.
- Google sign-in is unchanged (the provider has verified the address).

**(2) Unverified login: allowed, with a fence.** A user who signed up but has not clicked the link can log in with their password and reach the dashboard, which shows a persistent "Verify your email" bar with a resend button (resend throttled, one per 2 min, five per day). What they cannot do until verified: **generate a draft, buy anything, or receive Ink** — `requireVerifiedEmail` already guards billing (T-223); it goes on the generate routes and the free-Ink grant too. No grace period. Reason: neutral sign-up means a password alone must not unlock a free Ink grant for an address the person does not control.

**(3) Password hint: state the real rule, and keep the rule.** "At least 8 characters, with an upper-case letter, a lower-case letter and a digit." The hint and the server validator come from one shared constant in `packages/shared` so they cannot drift. Changing the rule itself (length over composition, per OWASP) is a separate ticket, after v1.

Scope: auth (sign-up, verify-and-login token, resend), gateway/drafting (`requireVerifiedEmail` on generate), web (neutral screen, verify bar, hint from the shared constant). Touches legal copy (Ajay's AJ-511-M3 text is the screen copy; AJ-517-M18 is the item) — Ajay sign-off reference on the ticket. Full chain. Anushka's run covers both flows.
