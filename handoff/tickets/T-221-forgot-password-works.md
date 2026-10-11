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
