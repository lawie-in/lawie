# Transactional email audit — 26 Oct 2026

## Arjun (26 Oct 2026) — summary and prod checklist

Founder report after go-live: no welcome mail after sign-up, no mail after a successful ₹65 top-up. Audit below (read-only, by a QA agent). Two different causes:

1. **Welcome mail does not exist in code.** Template stub only (T-222 still open). Verification mail does exist.
2. **Top-up receipt exists only as the GST tax invoice mail**, gated by `INVOICE_EMAIL_ENABLED=true`, complete `GST_*` settings, payment date ≥ `GST_EFFECTIVE_FROM`, `REDIS_URL`, and the worker's `BILLING_SERVICE_URL`. Any one missing → silence, no error to the user.

**Founder, on the prod box (morning), in order — names only, no values here:**
- Billing log: `grep -i "invoice" ~/.pm2/logs/lawie-billing-out-3.log | tail` → tells which gate stopped it (`INVOICE_EMAIL_ENABLED off`, `GST config incomplete`, `before GST_EFFECTIVE_FROM`). Fix the env line(s), `pm2 restart lawie-billing --update-env`; the 5-minute sweep then sends the backlog by itself.
- Worker log: `grep -i "SES\|Email sent\|Email send failed\|Dry-run\|FATAL" ~/.pm2/logs/lawie-email-worker-*.log | tail` → `MessageRejected` = SES **sandbox** or `lawie.in` not verified in ap-south-1 (AWS console → SES → Account dashboard → request production access); `HTTP_401` = `INTERNAL_SECRET` differs between worker and auth/billing; `NETWORK` = `AUTH_SERVICE_URL`/`BILLING_SERVICE_URL` must be `http://localhost:4001` / `:4003`; `Dry-run` = `EMAIL_DRY_RUN` must be `false`.
- Keys: the worker reads `AWS_SES_ACCESS_KEY_ID` / `AWS_SES_SECRET_ACCESS_KEY` and `EMAIL_FROM_ADDRESS` (not `EMAIL_FROM`). `EMAIL_DEV_REDIRECT_TO` must not exist on prod.
- Password-reset mail is refused by the worker unless `GST_ADDRESS` is set (footer rule) — same env fix.
- Managed Redis: BullMQ needs `maxmemory-policy noeviction`; set it on the managed instance.

**Tickets (sent to Priya):** welcome mail (verification + first Google sign-in), plain payment receipt when no GST invoice is due, payment-failed / subscription activated / halted / cancelled mails, auth enqueue timeout (silent hang when Redis is down), worker health that actually checks Redis + SES.

---

# Lawie transactional email audit (read-only, HEAD a9e35cf2, 26 Oct 2026)

## 0. Architecture

Producers (auth and billing) call `enqueueEmail()` in `packages/email-client/src/index.ts:203`. That pushes a **BullMQ job onto Redis**. It does not make an HTTP call.
- **Queues:** `email-high` and `email-low` (`index.ts:50-53`).
- **Redis prefix:** `{<EMAIL_QUEUE_PREFIX>}`, default `{lawie}` (`index.ts:359-362`). Keys are `{lawie}:email-high:wait|active|delayed|failed|completed`. The verify dedupe key is `{lawie}:email-high:de:verify:<userId>`.
- **Producer connection:** reads `process.env.REDIS_URL` directly. If it is missing, it throws `REDIS_URL must be set before calling enqueueEmail()` (`index.ts:345-348`).
- **Retries:** 5 attempts for the high tier and 3 for the low tier. Backoff is exponential, starting at 5 s. Failed jobs are kept 30 days and completed jobs 7 days (`index.ts:209-214`).
- **Dead letter:** there is no separate dead-letter queue. The BullMQ `failed` set plays that role. To replay a job, run `yarn workspace @lawie/email-worker replay <queue> <jobId>` (`apps/email-worker/scripts/replay.ts`). The script's usage text says `email:high`, but the real queue name is `email-high`.
- **Worker:** `apps/email-worker/src/worker.ts:958-1009` drains both queues. For most templates it calls auth or billing **over HTTP with INTERNAL_SECRET** at send time to get the address, link or invoice view. It then renders and sends through SES v2 (`providers/ses.ts`).
- **`POST /send`:** the worker has this HTTP route (`routes/send.ts`), but **no service calls it**.

