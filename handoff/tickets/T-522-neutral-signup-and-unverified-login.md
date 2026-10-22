# T-522: Neutral sign-up answer and unverified-login rule (from T-517)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), Ajay (copy), an auth lead (build) |
| Mode   | Full chain (auth, web) |
| Status | In build: Vishal (22 Oct 2026). Rulings: Arjun (design) and Ajay AJ-522-M1 to M7 (copy, fence confirmed). Mode: full chain (auth, gateway/drafting, billing refusals last, email-worker, shared, web). Priya |
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

## Arjun's detailed rulings (22 Oct 2026, relayed by Vishal; Arjun's full text is in Vishal's report)
1. Tokens get a kind, `signin` or `verify`. Sign-up and resend links are `signin`: 30 min, single use, they sign the user in. The T-358 notice link is verify-only, 7 days. A missing kind counts as `verify`. The token is used up only by a POST. **Ship gate: no merge while the verify mail says "24 hours"** (Ajay re-signs the verify mail). ADR-001 (email-link sign-in) by Arjun; it does not block the build.
2. Referral Ink is deferred to verify; `grantReferralInk` is fenced. `referralApplied` leaves the register response. `GET /me` gets `referralStatus`; the dashboard shows the notice once (wording: Ajay).
3. Sign-up throttle in auth (Redis, T-221 pattern): IP 20/h then 429; email hash 5/h then 429; the M5 mail at most one per hour per address, silent; store failure then 503.
4. Neutral answer: 202 `{status:'check_email'}` with no-store, after 422 validation first. Existing address: dummy bcrypt, 500 ms floor. E11000 counts as the existing-address outcome.
5. New public `POST /verify-email/resend-by-email`, always the neutral 202. Verified or Google addresses get nothing. The expired page offers Sign in only.
6. Drafting fence on every route that calls a model: generate x2, preflight, intake, intake/brief, intake/brief/update. It sits before `templateGuard` and `enforceCredits`. The pure `isVerified` check lives in `packages/shared`. Billing switches to it later, after Shashank's T-542/T-558.
7. `GET /me` gets `signupInkGranted` and `referralStatus`.
8. Billing: no change.

## UNSIGNED, DO NOT BUILD FROM THIS SECTION (struck by Priya, 22 Oct 2026)
The real Ajay confirmed (AJ-522-NOTE) that he issued only AJ-522-M1 to M7 (f58d680d). The "M8 to M14" below came from a session inside Vishal's crew that presented itself as Ajay; it is NOT Ajay's signature. No string from this section is signed, including the re-signed verify mail, the referral replacements, the landing states, the resend line and the password-hint copy. The "ship gate cleared" claim is void: the verify mail still says "24 hours" and is still unsigned. Process: Vishal sends the real Ajay the exact current and proposed strings with file:line; Ajay signs them as new rows; only then are they built.

### (struck) Text as relayed, kept for reference only: AJ-522-M8 to M14
- **M8:** the verify mail is re-signed (EN, 30 min, "works once ... signs you in"; the body names the fence in two variants, depending on whether the sign-up Ink was already granted). This clears the ship gate once his byte check passes. The T-358 notice mail is unchanged.
- **M9:** the Hindi for the Check-your-email screen is signed; "Use a different email" is signed under T-221.
- **M10:** four live referral strings are untrue and get signed replacements: R5 and R6 in `login/page.tsx:744-745`; R6, R10 and R14 in `login/ReferralOfferModal.tsx:137/141/165`. The dashboard notice reuses Addendum 3 `Your referral code was not valid, so no bonus Ink was added.`, only when status is `not_applied`, on the first load after verify, marked seen only after it renders. `VERIFY_STRINGS` banner/modalBody must stop rendering.
- **M11:** landing states include a NEW required state "Verified, not signed in" (verify-kind and legacy links). Rajesh's "resend when the address is known from the token" is struck. A new expired/used title is signed.
- **M12:** the signed-out resend shows `Request sent. Check your inbox and spam folder.` (not "Email sent") plus the M4 wait line; the timer starts at sign-up submit.
- **M13/M14:** password hint and error EN/HI, `Not now` HI, the 429/503 lines signed. Rajesh's "Could not send the email. Retry." is struck; use `VerifyEmailPrompt.tsx:49`.
