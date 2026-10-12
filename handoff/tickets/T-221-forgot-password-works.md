# T-221 — Forgot password works end to end

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Rajesh (two screens), Madhuri (email and screen copy), Lead (build), Arjun (heads-up: reset link domain), Anushka (verdict) |
| Mode           | Design first (Rajesh), then build, full chain (auth, web, email-worker, email-client) |
| Status         | To do. Back from hold (founder, 11 Oct 2026: password sign-up ships in v1). Rajesh's design done; Madhuri's copy needs a final pass with Ajay |
| Size           | M (1.5 days) |
| Depends on     | T-220 to send for real (can be built on dry-run). T-225 for the copy rules |
| Gate           | Before v1 go-live (T-403). A user who forgets the password is locked out |
| Branch         | feature/t-221-forgot-password |
| Legal sign-off | Copy within T-225's rules; no separate sign-off |
| Created        | 2026-10-11 |
| Source         | Founder asked for email scope, 11 Oct 2026. Priya's survey of `apps/email-worker` and `packages/email-client` |

## Problem

The login page shows "Forgot password?", but it is a plain `<span>` that goes nowhere (`apps/web/src/app/(auth)/login/page.tsx`). `POST /auth/forgot-password` makes a reset token and stores its hash, then sends nothing: no email template exists for it. There is no web page to set a new password. Shashank's T-208 review also found the reset path accepts any password of 8 characters, weaker than sign-up.

## Acceptance criteria

1. "Forgot password?" opens a page where the user enters an email. The reply is the same whether or not an account exists.
2. Auth enqueues a new `auth.passwordReset` email with a link to `/reset-password/<token>` on the web app's own domain. The link works once and expires in 30 minutes (as today).
3. The reset page sets a new password under the same rules as sign-up, then signs out every other session of that user.
4. Too many requests for one email or IP are refused politely (rate limit), with no hint whether the account exists.
5. The token and the email address are never logged or sent to Sentry.
6. A Google-only account that asks for a reset gets an email saying to sign in with Google, not a reset link.
7. Tests cover: unknown email, expired token, used token, weak password, Google-only account.

## Out of scope

- Changing the password while signed in
- Email verification (T-223)

## References

- T-208 follow-up 3 (reset strength), T-220, T-225

## Design (Rajesh, 11 Oct 2026)

- Spec and mocks (private claude.ai artifact; share it from its Share menu before the lead opens it): https://claude.ai/artifact/JqpTng8PhBncn3DcHQC8gf
- Covers: `/forgot-password` (F1–F6 incl. same-for-all confirmation, rate-limited, network error), `/reset-password/[token]` (R1–R5 incl. weak password, success, expired or used link), email `auth.passwordReset` (E1 reset link, E2 Google-only), Tailwind hand-off table, response-to-state map, copy slots.
- All copy is draft, Madhuri to finalise; within Ajay's T-225 rules.
- Open for Priya: "Forgot password?" is inside `ENABLE_PASSWORD_LOGIN = false` on login, so the entry point is not visible today. Also asks for a token check on page load (lead) and token-in-URL handling (Arjun).

## Copy (Madhuri, 11 Oct 2026) — ON HOLD

On hold (Priya, 11 Oct 2026): Phase 1 is Google sign-in only (founder decision, 17 May 2026), so password reset is paused. Kept for later; not for build or review now.

For Ajay's claims check when this resumes. Written inside T-225 (Ajay sign-off, 11 Oct 2026). No Rajesh draft copy or design link was in this file when written; if his screens carry different labels, Rajesh and I reconcile before build. Words in `{braces}` are data the template fills in.

Notes for the build:
- No case or draft words anywhere, no password, no ID numbers. Greeting uses the name only.
- These two emails do not mention drafting, so the T-225 drafting disclaimer is not required. The footer is.
- Send from `Lawie <noreply@lawie.in>`, to the account's own address only. Open and click tracking off.
- The forgot-password screen shows the same "sent" state for every email, known or not (AC1). The rate-limit message gives no hint either (AC4).

### Footer (both emails, verbatim from T-225 AC1c, no unsubscribe link)

```
Lawie (Sole Proprietorship), [registered address], Patna, Bihar [PIN]
You are receiving this because you have a Lawie account.
Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in
Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms
```

Risk (from T-225): the registered address is a placeholder until the founder fills it.

