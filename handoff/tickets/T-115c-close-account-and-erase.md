# T-115c — Close an account and erase its data

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Arjun designed it |
| Mode           | Build (auth + services + web) |
| Status         | To do. Unassigned. Waits for Rajesh's design and Ajay's text. After T-115a |
| Parent         | T-115 |

Account close (blocked while a subscription is active) goes through `/internal/erase-user`: auth orchestrates, each service erases its own data; `scripts/erase-user.ts` uses the same path. Per Arjun's revised design in `T-115-permanent-delete-and-encrypted-inputs.md`. Billing rows: Ajay decides whether they stay.

## Acceptance criteria

See the slice list and acceptance criteria in `T-115-permanent-delete-and-encrypted-inputs.md` (Arjun, 12 Oct 2026, revised design). Gate before v1 go-live.

## Note (Priya, 12 Oct 2026)

Ajay condition 5 on T-242: deleting an account must remove the whole User document, including `signupSource` (UTM tags and time). No delete path exists today.

## Arjun (14 Oct, 18:25 UTC) — backup retention, for Ajay's policy line

- Today: production Mongo is Atlas M0, which has **no backups**. A deleted document or a closed account is gone the moment the erase runs; nothing holds a copy. Redis holds no case details beyond the encrypted `intake:cache:*` entries, which expire in 30 minutes.
- When the founder turns on Atlas Cloud Backup (on his reminder list, needs M10+): the policy I will set is daily snapshots kept **7 days**, no weekly or monthly snapshots. So the policy line can safely say deleted data may remain in backups for **up to 7 days**, and that line stays true for M0 (0 days) as well.
- Failed email jobs: kept up to 30 days (T-220), already in Ajay's text.

| Status | Todo. Tanvi, after T-425. Spec handoff/marketing/close-account-spec-t115c.md; Ajay text a84e298. Priya, 14 Oct 2026 |

## Arjun (14 Oct, 20:30 UTC) — Tanvi's five questions

1. **Hard-delete the User document** as the last step (Ajay T-242 cond. 5 allows it). No placeholder email, no partial-index migration on a database with no backups. The `account_delete` AuditLog row (userId, type, time) and the stripped audit rows are the record that the account existed; `erasure.stage` lives on the User doc until that last step, and the final state is the AuditLog row, so the sweep treats "no User doc + account_delete row" as done. Billing rows keep the `userId` ObjectId as an opaque reference — nothing joins back. Re-registering the same email later makes a new account, as designed.
2. **Yes**: store `authAt` on the Session at login and at OAuth callback, carry it unchanged through `/refresh`, and check `authAt` within 15 minutes for Google-only users. Password users re-prove with the password, no time check.
3. **Yes**: wrong password on close → **403 `{ error: 'wrong_password' }`**, never 401, so `apiFetch` does not refresh-and-retry. Put the close endpoint behind the same rate limit as login (it is a bcrypt compare on a known account; without the limit it is a password oracle). One 403 text; no "account not found" variant.
4. **Auth calls billing**, never reads the subscriptions collection (design decision 10: each service owns its data). Billing adds `GET /internal/subscription-status/:userId` (internal secret) returning `{ active: boolean, status }`. Block (409 `subscription_active`) on any subscription in `active`, `authenticated`, `pending`, `halted` or `paused` — every state Razorpay may still charge from. Allowed: `created`, `cancelled`, `completed`, `expired`, none. Billing down → 503, not 409; the user retries.
5. **Yes** to all: `apps/auth/src/scripts/erase-user.ts`; refuse `role: Admin` and `GOLDEN_SET_USER_ID`; 200 when every step is done, 202 `{ status: 'pending' }` when locked and the sweep finishes it (same contract as T-115b). A repeat DELETE while pending → 202; after the User doc is gone → the normal 401 (no session), which is correct.

## Arjun (14 Oct, 21:05 UTC) — Tanvi's two confirms

1. **Yes, fail closed**: a subscription status not in the allowed list blocks the close with 409. An unknown status is a state we have not reasoned about, and the cost of blocking is a support mail, the cost of erasing a user who is still being charged is a refund fight.
2. **Keep Redis strict.** Drafting erases its Redis keys first; if Redis is down the internal route returns 500, auth leaves `erasure.stage` where it is and answers 202 pending, the sweep retries. Do not log-and-continue: the keys are part of the erase promise even though they are ids only and expire within 2 days. Redis down means the product is down anyway (sessions, holds).

Two findings from Tanvi, **not** in this ticket, both billing-only small fixes for Priya to create as must-fix (money path / security):
- `Subscription.model.ts` status enum lacks `pending`, `halted`, `completed`. A Razorpay webhook that moves a subscription to one of those will fail Mongoose validation on save; under T-413 that is a 500 and Razorpay retries forever. Add the three values (and `expired` if missing), plus a test that every status Razorpay documents saves.
- Billing's internal-secret middleware compares with a plain `!==`. Use `crypto.timingSafeEqual` on equal-length buffers (same pattern as auth/drafting if they already have it; if they do not, fix all three in one ticket — the lead checks).