Only **5 producer call sites** exist in the repo:
- `apps/auth/src/services/verify-email.service.ts:311` sends `auth.verifyEmail`.
- `apps/auth/src/services/auth.service.ts:110` sends `auth.signupAttempt` (via `deps.enqueue`).
- `apps/auth/src/services/password-reset.service.ts:155` sends `auth.passwordReset` (via `d.enqueue`).
- `apps/auth/src/services/unverified-sweep.service.ts:427` sends `auth.unverifiedDeletionNotice`.
- `apps/billing/src/services/invoice-email.service.ts:176` sends `billing.taxInvoice` or `billing.creditNote`.

The worker has 7 registered templates (`apps/email-worker/src/templates/index.ts:45-57`): `auth.welcome` (a stub), `auth.verifyEmail`, `auth.passwordReset`, `auth.unverifiedDeletionNotice`, `auth.signupAttempt`, `billing.taxInvoice` and `billing.creditNote`.

The `EmailTemplate` union has 8 more ids with **no template and no producer**: `subscriptionConfirmed`, `paymentFailed`, `monthlyInvoice`, `lowCreditWarning`, `draftComplete`, `referralIssued`, `advocatePackInvite` and `founderDailyDigest`. A job for any of them would fail with `Template "<id>" is not registered`.

## 1. Event → email matrix

| Event | Sends today? | Enqueued by | Template | Trigger (file:line) | Gate / condition |
|---|---|---|---|---|---|
| Sign-up, email + password (verification) | **Yes** | auth | `auth.verifyEmail` (high) | `auth.service.ts:197` → `requestVerifyEmail` → `verify-email.service.ts:311` | Account is live, active, unverified and not Google (`:291-293`). Resend cap 1/2 min and 5/24 h in Redis (`:297-309`). One pending job per user (T-390 dedupe). The worker mints the link via `POST {AUTH_SERVICE_URL}/internal/verify-email/mint` (`worker.ts:154-185`). A test account gets 409 and no mail (`internal-verify.routes.ts:58-61`). |
| Sign-up attempt on an existing address | Yes | auth | `auth.signupAttempt` (high) | `auth.service.ts:110` (called from `:152`, `:188`) | At most 1 per address per hour (SET NX). The worker refuses a live send without `GST_ADDRESS` (`worker.ts:700-709`). |
| Email verified (welcome) | **No** | — | `auth.welcome` is registered (stub) but **never enqueued** | Would hook at `verify-email.service.ts:241` (`verifyEmailToken`, verified branch) | T-222 is still "To do" (`handoff/tickets/T-222-welcome-email.md`). Verification and welcome are separate mails. Only verification exists. |
| Google sign-in, first time | **No** | — | none. There is no verify mail either, because a Google account counts as verified. | `apps/auth/src/config/passport.ts:150-169` (`User.create`; `'New user created via Google OAuth'` at :167) | T-222 AC1 wants a welcome here. |
| Password reset requested | Yes | auth | `auth.passwordReset` (high) | `password-reset.service.ts:155` | Rate limit (`:130-145`). The user must have a password or Google (`:150`). The worker **refuses a live send while `GST_ADDRESS` is unset** (`worker.ts:733-743`, `placeholders.ts:214-221`). Link minted via `/internal/password-reset/mint`. |
| Password reset completed | No | — | — | `password-reset.service.ts:263` (`'Password reset'`) | — |
| Password changed (settings) | **No** | — | — | `auth.service.ts:690` (`'Password changed'`) | — |
| Top-up paid (₹65 Ink): receipt / invoice | **Only if the GST invoice issues AND `INVOICE_EMAIL_ENABLED=true`** | billing | `billing.taxInvoice` (high) | Webhook `subscription.service.ts:2246` → `grantTopupInk` :2284 → `issueInvoiceOnCapture` :2340 → `invoice.service.ts:457` `queueInvoiceEmailInBackground` → `invoice-email.service.ts:176` `enqueueEmail` | (a) All `GST_*` seller vars and `GST_EFFECTIVE_FROM` must be set (`config/gst.ts:58-73,109-115`). Otherwise there is no invoice and **no email at all**. (b) Payment must be on or after `GST_EFFECTIVE_FROM` (`invoice.service.ts:155-157`, `:542-551`). Otherwise no invoice is ever issued. (c) `INVOICE_EMAIL_ENABLED==="true"` and `REDIS_URL` set (`invoice-email.service.ts:89-91`, billing `config/env.ts:80-83`; **default false**). (d) User not erased. (e) Worker has `BILLING_SERVICE_URL`. The sweep retries every 5 min (`invoice-sweep.service.ts:69-105`). There is **no non-GST receipt**. |
| Subscription activated | No | — | `billing.subscriptionConfirmed` id only | `subscription.service.ts:2423` | `.activated` gets no invoice (by design) |
| Subscription charged (first charge and renewals) | Yes (the GST invoice mail) | billing | `billing.taxInvoice` | `subscription.service.ts:2721-2742` (`issueInvoiceOnCapture` :2724) | Same gates as top-up |
| Payment failed | **No** | — | `billing.paymentFailed` id only | `subscription.service.ts:2881-2882` (warn `'Payment failed for subscription'`) | Subscription payments only. A failed top-up is not handled at all. |
| Subscription cancelled | **No** | — | — | `subscription.service.ts:2753` (user cancel: `cancelSubscriptionAtCycleEnd` :2139) | — |
| Subscription expired | No | — | — | `subscription.service.ts:2767` | — |
| Subscription paused / halted | **No** | — | — | `subscription.service.ts:2796-2797` | — |
| Refund processed (credit note) | Yes, if the original invoice exists | billing | `billing.creditNote` | `subscription.service.ts:2368` → `invoice.service.ts:457` | Same gates |
| Draft completed | No | — | `drafting.draftComplete` id only | `apps/drafting/src/routes/documents.routes.ts:1161`, `:1904` (`recordGeneration` with status `completed`) | Drafting is synchronous (SSE), so the user is on screen when it finishes |
| Unverified-account deletion notice (T-358) | Yes, when `UNVERIFIED_SWEEP_ENABLED=true` | auth sweep | `auth.unverifiedDeletionNotice` (low) | `unverified-sweep.service.ts:427` | `apps/auth/src/config/env.ts:45` |
| Account close / erase | **No** | — | — | `account-erase.service.ts:501` (`'Account close started; account locked'`), `:432` (`'Account erased'`) | — |
| Invoice email-view (T-436) | Not an email. It is the worker's data source. | billing route | — | `apps/billing/src/routes/internal.routes.ts:119-171` | `requireInternalSecret`. A 404 or 409 makes the worker throw `UnrecoverableError`. A 410 means the user was erased, and the worker skips the job. |
| Referral Ink granted | No | — | `admin.referralIssued` id only | `apps/auth/src/services/referral.service.ts:322` (`'Deferred referral Ink granted'`) | — |
| Coupon used on top-up | No | — | — | `subscription.service.ts:2296-2330` | — |
| Admin / finance alerts | **No** | — | `admin.founderDailyDigest` id only. `EMAIL_FOUNDER` is declared (`apps/email-worker/src/config/env.ts:47`) and **used nowhere**. | — | Sentry only |