### Email 1: `auth.passwordReset` (account has a password)

| Part | Copy | Chars |
| --- | --- | --- |
| Subject | Reset your Lawie password | 25 |
| Preheader | This link works once and expires in 30 minutes. | 48 |

Subject variants: A "Reset your Lawie password" (25, recommended) · B "Your Lawie password reset link" (30) · C "Set a new Lawie password" (24)

Body:

```
Hello {name},

We got a request to reset the password for your Lawie account.

[Set a new password]   -> {resetUrl}

This link works once and expires in 30 minutes. After you set a new password, you will be signed out on your other devices.

Didn't ask for this? Ignore this email. Your password stays the same.

Never share this link. Lawie will never ask for your password by email or phone.

Team Lawie
```

Button variants: A "Set a new password" (18, recommended) · B "Reset password" (14) · C "Choose a new password" (21)

Plain-text fallback line under the button: "Button not working? Copy this link into your browser: {resetUrl}"

### Email 2: Google-only account asked for a reset (AC6)

| Part | Copy | Chars |
| --- | --- | --- |
| Subject | Sign in to Lawie with Google | 28 |
| Preheader | Your account uses Google sign-in, so there is no password to reset. | 67 |

Subject variants: A "Sign in to Lawie with Google" (28, recommended) · B "Your Lawie account uses Google sign-in" (38) · C "No password to reset on your Lawie account" (42)

Body:

```
Hello {name},

We got a request to reset the password for your Lawie account. Your account uses Google sign-in, so it has no Lawie password to reset.

To get in, open Lawie and choose "Continue with Google".

[Go to sign in]   -> {loginUrl}

Didn't ask for this? Ignore this email. Nothing has changed.

Team Lawie
```

Button variants: A "Go to sign in" (13, recommended) · B "Sign in with Google" (19) · C "Open Lawie" (10)

Note: the button label must match the Google button text on the live login page; "Continue with Google" above is a placeholder for that label.

### Screen 1: Forgot password (`/forgot-password`)

| Element | Copy | Chars |
| --- | --- | --- |
| Heading | Forgot your password? | 21 |
| Sub-text | Enter the email you use for Lawie. We'll send you a link to set a new password. | 79 |
| Field label | Email | 5 |
| Placeholder | you@example.com | 15 |
| Button | Send reset link | 15 |
| Button (loading) | Sending... | 10 |
| Back link | Back to sign in | 15 |

Heading variants: A "Forgot your password?" (21, recommended) · B "Reset your password" (19) · C "Can't sign in?" (14)

Button variants: A "Send reset link" (15, recommended) · B "Email me a link" (15) · C "Continue" (8)

States:

| State | Copy | Chars |
| --- | --- | --- |
| Sent (same for every email, known or not) | Heading: "Check your email" (16). Body: "If {email} has a Lawie account, we've sent it a link. The link expires in 30 minutes. No email? Check spam, or try again in a few minutes." (~138 with a typical email) | |
| Sent: secondary link | Send again | 10 |
| Rate limited (AC4) | Too many requests. Please wait 15 minutes and try again. | 56 |
| Empty field | Enter your email. | 17 |
| Invalid email format | Enter a valid email, like you@example.com. | 42 |
| Network or server error | Something went wrong. Please try again. | 39 |

Note: "15 minutes" in the rate-limit line must match the real window the lead sets. If the window is not fixed, use "Too many requests. Please wait a while and try again." (52).

### Screen 2: Reset password (`/reset-password/<token>`)

| Element | Copy | Chars |
| --- | --- | --- |
| Heading | Set a new password | 18 |
| Field label 1 | New password | 12 |
| Field label 2 | Confirm new password | 20 |
| Helper text (always shown) | At least 8 characters, with an uppercase letter, a lowercase letter and a number. | 81 |
| Show/hide toggle | Show / Hide | 4 / 4 |
| Button | Save new password | 17 |
| Button (loading) | Saving... | 9 |

Heading variants: A "Set a new password" (18, recommended) · B "Choose a new password" (21) · C "Reset your password" (19)

Button variants: A "Save new password" (17, recommended) · B "Set password" (12) · C "Update password" (15)

States:

