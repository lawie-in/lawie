# T-527: Reconcile before create at Razorpay

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Full chain (billing) |
| Status | In build: Shashank (21 Oct 2026). BLOCKING before main. Priya |
| Source | Arjun; T-518 and T-526 reviews |

## Problem
If `subscriptions.create` times out, the outcome at Razorpay is unknown. T-526 only alerts. A retry can create a second live subscription.

## Acceptance criteria
1. Before `subscriptions.create`, look up the customer's subscriptions at Razorpay (customer id / `notes.userId`). If a live one exists with no local row, adopt it: write the row and return it instead of creating again.
2. The adopt path is tested with a mock; in no timing can two live subscriptions exist for one user.
3. Logs carry ids only, never payloads or names.
4. A timed-out create can leave an orphan `created` subscription at Razorpay (no payment link, no double charge) when a retry follows after the 409 window (about 5 to 65 s): reconcile or cancel the orphan.
5. Startup guard (Arjun): refuse to boot if NODE_ENV=production with an `rzp_test_` key, or non-production with an `rzp_live_` key.
6. Reword the `SubscriptionCreateUnknownOutcomeError` comment (the real signal is `reportCreateTimeout`).

## Arjun (21 Oct 2026) — design (Shashank)

Explore facts accepted: billing never creates a Razorpay customer (customer_id is null until authorisation), `subscriptions.all` filters only by from/to/count/skip/plan_id, and a sub that stays `created` fires no webhook. So reconciliation keys on `notes.userId`, client-side, with a time anchor. **AC1 reads "notes.userId", not "customer id".**

**Design (a) approved** as proposed:
1. Create timeout (the T-526 unknown-outcome path) also writes a durable `SubscriptionReconcile { userId, lockCreatedAt, planId }`, no TTL.
2. Next subscribe with a marker: page `subscriptions.all({ from: lockCreatedAt − 5 min, to: now, count: 100 })` under a timeout, match `notes.userId` client-side, cap 3 pages, 503 past the cap. Same plan + created/authenticated → adopt (write the row, return its short_url, no create). Different plan → `cancelNowAtRazorpay`. active/pending → adopt and 409 `subscription_exists`. Marker cleared only after a complete scan; list failure → 503, marker kept. E11000 on adopt → re-read the row.
3. Sweep every ~5 min (same shape and single-runner lock as the invoice sweep) for markers older than 5 min: same scan; cancel unadopted `created` orphans; adopt live ones and report them.
4. Webhook adopts an unknown sub id when `notes.userId` resolves and the user has no other live row, and still reports.
5. Logs: ids and status only. `notes` carries the email and is never logged.
(b) — list on every subscribe — rejected: a Razorpay call per subscribe, other users' notes downloaded, no time anchor.

**AC5 key guard:** in the `env.ts` zod schema via a pure `checkRazorpayKeyMode(nodeEnv, keyId)`, so every entry point refuses to boot. Rules: a `rzp_live_` key outside `NODE_ENV=production` is always refused. A `rzp_test_` key under `production` is refused unless `RAZORPAY_ALLOW_TEST_KEYS=true` is set explicitly — that flag exists for the demo compose only, which runs `NODE_ENV=production` with test keys; set it there, one line in `docker-compose.demo.yml` (root file: Priya extends Shashank's claim to that one file for this ticket). The flag is logged at warn on boot. Never set it in a real production environment; it goes on the pre-`main` checklist as "must be absent".