## 2. Why prod may be silent

### Case A: verification and welcome after sign-up

**The welcome email:** no code sends it, so this is not a config problem. The fix is ticket T-222.

The verification email can stop at any of these points:

1. **auth: `registerUser` → `requestVerifyEmail`** (`auth.service.ts:197-206`).
   - It logs `'Verify email requested at sign-up'` with `outcome` = queued | limited | already_verified | not_found | unavailable.
   - `'Verify email request failed at sign-up'` means it threw.
   - `outcome: unavailable` comes with `'Verify email not queued: rate-limit store unavailable'`. Auth's Redis is down.
   - `'Verify email enqueue failed'` (with `errKind`) means the BullMQ push failed. If `REDIS_URL` is missing from `process.env`, `errKind` is `Error`. Auth's own zod default (`redis://localhost:6379`, `apps/auth/src/config/env.ts:17`) does not help, because the email client reads the raw env.
   - **Silent hang:** the producer connection uses `maxRetriesPerRequest: null` and `enableReadyCheck: false` (`email-client/src/index.ts:349-352`), and auth sets **no timeout**. If Redis is unreachable, `queue.add` waits forever. The log shows `outcome: queued` and no error line. Billing caps its push at 5 s (`invoice-email.service.ts:69,175`); auth does not.