| State | Copy | Chars |
| --- | --- | --- |
| Weak password: too short | Use at least 8 characters. | 26 |
| Weak password: no uppercase | Add at least one uppercase letter. | 34 |
| Weak password: no lowercase | Add at least one lowercase letter. | 34 |
| Weak password: no number | Add at least one number. | 24 |
| Passwords don't match | The two passwords don't match. | 30 |
| Expired or used link | Heading: "This link has expired" (21). Body: "Reset links work once and last 30 minutes. Ask for a new one and use it soon." (78). Button: "Send a new link" (15), goes to /forgot-password | |
| Success | Heading: "Password changed" (16). Body: "You can now sign in with your new password. For your safety, we've signed you out on your other devices." (104). Button: "Sign in" (7) | |
| Network or server error | Something went wrong. Your password was not changed. Please try again. | 70 |

Note: one message covers both expired and used links on purpose (no need to tell the two apart). The weak-password lines match sign-up's rules in `apps/auth/src/validators/auth.validator.ts` (min 8, upper, lower, number); if the lead shows sign-up's own messages instead, these replace them on both pages so the wording stays the same.

## Priya (11 Oct 2026)

Founder, 11 Oct 2026 (in the Priya session and on the board): email and password sign-up and sign-in ship in this release, alongside Google. This replaces the 17 May 2026 'Google only for Phase 1' decision. So T-221 is a v1 blocker again. Copy: Madhuri's on-hold draft returns for Ajay's claims check.

## Copy (Madhuri, final, 11 Oct 2026)

