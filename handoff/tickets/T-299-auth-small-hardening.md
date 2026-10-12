# T-299 — Auth: four small fixes found in T-234

| Field  | Value |
| ------ | ----- |
| Phase  | 0 — Prep |
| Owner  | Arjun (triage; item 2 is security). Lead (build) |
| Mode   | Small fix (auth, web, gateway test), after T-234 merges |
| Status | Merged into develop_staging (991c0f6, 12 Oct 2026). Waiting for Anushka on develop |

1. Google sign-ups are stored with `authProvider: 'email'`. It should say Google.
2. Login returns 403 for a deactivated account, which tells anyone the email exists. Arjun decides the response (likely the same 401 as a wrong password).
3. `/login` ignores `?error=oauth_failed`, so a failed Google sign-in shows nothing. Show a short error (Madhuri words it).
4. The gateway register-role test has a stale comment after T-234/T-298 (role Lawyer). Update the comment.

## Acceptance criteria

Each item fixed with a test, or closed by Arjun with a reason.

## Arjun (12 Oct 2026): rulings, plus two things found while reading

**2. Login must not reveal an account (security). Ruling.** `loginUser` today answers an unknown email with a fast 401, a deactivated account with a 403 *before* it looks at the password, and a wrong password after a bcrypt compare. That leaks existence twice: by status code and by response time. New order and answers:
1. Unknown email: run `bcrypt.compare` against a fixed dummy hash (same cost factor as real passwords, 12), then `401 'Invalid email or password'`.
2. Known email, wrong password, or no password on the record (a Google-only account, an erased account): same `401` with the same text. No "use Google" hint.
3. Known email, **correct password**, `isActive` false: `403 'Your account has been deactivated. Contact support.'` is safe here, because the caller has proved the password. Keep that text.
Tests: unknown email, wrong password, Google-only account and deactivated-with-wrong-password return byte-identical bodies and status; the deactivated-with-correct-password case returns 403; a timing check is not asserted in CI (flaky), but a test asserts the dummy compare is called on the unknown-email path. Sign-up's 409 "account already exists" stays (the user needs it; it is behind the public rate limiter); not part of this ticket.

**1. `authProvider`.** New accounts created in the Google callback (`passport.ts`, the `User.create` branch) get `authProvider: 'google'`. A password account that links Google keeps `'email'` (it has a password). No migration: production is fresh at launch; develop rows are test accounts.

**3. `?error=oauth_failed`.** Show a short message under the form, wording by Madhuri, signed by Ajay if it says anything about the account. The page maps a **fixed set of codes** to fixed strings (`oauth_failed`, `account_deactivated`); any other value shows nothing. Never print the query value.

**4. Stale comment.** Update it to say sign-up gives `Lawyer` (T-298).

**5. New, security: the Google sign-in path never checks `isActive`.** `loginUser` and refresh check it; the Google callback (`passport.ts` / `oauth.routes.ts`) does not, so a deactivated, locked or (after T-115c) mid-erase account can still sign in with Google and get a session. Fix: after the user is resolved in the strategy, if `!user.isActive`, refuse and redirect to `/login?error=account_deactivated` (Google has proved the identity, so saying so is safe). Test: a deactivated Google user gets no session and no token in the redirect. T-115c depends on this: its "locked" stage is `isActive: false`.

**6. Noted, not built here (owner T-223, email verification).** The strategy links a Google login to an existing password account by email. Without verified email on the password account, someone can register a victim's address with a password they know and keep access after the victim later signs in with Google. Until T-223 lands, the safe rule is: when linking Google to an existing password account, **unset the password** (the account becomes Google-only; the owner can set a new one through "forgot password"). Priya to add this as an acceptance criterion on T-223 or to this ticket; my preference is this ticket, one line plus a test, since the fix is in the same function.

## Priya (12 Oct 2026)

Items 5 and 6 (security) are in this ticket. Kunal builds T-299 right after T-234 (same auth files). Priority: high, before v1 go-live; T-115c depends on item 5.