2. **Redis.** A queued job sits in `{lawie}:email-high:wait`.
   - Check `LLEN "{lawie}:email-high:wait"`, `ZCARD "{lawie}:email-high:failed"` and `ZCARD "{lawie}:email-high:delayed"`.
   - If `wait` keeps growing, the worker is not consuming. Either `REDIS_URL` or `EMAIL_QUEUE_PREFIX` differs between producer and worker, or the workers never started.
3. **email-worker boot** (`index.ts`, `worker.ts:958-1009`).
   - On a config error it prints `[email-worker] FATAL: cannot start (...); missing required setting(s): ...` to stderr and exits 1, so pm2 crash-loops (`config/env.ts:160-177`).
   - Required always: `REDIS_URL`, `INTERNAL_SECRET` (at least 16 chars) and `AUTH_SERVICE_URL` (must be a URL).
   - Required with `ses`: `AWS_SES_ACCESS_KEY_ID` and `AWS_SES_SECRET_ACCESS_KEY`. The generic `AWS_ACCESS_KEY_ID` is not read.
   - `'Workers not started (live mode): email footer placeholders are not filled in yet; ...'` means no job is consumed. `/health` then returns 503 with `unfilled_footer_placeholders` (`app.ts:21-33`).
   - A healthy boot logs `'Worker started'` once for each queue, then `'📨 Email Worker up'` with `provider` and `dryRun`.
4. **The worker processes the job.**
   - `'Verify email not sent: already verified, Google account or no such user'`: auth answered 409 or 404.
   - `'Email send failed'` with `VerifyMintError` and `HTTP_401`: `INTERNAL_SECRET` differs between the worker and auth.
   - `'Email send failed'` with `NETWORK` or `TIMEOUT`: `AUTH_SERVICE_URL` is wrong. It must point straight at auth (`http://localhost:4001`), because the gateway refuses `/internal/`.
   - `'Email not sent: unfilled footer placeholders'`.
   - `'SES send failed'` (with `errorName`, `code`, `statusCode`; `providers/ses.ts:116-126`), then `'Email send failed'` and `'Job failed'`. Common SES errors:
     - `MessageRejected` ("Email address is not verified"): SES is still in **sandbox**, or the sender identity is unverified in that region.
     - `AccessDeniedException`: the IAM policy lacks `ses:SendEmail` for the identity.
     - `InvalidClientTokenId`, `UnrecognizedClientException` or `SignatureDoesNotMatch`: the key is bad or deactivated. Go-live step 1 deactivated an IAM key.
     - `AccountSendingPausedException`, `Throttling`.
   - `'Dry-run send — no SES call made'`: **`EMAIL_DRY_RUN=true` or `EMAIL_PROVIDER=dry-run` is set on prod**. The job "succeeds" and nothing is sent. `/health` still returns 200, with `dryRun: true`.
   - `'Email sent'` with a `messageId`: SES accepted the mail. Next, look at SES sending stats, the spam folder, the suppression list and DKIM/SPF.
   - If **`EMAIL_DEV_REDIRECT_TO` is set on prod**, every recipient is rewritten to that one address (`ses.ts:70`). It must be absent.
5. **auth mint route** (`lawie-auth` log): `'Verify link minted'` or `'Verify link not minted'` (`verify-email.service.ts:175,179`).

### Case B: receipt for the ₹65 top-up

Only the webhook credits Ink: `grantTopupInk` has a single caller, `subscription.service.ts:2284`. So if the Ink arrived, the webhook reached billing and the invoice step ran. Likely stop points, most likely first:

1. **`INVOICE_EMAIL_ENABLED` is not exactly `true`.** Its default is `false` (`apps/billing/src/config/env.ts:80-83`).
   - At issue time billing logs `'invoice email: INVOICE_EMAIL_ENABLED off or REDIS_URL not set; not queued, the sweep will retry'`.
   - Every 5 min the sweep logs `'Invoice sweep: INVOICE_EMAIL_ENABLED off or REDIS_URL not set; invoice emails waiting'` with `pending`.
   - Once the flag is fixed, the sweep sends the backlog on its own.
2. **The GST seller config is incomplete.** All of these must be set: `GST_GSTIN`, `GST_LEGAL_NAME`, `GST_TRADE_NAME`, `GST_ADDRESS`, `GST_STATE_CODE` (one of the 36 valid codes) and `GST_EFFECTIVE_FROM`.
   - Billing logs `'invoice: issue failed; the invoice sweep will retry'` with `errName: InvoiceConfigError`.
   - Every 5 min it logs `'Invoice sweep: GST config incomplete; invoices waiting'`. The `missing` field lists the var names.
   - The row stays in state `issuing`, so no email is ever queued.