For Ajay's claims check. Current version: replaces the on-hold draft above, which stays as it was. Written inside T-225 (AC1a, AC1b, AC1c) and reconciled with Rajesh's design (https://claude.ai/artifact/JqpTng8PhBncn3DcHQC8gf): same states, same slots, within his max lengths. Words in `{braces}` are data the template fills in. Not for publishing until Meera signs off.

### What changed from the on-hold draft, and why

| # | Change | Reason |
| --- | --- | --- |
| 1 | Reset screen has one password field with show/hide and a live 4-rule checklist. "Confirm new password" and "passwords don't match" are gone | Rajesh's R1 to R3 |
| 2 | Sent screen: "Send again" removed; "Use a different email" and a spam line added | Rajesh's F4 (rate limit covers repeats) |
| 3 | Sent screen says "we've sent it an **email**", not "a link" | A Google-only account gets E2, which has no link. "A link" would be untrue for them, and a different line would reveal the account type (AC1) |
| 4 | Rate-limit minutes come from `Retry-After` (`{n}`), with a fallback line | Rajesh's F5; no hard-coded "15" |
| 5 | Network error gets its own line and a "Try again" button; on the reset page it no longer says "your password was not changed" | Rajesh's F6. On a timeout we can't know if the save went through, so we must not claim it didn't |
| 6 | Expired-link screen tells a user who already reset to just sign in | If a save succeeds but the reply is lost, the retry hits a used token (R5). Without this line they think the reset failed |
| 7 | Reset email has no "Hello {name}" greeting; heading instead | Rajesh's E1 (less data in the email). T-225 allows the name; dropping it is the safer choice |
| 8 | Email footer: my T-225 footer, not the design's "Lawie · AI drafting for advocates" line | T-225 AC1c is verbatim. A tagline that mentions drafting would also trigger the drafting disclaimer, and "AI drafting" is off-voice |
| 9 | Heading A on the forgot screen is now "Reset your password" (Rajesh's) | Matches the email subject and the page title in his spec. Mine kept as variant B |

Confirmed against code: the Google button on `/login` reads "Continue with Google" (`apps/web/src/app/(auth)/login/page.tsx`), so E2 names it exactly. The four rules match `registerSchema` in `apps/auth/src/validators/auth.validator.ts` (min 8, upper, lower, number).

### Screen 1: Forgot password (`/forgot-password`)

| Slot | Copy | Chars (max) |
| --- | --- | --- |
| forgot.title | Reset your password | 19 (30) |
| forgot.sub | Enter the email you use for Lawie. We'll send you a link to set a new password. | 79 (110) |
| forgot.label | Email address | 13 |
| forgot.placeholder | you@example.com | 15 |
| forgot.cta / loading | Send reset link / Sending... | 15 / 10 (22) |
| forgot.back | Back to sign in | 15 |
| forgot.err.empty | Enter your email address. | 25 (60) |
| forgot.err.format (F2) | Enter a full email address, like you@example.com. | 49 (60) |
| forgot.sent.title (F4) | Check your email | 16 (24) |
| forgot.sent.body (F4) | If {email} has a Lawie account, we've sent it an email. It works once and expires in 30 minutes. | 96 + email (140) |
| forgot.sent.spam | Not there? Check Spam and Promotions. | 37 (50) |
| forgot.sent.secondary | Use a different email | 21 (26) |
| forgot.limit (F5) | Too many requests. Please wait {n} minutes, then try again. | 59 (80) |
| forgot.limit, n = 1 | Too many requests. Please wait 1 minute, then try again. | 56 (80) |
| forgot.limit, no Retry-After | Too many requests. Please wait a few minutes, then try again. | 61 (80) |
| common.network (F6) | We couldn't reach Lawie. Check your connection and try again. | 61 (80) |
| common.network.cta | Try again | 9 |

Title variants: A "Reset your password" (19, recommended) · B "Forgot your password?" (21) · C "Can't sign in?" (14)
CTA variants: A "Send reset link" (15, recommended) · B "Email me a link" (15) · C "Continue" (8)

Notes: placeholder stays `you@example.com` (reserved domain; the design's "legalfirm" suggests a firm, and most of our users are solo on Gmail). F4 and F5 read the same for every email, known or not (AC1, AC4). Page title: "Reset your password · Lawie".

### Screen 2: Set a new password (`/reset-password/<token>`)

| Slot | Copy | Chars (max) |
| --- | --- | --- |
| reset.title | Set a new password | 18 (30) |
| reset.sub | Choose a password you don't use on any other site. | 50 (80) |
| reset.label | New password | 12 |
| reset.toggle (aria-label) | Show password / Hide password | 13 / 13 |
| reset.rules ×4 | At least 8 characters · One capital letter (A-Z) · One small letter (a-z) · One number (0-9) | 21 · 24 · 22 · 16 (32 each) |
| reset.err.short (R2) | Use at least 8 characters to continue. | 38 (60) |
| reset.err.upper (R2) | Add a capital letter to continue. | 33 (60) |
| reset.err.lower (R2) | Add a small letter to continue. | 31 (60) |
| reset.err.number (R2) | Add a number to continue. | 25 (60) |
| reset.err.several (R2, 2+ rules unmet) | Your password needs everything in the list below. | 49 (60) |
| reset.cta / loading | Save new password / Saving... | 17 / 9 (22) |
| reset.network (R3 failure) | We couldn't reach Lawie. Check your connection and try again. | 61 (80) |
| reset.done.title (R4) | Password changed | 16 (24) |
| reset.done.body (R4) | You can now sign in with your new password. To keep your account safe, we've signed you out on all other devices. | 113 (140) |
| reset.done.cta | Sign in | 7 (16) |
| reset.dead.title (R5) | This link no longer works | 25 (30) |
| reset.dead.body (R5) | Reset links work once and expire 30 minutes after we send them. If you already set a new password, sign in with it. | 115 (130) |
| reset.dead.cta / secondary | Send a new link / Back to sign in | 15 / 15 (22) |

Title variants: A "Set a new password" (18, recommended) · B "Choose a new password" (21) · C "Reset your password" (19)
CTA variants: A "Save new password" (17, recommended) · B "Set password" (12) · C "Update password" (15)

Notes: a server 422 maps to the rule lines above; never show the validator's raw text ("Must contain at least one uppercase letter"). "Capital" and "small" letter on purpose: plainer than upper/lower case. Page title: "Set a new password · Lawie". R4's "signed you out on all other devices" is true only if AC3 ships; if it slips, that sentence comes out.

### Email E1: `auth.passwordReset` (account has a password)

| Part | Copy | Chars (max) |
| --- | --- | --- |
| Subject | Reset your Lawie password | 25 (40) |
| Preview | This link works once and expires in 30 minutes. | 47 (60) |

Subject variants: A "Reset your Lawie password" (25, recommended) · B "Your Lawie password reset link" (30) · C "Set a new Lawie password" (24)

Body:

```
Reset your password

We got a request to reset the password for your Lawie account.

[Set a new password]   -> {resetUrl}

This link works once and expires in 30 minutes. After you set a new password, you will be signed out on your other devices.

If the button doesn't work, copy this link into your browser:
{resetUrl}

Didn't ask for this? Ignore this email. Your password stays the same.

Never share this link. Lawie will never ask for your password by email or phone.

Team Lawie
```

Button variants: A "Set a new password" (18, recommended) · B "Reset password" (14) · C "Choose a new password" (21)

### Email E2: Google-only account asked for a reset (AC6, `variant: 'google'`)

| Part | Copy | Chars (max) |
| --- | --- | --- |
| Subject | Sign in to Lawie with Google | 28 (40) |
| Preview | Your account uses Google sign-in. No password to reset. | 55 (60) |

Subject variants: A "Sign in to Lawie with Google" (28, recommended) · B "Your Lawie account uses Google sign-in" (38) · C "Signing in to Lawie" (19, Rajesh's draft)

Body:

```
Your account uses Google sign-in

We got a request to reset the password for your Lawie account. Your account signs in with Google, so it has no Lawie password to reset.

To get in, open Lawie and choose "Continue with Google".

[Go to sign in]   -> {loginUrl}

Didn't ask for this? Ignore this email. Nothing has changed on your account.

Team Lawie
```

Button variants: A "Go to sign in" (13, recommended) · B "Open Lawie sign-in" (18) · C "Open Lawie" (10)

### Footer (E1 and E2, verbatim from T-225 AC1c, no unsubscribe link)

```
Lawie (Sole Proprietorship), [registered address], Patna, Bihar [PIN]
You are receiving this because you have a Lawie account.
Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in
Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms
```

### For Ajay's claims check

- Claims in this copy: "works once", "expires in 30 minutes" (AC2), "signed out on your other devices" (AC3), "Lawie will never ask for your password by email or phone" (a promise about our own conduct; cut it if you'd rather not make it).
- Neither email mentions drafting, so the T-225 drafting disclaimer is not required. No name, case, draft, ID or password in either email (AC1a).
- Send from `Lawie <noreply@lawie.in>`, to the account's own address only. Open and click tracking off.
- Risk (from T-225): `[registered address]` and `[PIN]` are placeholders until the founder fills them. Do not send before.

## Ajay claims check (11 Oct 2026, night)

Checked "Copy (Madhuri, final, 11 Oct 2026)" against T-225 (AC1a, AC1b, AC1c) and, read-only, against `apps/auth` and `apps/gateway`. Result: **Approved**, no wording changes, subject to the build conditions below.

| # | Claim / item | Mark | Basis |
| --- | --- | --- | --- |
| 1 | "expires in 30 minutes" (F4, R5, E1 preview and body) | Approved | `apps/auth/src/services/auth.service.ts:155` sets 30 min |
| 2 | "works once" (F4, R5, E1) | Approved | Token cleared on success, `auth.service.ts:175` |
| 3 | "signed out on your other devices" (E1) and "signed you out on all other devices" (R4) | Approved **only if AC3 ships**, with a test | Sessions are Redis-backed and checked on every request (`apps/gateway/src/middleware/sessionCheck.ts`), so deleting them is immediate and the claim can be true. If AC3 slips, both sentences come out, E1 too (Madhuri's note names R4 only) |
| 4 | Four-rule checklist on the reset page | Approved **only if AC3's rule fix ships** | Today reset accepts any 8 characters (T-208 follow-up 3). A checklist the server does not enforce is a false statement |
| 5 | "Lawie will never ask for your password by email or phone" | Approved, keep it | A promise about our own conduct; binds support too. Anti-phishing value outweighs the risk |
| 6 | Same reply for known and unknown emails (F4, F5); "an email", not "a link" | Approved | Prevents account enumeration (DPDP s.8(5) safeguards) |
| 7 | E2 (Google-only): no link to reset, names "Continue with Google" | Approved | Matches `login/page.tsx` |
| 8 | No name, case, draft, ID or password in E1/E2; no greeting | Approved | T-225 AC1a |
| 9 | Transactional, no unsubscribe; sender `Lawie <noreply@lawie.in>`; tracking off | Approved | T-225 AC1b, AC1c |
| 10 | Footer | Approved; **Risk**: `[registered address]`, `[PIN]` placeholders. No send until filled | T-225 AC1c |
| 11 | All title, CTA, subject and button variants | Approved, any variant | |

Signed: Ajay (CLO), 11 Oct 2026, night. Conditional on items 3, 4 and 10.