## Rides along (Priya, 12 Oct 2026, from T-234)

Fix the stale comment in the apps/gateway register-role test that says "role forced to Client".

## Moved (Priya, 12 Oct 2026)

The auth JSON-error handler (from T-307) is now part of T-315, shared with the other services (Arjun).

## Rides along (Priya, 12 Oct 2026, from T-234 review)

- Referral grant after the $inc: close the known limitation (grant and counter can diverge on failure).
- Re-check the code's `expiresAt` at slot time, not only at first check.
- Remove the timing difference that tells a password-less (Google-only) account apart at login.

## Arjun (12 Oct 2026): Kunal's two questions on item 6 and the grant

1. **Revoke sessions on Google link: yes.** In the link branch of `passport.ts`, in this order: unset `password`, clear `passwordResetToken` and `passwordResetExpires`, call `deleteAllUserSessions(userId)` from `session.service.ts` (no edit to that file), then create the new Google session. The new session must be created after the revoke, never before. Test: a session made before the link fails `validateSession` after it; the Google session made by the link passes.
2. **Grant idempotency by marker: yes.** `referralInkGrantedAt` is set in the same atomic update as the `$inc`, with the filter `referralInkGrantedAt: { $exists: false }`; `matchedCount === 0` means already granted, do nothing. The ledger row is written after, best effort, and its failure is logged (no PII), never retried into a second `$inc`. Test: two concurrent grants give one `$inc`.

## Arjun (12 Oct 2026): refresh must need a live session; the login page hint

1. **Add to T-299 (security, must-fix).** `refreshTokens` in `auth.service.ts` today issues new tokens even when `session:refresh:<userId>:<hash>` is gone, so logout, revoke-all and the Google-link revoke do not stop a holder of a refresh JWT for up to 7 days. Fix: consume the key atomically with `GETDEL`; if it returns nothing, 401 (`Invalid or expired refresh token`, same text as a bad JWT) and issue nothing. Then delete the old access session from the returned data, as today. `GETDEL` also stops two concurrent refreshes with one token from both getting new tokens. Known effect: a user whose Redis refresh key has expired (TTL shorter than the JWT) is asked to sign in again; that is intended. Tests: refresh after `deleteAllUserSessions` → 401; refresh after logout → 401; two concurrent refreshes with one token → exactly one succeeds; normal refresh still rotates.
2. **Keep the /login page line.** "Signed up with Google? Use Continue with Google above." is static and shown on every 401, so it reveals nothing about any account. Ruling 2 is about API responses differing per account; it does not cover this.

## Arjun (12 Oct 2026): revoked access tokens, follow-up ticket (next after T-299)

Checked. The gateway is fine: `/api/documents`, `/api/templates`, `/api/billing` (and the rest of `authChain`) run `authenticate` + `sessionCheck`, which looks up `session:<userId>:<hash>` and fails closed (503) when Redis is down. **The gap is the auth service itself.** `/api/auth/*` goes through the gateway's *public* proxy, and the auth service's own `middleware/authenticate.ts` only verifies the JWT. So after logout, revoke-all or a Google link, the old access token still works for up to 24 h on every authenticated auth route: `/logout`, referral routes, and **admin-users and admin-audit**.

Fix (own ticket, not T-299; Priya to log it, auth service only, no `packages/shared` change):
1. `authenticate` in `apps/auth/src/middleware/authenticate.ts` becomes async: after `verifyAccessToken`, `validateSession(userId, hashToken(token))` from `session.service.ts`. No session → 401 `Session expired or revoked. Please log in again.` (same text as the gateway). Redis error → 503, fail closed, same as `sessionCheck`.
2. `/logout` keeps working on an already-deleted session (idempotent 200), so a double logout does not error.
3. Tests: after `deleteAllUserSessions`, an old token gets 401 on `/me`-style routes, a referral route and an admin route; Redis down → 503; a live token passes.