3. **The payment came before `GST_EFFECTIVE_FROM`.** Billing logs `'invoice: payment before GST_EFFECTIVE_FROM; none due'` or `'invoice: payment before GST_EFFECTIVE_FROM; dropped'`. This user never gets an email, because no non-GST receipt exists.
4. **Other billing lines:**
   - `'invoice issued'`, then `'invoice email queued'` on success.
   - `'invoice email: enqueue failed; the sweep will retry'`, `'invoice email: queued but marker not set'`, `'invoice email: skipped_erased'`.
   - `'Invoice sweep'` (counts).
   - `'Webhook handler error'`, `'Webhook signature verification failed'`, `'Webhook: unknown top-up SKU'`.
5. **Worker side.**
   - `'Email send failed'` with `BillingViewError` `NO_BILLING_URL`: the worker env has no `BILLING_SERVICE_URL`. Billing has already marked the row as queued, so once the job uses up its 5 attempts it has to be **replayed** from `{lawie}:email-high:failed` (jobId `invoice-<invoiceId>`).
   - `HTTP_401`: the internal secret differs between worker and billing.
   - `NETWORK` or `TIMEOUT`: the URL is wrong. It must point straight at billing (`http://localhost:4003`).
   - `BAD_RESPONSE`: the view did not parse, for example because `customer.email` is empty on the row.
   - `'Invoice email not sent: billing has no issued row for this id'`, `'Invoice email not sent: billing row does not match the job (user, id or kind)'` and `'Invoice email not sent: user erased or being erased'`.
   - On the billing side, the matching line is `'invoice email-view read failed'`.
   - After that, the same SES lines as in Case A apply.

### Env / settings needed (names only)
- **auth:**
  - `REDIS_URL` must really be in `process.env`. Auth's default is not enough, because the email client reads the raw env.
  - `EMAIL_QUEUE_PREFIX` must match the worker's.
  - `INTERNAL_SECRET` and `FRONTEND_URL` (used to build the verify link).
  - Optional: `UNVERIFIED_SWEEP_ENABLED`.
  - Must be absent on prod: `TEST_SIGNUP_BYPASS` and `TEST_SIGNUP_BYPASS_SECRET`.
