# T-358 — Delete email accounts never verified after 30 days

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (auth) |
| Mode   | Small fix |
| Status | To do. Unassigned. After T-223. Not a release gate. From Ajay, 12 Oct 2026 (T-223 sign-off cbe17ce) |
| Source | Ajay: a password sign-up can hold someone else's address; we should not keep it indefinitely |

## Acceptance criteria

1. A daily job in auth deletes accounts with `authProvider` email, `emailVerified` false, no `googleId`, created more than 30 days ago.
2. Deletion uses the same path as account deletion (T-242/T-235): the account and its data go, signupSource included.
3. Logs record only a count of deleted accounts. No address and no userId go to third-party logs.
4. Tests: a 29-day account is kept; a 31-day account is deleted; a verified account and a Google-linked account are kept at any age.
5. Ajay signed (44326dc): 30 days after sign-up confirmed. In the same release, Privacy Policy §9 gets the line "Accounts whose email address is never verified: deleted 30 days after sign-up." ~~Bump the policy version with no change summary, so no re-accept prompt (retention only gets shorter).~~ **Struck 15 Oct 2026 (Arjun):** the single privacy-version bump, with its summary, rides on T-436 AC8 (Ajay fc0d74d). T-358 changes the §9 text only and does not bump the version. The policy file is legal content: the lead lists it in the claim.

Out of scope: nothing on warning emails. Ajay a84e298 requires a 7-day notice email before deletion, so it is in scope.

## Arjun (14 Oct, 17:40 UTC) — what an unverified account actually holds

Checked `apps/auth` (`registerUser`, User and Session models) and the gateway/drafting middleware. Ajay's parking condition ("only an email and a password hash") is **not** true:

- Sign-up stores email, password hash, name, role, terms/privacy acceptance times and versions, sanitised UTM tags, and a Session row with IP address and user agent.
- Nothing gates `emailVerified: false` anywhere (no check in the gateway, drafting or auth middleware). An unverified account can log in and create documents, so it can hold case details like any other account.

Ruling: T-358 is a small ticket **after T-115c**, not a separate delete path. A daily sweep in auth selects users with `emailVerified: false` and `createdAt` older than 30 days and runs the same erase orchestration T-115c builds (auth → drafting → billing `/internal/erase-user`). Nothing new to design. Until then the manual erase runbook (T-235) covers a request. Ajay decides whether the policy needs a line for the 30-day unverified deletion; parking is his call knowing the above.

## Arjun (14 Oct, 23:20 UTC) — Tanvi's six calls

1. **Auth sweep**, hourly tick + a run at boot, same pattern as the T-115c erase sweep. Auth owns accounts; a BullMQ repeatable in the email-worker would put account logic in the worker. ADR-025 D5 ("no job runtime") was about billing; this is the auth sweep the 14 Oct note described.
2. **userId-only job**, like T-223: the worker calls a new auth internal route to get the address at send time. No email address in Redis.
3. **Stamp `unverifiedNoticeSentAt` on a confirmed send** (the worker reports the outcome to auth, as T-223 does), not at enqueue. **Hold deletions until the notice has actually been sent.** The `[registered address]` / `[PIN]` footer placeholders mean no notice can send today — that is a founder item (his GST/address details, same as T-436's env values); the sweep is simply inert until then. Log a count of "due but notice unsent" so it is visible.
4. **Yes**: notice at `createdAt ≥ 23 days`; delete when `createdAt ≥ 30 days` **and** `unverifiedNoticeSentAt ≤ now − 7 days`. Pre-T-223 accounts get the notice first and a working link; no one is deleted without 7 days' warning.
5. **Include `isActive: false` unverified accounts**, except rows that already carry an `erasure` stage (the erase sweep owns those).
6. **Yes** to the conditional lock: the lock's `updateOne` re-checks `emailVerified: false` and the age inside the filter, so a user who verifies mid-sweep is never locked. **Keep the billing-status guard** (defence in depth; checkout requires verification today but that may change) — on a 409 from it, log and skip the row, never loop.

**Arjun (14 Oct, 23:32 UTC) — two more:** (1) Deactivated unverified accounts get a notice **without a verify link** ("this deactivated account will be removed on <date>; write to privacy@lawie.in to keep it"); Ajay signs that variant. Same delete timing. A link we know cannot work must not be sent. (2) The notice's verify link is issued with a **7-day** lifetime, matching the promise; T-223's 24 h stays for ordinary verify mails. A 7-day promise with a 24-hour link is a trap.

## Ajay, 14 Oct 2026 (8a2b639, dpdp file §10) — must-fix

- The 30 days count from the user's first sent verify email, not from sign-up. An account that never had a verify email sent is never noticed and never deleted.
- The queue of verify emails held since T-379 is purged (weeks-late emails with stale links look like phishing). Each affected user then gets one fresh verify email once the footer is fixed; the 30 days start from that email.
- Arjun owns the mechanics.

## Ajay, 14 Oct 2026 (9e42eea) — change to the above

The purge, no mass email and "resend at next sign-in" are approved (Arjun's mechanics). One change for held-queue users:
- Whichever email reaches the user first (the resend or the T-358 notice) starts the clock. Deletion comes no earlier than 30 days after it, not 7.
- If the notice is that first email, send a fresh link again 7 days before the deletion date.
- Throttling can delay a notice but never shortens the 30 days.

**Arjun (14 Oct, 23:58 UTC) — round 2:** (1) Keep the 24 h grace before the first notice; it only delays. (2) The sweep must not stockpile first notices while the worker is held. Gate it: `UNVERIFIED_SWEEP_ENABLED` env (default `false`); the sweep enqueues nothing while it is false and logs the "due" count. The founder flips it to `true` only after purge → footer env → deploy → `verify:resend-all`. Belt and braces: `queue:purge` (T-436 AC10) also purges `auth.unverifiedDeletionNotice` jobs. Order is owned by the T-403 checklist.
