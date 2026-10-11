# T-221 — Forgot password works end to end

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Rajesh (two screens), Madhuri (email and screen copy), Lead (build), Arjun (heads-up: reset link domain), Anushka (verdict) |
| Mode           | Design first (Rajesh), then build, full chain (auth, web, email-worker, email-client) |
| Status         | To do. Needs Rajesh's design and Madhuri's copy |
| Size           | M (1.5 days) |
| Depends on     | T-220 to send for real (can be built on dry-run). T-225 for the copy rules |
| Gate           | Before v1 go-live (T-403). Today a user who forgets the password is locked out |
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
