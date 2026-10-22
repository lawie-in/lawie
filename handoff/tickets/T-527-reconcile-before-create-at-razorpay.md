# T-527: Reconcile before create at Razorpay

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Full chain (billing) |
| Status | Merged into develop_staging 9172597f (CI 883 green), 21 Oct 2026. Prod must set RAZORPAY_KEY_GUARD=strict and must not set RAZORPAY_ALLOW_TEST_KEYS. Optional findings in T-542. Priya |
| Source | Arjun; T-518 and T-526 reviews |

## Problem
If `subscriptions.create` times out, the outcome at Razorpay is unknown. T-526 only alerts. A retry can create a second live subscription.

## Acceptance criteria
1. Before `subscriptions.create`, look up the customer's subscriptions at Razorpay by `notes.userId` (Razorpay has no customer id until authorisation). If a live one exists with no local row, adopt it: write the row and return it instead of creating again.
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

7. `docker-compose.demo.yml` gets `RAZORPAY_ALLOW_TEST_KEYS=true` (the demo runs NODE_ENV=production with test keys). Founder's pre-main checklist: that flag must be ABSENT in the real production environment.

## Arjun (21 Oct 2026, round 2) — Razorpay status wins; adopt under the lock; partial unique index as T-535

- **Bug:** agreed. A listed item is classified by Razorpay's live status, never the local row. Live at Razorpay → 409 `subscription_exists`, no cancel, regardless of what the local row says; the local row is then brought up to date from the live status (the webhook will do the same, idempotently).
- **G1/G2/G3 → (a) now.** The webhook adopt takes the same `SubscriptionCreateLock`. Lock held → **return 500 so Razorpay retries**; the event is idempotent on sub id and lands after the create finishes. Report-only would lose the adopt until the sweep. Post-create check in `createSubscriptionLocked`: after the new row is written, if another non-terminal row for the user exists, the **earlier `createdAt` wins**: cancel the new sub at Razorpay (`cancel(id,false)`), mark its row cancelled, return 409 with the existing row (or its checkout link if it is `created`). Logged with ids only.
- **(b) → T-536** (Priya posts, billing, after T-527, **blocking before `main`**): partial unique index on `Subscription { userId }` for non-terminal statuses, built at startup like T-519, preceded by a data check (aggregate on `develop`'s DB for users with >1 non-terminal row; ids only in the report; fix by hand before the index). Touches `Subscription.model.ts`, so its own claim.

## Arjun (21 Oct 2026, merge question) — key guard is warn-only until a prod environment exists

Fact (founder, 17 Oct): the develop box runs pm2 from `deploy.sh` with a shared `.env.production`, `NODE_ENV=production`, Razorpay **test** keys. Not the demo compose. So a refuse-to-boot guard would take billing down on the box Anushka tests, the first time `develop` is deployed after this merge.

Ruling: **(c)**. The guard ships now but is **warn-only by default**: a test key under `NODE_ENV=production` without `RAZORPAY_ALLOW_TEST_KEYS=true` logs one `error` line and a Sentry event at boot and continues. It **refuses to boot** only when `RAZORPAY_KEY_GUARD=strict` is set; T-533's production compose sets `strict`, the demo compose keeps `RAZORPAY_ALLOW_TEST_KEYS=true`, develop sets nothing. A live key outside production is always refused (that case cannot be on develop today). Pre-`main` checklist gains: `RAZORPAY_KEY_GUARD=strict` present, `RAZORPAY_ALLOW_TEST_KEYS` absent. The founder may add `RAZORPAY_ALLOW_TEST_KEYS=true` to develop's env whenever convenient to silence the warning; nothing depends on it. Tests cover all three modes. Merge after that change and a fresh tester run (small-fix mode; a fresh reviewer only if the diff goes beyond the guard).

Optional findings → **T-542 "billing reconcile hygiene"** (Priya posts, after T-536): (1) paid orphan unadopted in a rare timing — fetch the sub, cancel the checkout first, then adopt; (2) webhook adopt releases the lock before the row is active — hold it through the write; (3) a stuck marker's scan window grows until the 3-page cap 503s forever — bound `to` to `lockCreatedAt + 24 h` and alert past that; (4) budget check in the post-create duplicate cancel; (5) busy-webhook alert through the route layer (routes claim).