- **billing:**
  - `REDIS_URL`, `EMAIL_QUEUE_PREFIX`, `INVOICE_EMAIL_ENABLED=true` and `INTERNAL_SECRET`.
  - `FRONTEND_URL` (the email's `downloadUrl`).
  - `GST_GSTIN`, `GST_LEGAL_NAME`, `GST_TRADE_NAME`, `GST_ADDRESS`, `GST_STATE_CODE` and `GST_EFFECTIVE_FROM`. `GST_SIGNATURE_PATH` is optional.
  - `RAZORPAY_WEBHOOK_SECRET`.
- **email-worker:**
  - `REDIS_URL`, `EMAIL_QUEUE_PREFIX`, `INTERNAL_SECRET`, `AUTH_SERVICE_URL` and `BILLING_SERVICE_URL`.
  - `EMAIL_PROVIDER` (default `ses`) and `EMAIL_DRY_RUN` (must be `false` or empty).
  - `AWS_REGION` (default `ap-south-1`), `AWS_SES_ACCESS_KEY_ID` and `AWS_SES_SECRET_ACCESS_KEY`.
  - `EMAIL_FROM_ADDRESS` (default `noreply@lawie.in`), `EMAIL_FROM_NAME` and `EMAIL_REPLY_TO`.
  - `GST_ADDRESS`: the reset and sign-up-attempt mails need it. The worker reads it raw from `process.env`.
  - `EMAIL_WORKER_CONCURRENCY`, `PORT` (default 9100) and `SENTRY_DSN`.
  - Must be absent: `EMAIL_DEV_REDIRECT_TO`.
- **`EMAIL_FROM` is not a setting the code reads.** `handoff/ops/go-live-2026-10-23.md:28` says to set `EMAIL_FROM`, but the worker reads `EMAIL_FROM_ADDRESS` and `EMAIL_FROM_NAME`. A value set only as `EMAIL_FROM` is ignored, and the worker falls back to `noreply@lawie.in`. That works only if `lawie.in` is verified in SES in `AWS_REGION`.
- No AppSetting is involved in any email path.
- All pm2 apps load the one production env file in `/home/ubuntu/lawie/` (`ecosystem.config.js:1-3`). So `INTERNAL_SECRET` and `EMAIL_QUEUE_PREFIX` match unless something overrides them. After an edit, run `pm2 reload … --update-env`, or delete and start the processes.
- **Redis contradiction to resolve:** the go-live note puts `REDIS_URL` on the box at `127.0.0.1:6379` (`go-live-2026-10-23.md:28,106`). But `handoff/ops/prod-box-setup.sh:31-34` **disables the local redis-server** and says `REDIS_URL` points at a managed service. Confirm that auth, billing and email-worker all point at the same live Redis. If it is managed Redis, BullMQ needs `maxmemory-policy noeviction`. BullMQ logs an eviction-policy warning at worker start if it is not.

### SES points that catch out a fresh prod box
- **Sandbox.** Until AWS grants production access for `ap-south-1` (T-220 AC3; `handoff/tickets/T-220-email-actually-sends.md:25,75`), SES delivers only to verified recipient addresses. Real users then get `MessageRejected`, the job retries 5 times, and it lands in the failed set. If the worker logs `'SES send failed'`, this is the first thing to check.
- **Identity.** The domain identity `lawie.in` (Easy DKIM, MAIL FROM `mail.lawie.in`) must be verified in the **same AWS account and region** as the `lawie-ses-sender` key and `AWS_REGION`.
- **Key.** The IAM key must allow `ses:SendEmail` on that identity. Go-live step 1 deactivated one IAM key, so confirm the worker uses the `lawie-ses-sender` pair.
- **Health check.** `/health` on `:9100` reports only `provider`, `dryRun` and the placeholder guard. It does **not** check Redis, SES or whether jobs are flowing, so a 200 does not prove mail is going out. Look at the `dryRun` field.

### Strings to grep
- `~/.pm2/logs/lawie-email-worker-*.log`: `FATAL: cannot start`, `Email Worker up`, `Worker started`, `Workers not started`, `Dry-run send`, `Email sent`, `SES send failed`, `Email send failed`, `Job failed`, `Worker error`, `Verify email not sent`, `Password reset email not sent`, `Invoice email not sent`, `Email not sent: unfilled footer placeholders`.
- `lawie-auth-*.log`: `Verify email requested at sign-up`, `Verify email not queued`, `Verify email enqueue failed`, `Verify link minted`, `Verify link not minted`, `Email verified`, `Password reset email queued`, `Password reset enqueue failed`, `Sign-up attempt mail enqueue failed`, `Redis connection error`.
- `lawie-billing-*.log`: `invoice issued`, `invoice email queued`, `invoice email: INVOICE_EMAIL_ENABLED off`, `Invoice sweep: INVOICE_EMAIL_ENABLED off`, `Invoice sweep: GST config incomplete`, `invoice: issue failed`, `payment before GST_EFFECTIVE_FROM`, `invoice email: enqueue failed`, `invoice email-view`, `Webhook handler error`, `Webhook signature verification failed`.

## 3. Gaps, ranked by customer impact

1. **No payment receipt when no GST invoice issues** (GST config missing, or a payment before `GST_EFFECTIVE_FROM`).
   - Template `billing.paymentReceipt`: "We received ₹{amount} on {date}: {ink} Ink added (or {plan} active). Order {orderId}. Balance {balance}."
   - Hook: next to `subscription.service.ts:2340` and `:2724`, after `grantTopupInk` returns > 0 at `:2284`. The T-413 claim keeps it to one per order.
2. **Payment failed** (subscription renewal).
   - Template `billing.paymentFailed`: "Your {plan} renewal of ₹{amount} failed; update payment by {date}."
   - Hook: `subscription.service.ts:2881`, using the payment id as the idempotency key.
3. **Subscription halted or paused.**
   - Template `billing.subscriptionHalted`: "{plan} on hold after failed payments; Ink stays until {paidThrough}."
   - Hook: `:2796-2797`.
4. **Welcome** (after email verification, and on first Google sign-in).
   - Template `auth.welcome`. The template exists; it needs the T-222 copy: "Welcome {name}: {n} free Ink, how to start a draft, help at contact@."
   - Hooks: `verify-email.service.ts:241` (key `welcome:<userId>`) and `passport.ts:167`.
5. **Subscription activated.**
   - Template `billing.subscriptionConfirmed`: "{plan} active; {ink} Ink added; renews {date}."
   - Hook: `subscription.service.ts:2423`, after the grant.
6. **Password changed or reset completed** (security notice).
   - Template `auth.passwordChanged`: "Password changed at {time}; all sessions signed out; not you? reset."
   - Hooks: `auth.service.ts:690` and `password-reset.service.ts:263`.
7. **Subscription cancelled.**
   - Template `billing.subscriptionCancelled`: "Cancelled; {plan} stays until {paidThrough}; no further charges."
   - Hook: `:2753`.
8. **Account close.**
   - Template `auth.accountClosed`: "Closing started; data erased by {date}."
   - Hook: `account-erase.service.ts:501`. Resolve the address before erasure, because it is gone after `:432`.
9. **Subscription expired.**
   - Template `billing.subscriptionExpired`: "{plan} ended; you're on Free."
   - Hook: `:2767`.
10. **Low Ink.** Template `billing.lowCreditWarning` (the id exists). Hook at the Ink debit, when the balance crosses a threshold.
11. **Referral Ink granted.** Template `admin.referralIssued`. Hook: `referral.service.ts:322`.
12. **Founder alerts** to `EMAIL_FOUNDER`, which is declared but unused. Hooks:
    - webhook handler failure, `billing.routes.ts:592`
    - `'Invoice sweep: GST config incomplete'`
    - final job failure, `worker.ts:906`
    - a daily digest: `admin.founderDailyDigest` (the id exists)
13. **Draft completed.** Low value, because drafting is synchronous on screen (`documents.routes.ts:1161,1904`).

Each new template must also be added to the worker `REGISTRY` (`templates/index.ts:45`), and to `TEMPLATE_FOOTERS` (`placeholders.ts:171`) if it has a footer. Ajay must check the copy (T-225).

## 4. Test coverage

No tests were run: there is no `node_modules` in the checkout.

**Covered:**
- **email-client:** 6 files under `packages/email-client/src/__tests__/`. They cover enqueue, verify dedupe, reset, sign-up attempt and the unverified notice.
- **email-worker:** 43 files.
  - Verify: `t223-*`, `t390-*`.
  - Password reset: `t221-*`.
  - Sign-up attempt: `t522-*`.
  - Unverified notice: `t358-*`.
  - Invoice and credit note: `t436-invoice-worker`, `t436-invoice-email-templates`, `t436-billing-url-env`.
  - Env fail-fast: `t220-ac8`.
  - Retry and replay: `t220-ac4-*`.
  - Dry run: `ses-dry-run`.
  - Placeholder guard and health: `t379-*`, `t223-placeholder-*`.
  - Internal secret: `t438-*`.
  - No PII in logs: `t220-ac6`, `t455`, `t229-*`.
  - Welcome: `t318`, `t557`. These test the copy only; nothing sends the email.
- **auth:** `t223-verify-email`, `t223-routes`, `t223-mint-route`, `t223-google-no-verify`, `t223-resend-cap-real-redis`, `t221-forgot-reset`, `t221-no-leak`, `t522-neutral-signup`, `t522-resend`, `t358-*`, `t436-verify-resend-all`, `t436-stamp-on-send-only`, `register-role`.
- **billing:**
  - Webhook to invoice (top-up `order.paid` / `payment.captured`, `subscription.charged`, the `GST_EFFECTIVE_FROM` cutoff): `t436-invoice-issue.test.ts:42-379`.
  - Invoice to enqueue, marker, no `REDIS_URL`, failed or hanging enqueue: `t436-bc-billing.test.ts:402-538`.
  - Sweep re-enqueue: `t436-invoice-sweep.test.ts`.
  - The email-view route: `t436-invoice-routes.test.ts`.

**Not covered:**
- No end-to-end test from the webhook to the enqueue. The two halves are tested separately.
- No test runs the `INVOICE_EMAIL_ENABLED` parser together with the happy path.
- No test covers auth enqueueing while Redis is unreachable (the silent hang).
- No real SES or sandbox test. This is by design.
- None of the gap events in section 3 has a test, because none has code.
- Drafting has no email code and no email tests.
- `/health` does not check Redis.
