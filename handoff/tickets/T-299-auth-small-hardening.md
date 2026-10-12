# T-299 — Auth: four small fixes found in T-234

| Field  | Value |
| ------ | ----- |
| Phase  | 0 — Prep |
| Owner  | Arjun (triage; item 2 is security). Lead (build) |
| Mode   | Small fix (auth, web, gateway test), after T-234 merges |
| Status | Ruled by Arjun (in this file), incl. security items 5 and 6. Kunal, right after T-234. HIGH |

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
