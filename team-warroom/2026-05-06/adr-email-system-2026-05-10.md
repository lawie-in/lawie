# ADR-007: Email System for Lawie

- Status: Proposed
- Date: 2026-05-10
- Author: Arjun (CTO)
- Supersedes: none
- Related: SCRUM-15 (Sentry), SCRUM-39 (Secrets Manager), SCRUM-41 (Redis Cloud), SCRUM-58 (Helicone), SCRUM-71 (Referral), SCRUM-73 (Credits)

---

## 1. Context

Phase 1 needs transactional email for signup, verification, password reset, billing receipts, payment failures, low-credit warnings, monthly invoices, referral admin pings, advocate-pack invitations (Ranchi review), and the founder daily digest.

Hard constraints from founder:

1. Email send must be **non-blocking** on the request path. The HTTP response to signup / payment webhook / draft completion must never wait for SMTP.
2. **Every backend service** (gateway, auth, drafting, billing) must be able to enqueue email with the same one-line API.
3. **All config in `.env`** — provider creds, FROM, REPLY_TO, default email IDs — pulled from AWS Secrets Manager in staging/prod, `.env.development` locally. Same pattern as SCRUM-39.

Existing infra we can lean on:

- Redis Cloud Free already wired across all 4 services (`apps/*/src/config/redis.ts`).
- 4 Express services in Docker Compose; all share the `lawie_net` bridge.
- Sentry + Helicone DSNs already plumbed via env.
- AWS Secrets Manager pulls into `.env.development` at deploy time.

We are not adding a marketing automation tool. This is **transactional only**.

---

## 2. Decision summary

| # | Concern | Decision |
|---|---|---|
| 1 | Architecture | **BullMQ on existing Redis Cloud + dedicated `email` worker container** |
| 2 | Provider | **AWS SES (ap-south-1 / Mumbai)** with SMTP fallback via env switch |
| 3 | Templates | **React Email** compiled to HTML at build time, MJML-grade output |
| 4 | Config | `.env` keys pulled from AWS Secrets Manager (staging/prod), `.env.development` locally |
| 5 | Ops | Worker is a 5th docker-compose service `lawie_email_worker`, restart=unless-stopped, Sentry-instrumented |

---

## 3. Architecture choice — BullMQ + dedicated worker container

### Options considered

**Option A: BullMQ + Redis worker, dedicated `email-worker` container** (PICKED)
- Pros: durable jobs survive crashes, native retry+backoff, scheduled emails (daily digest), DLQ, rate-limit per provider, observable via BullMQ UI, reuses our existing Redis. Workers scale independently of API services.
- Cons: one new container, one new dependency (`bullmq`), Redis Cloud Free has a 30 MB cap — we must monitor.

**Option B: Dedicated `email-service` Express microservice** (5th HTTP service)
- Pros: clean service boundary, REST API.
- Cons: synchronous HTTP from caller defeats the "non-blocking" goal unless we add a queue anyway. Adds a network hop and another health check for no real isolation gain. Rejected.

**Option C: Per-service `setImmediate` fire-and-forget**
- Pros: zero infra, zero dependency.
- Cons: emails lost on crash/restart, no retry, no scheduled jobs (digest needs cron), no DLQ, no observability, no rate limiting against SES. Unacceptable for billing receipts and password resets. Rejected.

### Pick: Option A

- Producers: a tiny `@lawie/email-client` package that any service imports. One call: `enqueueEmail({ template, to, data, priority })`. Adds the job to a BullMQ queue on Redis. Returns immediately (sub-5ms).
- Consumer: a single Node process (`apps/email-worker`) running BullMQ workers — pulls jobs, renders the template, sends via SES, retries on failure, publishes metrics to Sentry breadcrumbs.
- Two queues: `email:high` (verification, reset, payment receipt, payment failure) and `email:low` (digest, draft-complete, monthly invoice, low-credit warning).

### Why this is the right pick for Phase 1

- We already pay for Redis Cloud — marginal infra cost is zero.
- Non-blocking by definition: producer side is a single Redis LPUSH equivalent.
- One new container in `docker-compose.yml`, identical Dockerfile pattern to existing apps.
- Vishal already knows this stack — no new mental model.
- DLQ + Sentry covers our reliability posture.

---

## 4. Provider choice — AWS SES (ap-south-1)

### Comparison

| Provider | Cost / 1k | Free tier | India deliverability | GST | Notes |
|---|---|---|---|---|---|
| **AWS SES (Mumbai)** | $0.10 (~₹8.50) | 62k/mo from EC2 | High — Mumbai region IPs, BIMI-ready | GST invoice on AWS | Already in our AWS account |
| Resend | $0/$20 mo (3k free) | 3k/mo | Good but US-routed | USD invoice, no GST input credit | Nice DX, expensive at scale |
| Postmark | $15/mo for 10k | 100/mo | Good | USD | Premium price, premium reputation |
| SendGrid | $19.95/mo (50k) | 100/day | Mediocre — flagged by Indian ISPs | USD | Reputation has degraded |
| Brevo (Sendinblue) | ~₹950/mo (20k) | 300/day | OK | INR + GST | Decent India presence |

### Pick: AWS SES, Mumbai (`ap-south-1`)

- Already inside the AWS account that hosts EC2 + Secrets Manager. Same IAM, same billing, GST invoice from AWS India.
- Mumbai region keeps the egress and the sender IPs in-region — better for Gmail India and Zoho Mail (district court advocates often use Zoho/Gmail for Workspace).
- Free tier (62k emails/month from EC2) covers Phase 1 entirely.
- We design the producer interface so swapping to Resend/Brevo is one config flag (`EMAIL_PROVIDER=ses|smtp`).

### Mandatory setup

- Move SES out of sandbox before launch (production access request).
- Verify domain `lawie.in` with DKIM (3 CNAME records).
- Set up SPF and DMARC (`p=quarantine` initially, tighten to `reject` after 30 days).
- Configure SES configuration set with bounces+complaints → SNS → Lambda → MongoDB suppression list (Phase 1.5; Phase 1 uses SES-native suppression).

---

## 5. Templating — React Email

### Comparison

- **Plain string templates**: brittle, no preview, no design system carryover. Rejected.
- **MJML**: solid email-safe HTML output, but separate templating language — Vishal has to learn it.
- **React Email** (`@react-email/components` + `@react-email/render`): JSX components, renders to email-safe HTML, has a `npm run email:dev` preview server, ships with sane Tailwind-like styles, used by Vercel/Resend/Linear.

### Pick: React Email

- Vishal already writes TSX daily.
- Local preview server lets Rajesh/Madhuri review templates without spinning up SES.
- Compiles to HTML at build time inside the worker — no runtime JSX cost.

### Where templates live

```
apps/email-worker/
├── src/
│   ├── templates/
│   │   ├── auth/
│   │   │   ├── welcome.tsx
│   │   │   ├── verify-email.tsx
│   │   │   └── password-reset.tsx
│   │   ├── billing/
│   │   │   ├── subscription-confirmed.tsx
│   │   │   ├── payment-failed.tsx
│   │   │   ├── monthly-invoice.tsx
│   │   │   └── low-credit-warning.tsx
│   │   ├── drafting/
│   │   │   └── draft-complete.tsx
│   │   └── admin/
│   │       ├── referral-issued.tsx
│   │       ├── advocate-pack-invite.tsx
│   │       └── founder-daily-digest.tsx
│   ├── render.ts           # template name → HTML+text
│   ├── send.ts             # SES adapter
│   ├── worker.ts           # BullMQ worker entry
│   └── queues.ts           # queue names + priorities
└── package.json
```

Each template exports `{ subject(data), Body(data) }`. The worker resolves `template` string → module via a static map (no dynamic require; safe for esbuild bundling).

---

## 6. `.env` keys

All keys go through Zod validation on worker boot (same pattern as `apps/auth/src/config/env.ts`).

### Required

```
# Provider switch
EMAIL_PROVIDER=ses                          # ses | smtp

# AWS SES (when EMAIL_PROVIDER=ses)
AWS_REGION=ap-south-1
AWS_SES_ACCESS_KEY_ID=
AWS_SES_SECRET_ACCESS_KEY=

# Default sender identity
EMAIL_FROM_NAME=Lawie
EMAIL_FROM_ADDRESS=no-reply@lawie.in
EMAIL_REPLY_TO=support@lawie.in

# Admin/founder routing
EMAIL_FOUNDER=abhinava32@gmail.com
EMAIL_ADMIN_BCC=ops@lawie.in

# Queue + worker
REDIS_URL=                                  # already exists
EMAIL_QUEUE_PREFIX=lawie:email
EMAIL_WORKER_CONCURRENCY=5
EMAIL_RATE_LIMIT_PER_SEC=14                 # SES default sandbox is 14/s
```

### Optional (with sane defaults)

```
EMAIL_PROVIDER_SMTP_HOST=                   # only when EMAIL_PROVIDER=smtp
EMAIL_PROVIDER_SMTP_PORT=587
EMAIL_PROVIDER_SMTP_USER=
EMAIL_PROVIDER_SMTP_PASS=
EMAIL_DEV_REDIRECT_TO=                      # in dev, redirect ALL mail here (e.g. abhinav+test@lawie.in)
EMAIL_DRY_RUN=false                         # logs payload, never sends
EMAIL_MAX_ATTEMPTS=5                        # retries before DLQ
EMAIL_BACKOFF_MS=30000                      # exponential, base 30s
EMAIL_HIGH_PRIORITY_LAG_BUDGET_MS=10000     # alert if exceeded
EMAIL_LOW_PRIORITY_LAG_BUDGET_MS=300000
SES_CONFIGURATION_SET=lawie-prod            # for bounce/complaint tracking
```

### Secrets Manager mapping

In staging/prod, the GitHub Actions deploy step pulls these from `lawie/email/*` paths in AWS Secrets Manager and writes to `.env.production` on the EC2 host before `docker compose up`. Same flow as auth/billing already use.

---

## 7. Integration pattern

A new shared package `@lawie/email-client` lives at `packages/email-client/`. Single export:

```ts
// packages/email-client/src/index.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export type EmailJob = {
  template:
    | 'auth.welcome' | 'auth.verifyEmail' | 'auth.passwordReset'
    | 'billing.subscriptionConfirmed' | 'billing.paymentFailed'
    | 'billing.monthlyInvoice' | 'billing.lowCreditWarning'
    | 'drafting.draftComplete'
    | 'admin.referralIssued' | 'admin.advocatePackInvite' | 'admin.founderDailyDigest';
  to: string | string[];
  data: Record<string, unknown>;
  priority?: 'high' | 'low';                // default high
  cc?: string[]; bcc?: string[]; replyTo?: string;
  idempotencyKey?: string;                  // dedupe: same key → single send
};

const conn = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const high = new Queue('email:high', { connection: conn, prefix: process.env.EMAIL_QUEUE_PREFIX });
const low  = new Queue('email:low',  { connection: conn, prefix: process.env.EMAIL_QUEUE_PREFIX });

export async function enqueueEmail(job: EmailJob): Promise<void> {
  const q = (job.priority ?? 'high') === 'high' ? high : low;
  await q.add(job.template, job, {
    jobId: job.idempotencyKey,
    attempts: Number(process.env.EMAIL_MAX_ATTEMPTS ?? 5),
    backoff: { type: 'exponential', delay: Number(process.env.EMAIL_BACKOFF_MS ?? 30000) },
    removeOnComplete: { count: 1000 },
    removeOnFail: false,                    // keep for DLQ inspection
  });
}
```

### Auth service — welcome email after signup (5 lines added)

```ts
// apps/auth/src/services/auth.service.ts (inside registerUser, after createSession)
import { enqueueEmail } from '@lawie/email-client';

void enqueueEmail({
  template: 'auth.welcome',
  to: user.email,
  data: { name: user.name },
  idempotencyKey: `welcome:${user._id}`,
});
```

`void` + no `await` keeps it strictly off the response path. The `idempotencyKey` makes a retried registration safe.

---

## 8. Worker ops

### Where it runs

New container `email-worker` in `docker-compose.yml`:

```yaml
email-worker:
  build:
    context: .
    dockerfile: apps/email-worker/Dockerfile
    target: production
  container_name: lawie_email_worker
  restart: unless-stopped
  env_file: .env.development
  environment:
    NODE_ENV: development
    REDIS_URL: redis://host.docker.internal:6379
  networks:
    - lawie_net
  depends_on: []                      # Redis is external (Cloud)
```

- No HTTP port. The worker is headless.
- Single Node process per container; concurrency tuned via `EMAIL_WORKER_CONCURRENCY` (default 5). One container is enough for Phase 1; we can `docker compose up --scale email-worker=N` if backlog grows.
- **Not PM2.** Docker is the supervisor. `restart: unless-stopped` handles crashes.
- Healthcheck: BullMQ exposes `worker.isRunning()`; we expose a tiny `/health` on port 9100 inside the container, scraped by the gateway's existing health aggregator.

### Retries + DLQ

- BullMQ exponential backoff, max attempts `EMAIL_MAX_ATTEMPTS` (default 5). Schedule: 30s, 1m, 2m, 4m, 8m.
- Failed jobs land on `email:high:failed` / `email:low:failed`. Sentry captures every failure with `template`, `to_hash` (never raw email), `attempts`, `error`.
- Manual replay via a tiny CLI (`pnpm email:replay <jobId>`) — for ops, not exposed via API.

### Observability

- Sentry: every job adds breadcrumbs `email.enqueue`, `email.send.start`, `email.send.success|failure`. PII-stripped.
- Helicone: not relevant (no LLM calls).
- BullMQ Board: `bull-board` Express app at `:9101` mounted only when `NODE_ENV !== 'production'` for local debugging.
- Custom metric in worker: `email_lag_ms` = `processedAt - enqueuedAt`. Logs to pino; alerts when above the priority budget.

### Scheduled jobs

- Daily founder digest: `BullMQ Repeat` cron `30 3 * * *` UTC = 09:00 IST. Enqueued at boot from the worker itself.
- Monthly invoice: `0 21 1 * *` UTC = 02:30 IST on day 2 each month (after Razorpay autocharge settles).
- Low-credit warning: NOT scheduled — fired inline by drafting/billing when usage crosses 80% of the credit ceiling (decided here: drafting service owns this signal because it knows credit consumption per generation).

---

## 9. Latency budget

| Class | Templates | Target queue lag (p95) | Hard ceiling |
|---|---|---|---|
| High | verifyEmail, passwordReset, paymentFailed, subscriptionConfirmed | < 5 s | 10 s |
| Low | welcome, draftComplete, lowCreditWarning, monthlyInvoice, referralIssued, advocatePackInvite, founderDailyDigest | < 60 s | 5 min |

Welcome is "low" intentionally — verification is the time-critical post-signup mail; welcome can lag by a minute without UX harm. Sentry alert fires when ceilings exceeded for 5 consecutive minutes.

---

## 10. Cost forecast (Phase 1)

Assumptions: 25 paid + 100 trial users, average 10 transactional emails/user/month + ~30 admin emails/day = **~1,650 emails/month**.

- AWS SES from EC2 free tier: 62,000/month. We use ~2.7% of it.
- SES outside free tier: $0.10 per 1k = irrelevant at this scale.
- Redis usage: each queued job is ~1 KB; 1.65k/month + retries = under 5 MB peak. Within 30 MB Redis Cloud Free.
- React Email render: zero runtime cost (compiled HTML cached per template/version).

**Forecast bill: ₹0/month** for Phase 1 email. First non-zero invoice expected at ~6,000 paid users (~600k emails/month), still under ₹500/month.

---

## 11. Risks + mitigation

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Deliverability** — Gmail/Zoho mark `lawie.in` as new-domain spam | Day-1: SPF, DKIM (verified in SES), DMARC `p=quarantine`. Day-30: tighten to `p=reject`. Warm SES sending reputation by routing welcome emails first; gradual ramp. Use SES configuration set + SNS bounce/complaint loop. Suppression list before any second send. |
| 2 | **Abuse** — attacker uses `/forgot-password` to mass-mail random addresses, or signup endpoint to send infinite welcomes | Producer-side rate limiter on auth endpoints (already present for login; extend to forgot-password and register). Idempotency key on enqueue. SES sandbox limits act as a hard cap until production access. Add a per-recipient send count threshold (>5/hour to one address ⇒ suppress + Sentry). |
| 3 | **Secrets leak** — SES creds in `.env` accidentally committed | `.env*` already in `.gitignore`. Add a pre-commit hook with `gitleaks`. SES creds use a dedicated IAM user scoped to `ses:SendEmail`, `ses:SendRawEmail` only — no other AWS access. Rotate quarterly. |

---

## 12. Out of scope (this ADR)

- Marketing email / drip campaigns (separate ADR when we ship Phase 2).
- WhatsApp / SMS notifications (separate ADR; Gupshup likely).
- Inbound email parsing (not needed Phase 1).
- Per-user notification preferences UI beyond `draftComplete` toggle (covered by SCRUM-?? — Priya to file).

---

## 13. Acceptance — done when

- `apps/email-worker` container builds and runs in dev, staging, prod.
- All 11 templates render successfully via `pnpm --filter email-worker email:preview`.
- A signup in dev triggers a real email to `EMAIL_DEV_REDIRECT_TO`.
- A staging Razorpay webhook triggers a receipt within 5s p95.
- DLQ replay CLI works against a forced-failure job.
- Sentry shows breadcrumbs on success and full error capture on failure.

---

# 14. Ticket-ready spec for Priya

Paste verbatim into `/docs/inputToDev.md`:

```markdown
## SCRUM-74 — Email System (BullMQ + SES + React Email)

**Title:** Build transactional email system — non-blocking BullMQ worker + AWS SES + React Email templates

**Priority:** P1 (blocks: SCRUM-71 founder ping, SCRUM-73 receipts, Ranchi advocate-pack invites)

**ID:** SCRUM-74

**Owner (dev):** Vishal
**Owner (PM):** Priya
**Reviewer:** Arjun (architecture), Ajay (legal copy in templates), Madhuri (template content), Rajesh (template visual design)

**Reference:** `/docs/architecture/adr-email-system-2026-05-10.md`

---

### Details (full scope)

Build a transactional email system for all 4 backend services. Architecture per ADR-007:

1. **New shared package** `packages/email-client` exporting `enqueueEmail(job)`. BullMQ producer on the existing Redis Cloud connection. Two queues: `email:high` and `email:low`. Idempotency key support.

2. **New worker app** `apps/email-worker`:
   - BullMQ worker on both queues, concurrency from `EMAIL_WORKER_CONCURRENCY`.
   - SES adapter (`@aws-sdk/client-sesv2`) as primary; SMTP adapter (nodemailer) as fallback, switch via `EMAIL_PROVIDER`.
   - React Email templates rendered at runtime, cached per template version.
   - Sentry instrumented (re-use config from `apps/auth/src/config/sentry.ts`).
   - Headless — no HTTP routes except `/health` on `:9100`.
   - DLQ + manual replay CLI (`pnpm --filter email-worker replay <jobId>`).
   - Repeatable jobs: founder daily digest (`30 3 * * *` UTC = 09:00 IST), monthly invoice (`0 21 1 * *` UTC).

3. **11 React Email templates** at `apps/email-worker/src/templates/`:
   - `auth.welcome`, `auth.verifyEmail`, `auth.passwordReset`
   - `billing.subscriptionConfirmed`, `billing.paymentFailed`, `billing.monthlyInvoice`, `billing.lowCreditWarning`
   - `drafting.draftComplete`
   - `admin.referralIssued`, `admin.advocatePackInvite`, `admin.founderDailyDigest`
   - Each template = `{ subject(data), Body(data) }`. Copy reviewed by Madhuri before merge.

4. **Wire-ins** (per service):
   - `apps/auth`: enqueue `auth.welcome` + `auth.verifyEmail` after `registerUser`. Enqueue `auth.passwordReset` inside `initiatePasswordReset` (use existing `token`).
   - `apps/billing`: enqueue `billing.subscriptionConfirmed` on `subscription.activated` webhook. Enqueue `billing.paymentFailed` on `payment.failed`. Enqueue `billing.monthlyInvoice` (cron in worker, but worker reads from MongoDB; billing service exposes an internal endpoint `/internal/users/active-paid` for the worker).
   - `apps/drafting`: enqueue `drafting.draftComplete` after successful generation IFF `user.prefs.draftCompleteEmail === true` (default false). Enqueue `billing.lowCreditWarning` when post-decrement credits cross 80% threshold (idempotency key `lowcredit:userId:periodStart`).
   - `apps/gateway`: no direct enqueue — gateway is stateless.

5. **`.env` keys** — add to all 4 services + email-worker. Required: `EMAIL_PROVIDER`, `AWS_REGION`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`, `EMAIL_FOUNDER`, `EMAIL_ADMIN_BCC`, `EMAIL_QUEUE_PREFIX`, `EMAIL_WORKER_CONCURRENCY`, `EMAIL_RATE_LIMIT_PER_SEC`. Optional listed in ADR §6. Validate via Zod on worker boot.

6. **Docker** — add `email-worker` service to `docker-compose.yml`, `docker-compose.staging.yml`, `docker-compose.prod.yml`. New `apps/email-worker/Dockerfile` modelled on `apps/auth/Dockerfile`.

7. **DNS / SES setup** — Arjun does the DNS records (DKIM, SPF, DMARC) and the SES production-access request; this is a parallel ops task, not blocking dev work.

---

### Acceptance criteria

1. `enqueueEmail({...})` returns within 10ms p95 from any of the 4 services (measured locally).
2. Email send fully off the request path: a forced SES outage does NOT fail signup, login, password reset, payment webhook, or draft completion.
3. All 11 templates preview cleanly in `pnpm --filter email-worker email:preview` (port 3001).
4. High-priority queue lag < 5s p95 in staging load test (100 emails enqueued in 10s).
5. Low-priority queue lag < 60s p95 same test.
6. SES bounce or complaint adds the address to a Mongo `email_suppressions` collection; future enqueue to that address is silently dropped with Sentry breadcrumb.
7. `EMAIL_DRY_RUN=true` causes worker to log payloads and never call SES.
8. `EMAIL_DEV_REDIRECT_TO` set in dev causes ALL mail to go to that single address regardless of `to`.
9. DLQ has every failed job after 5 attempts; replay CLI re-enqueues with new attempts counter.
10. `idempotencyKey` collision returns existing job — no duplicate send.
11. Sentry shows breadcrumb chain `email.enqueue` → `email.send.start` → `email.send.success` for happy path; failure path captured with full context (no PII — email hashed).
12. No raw email address appears in any LLM prompt, log line, or Sentry event payload (PII rule).
13. Founder daily digest fires at 09:00 IST and contains: yesterday's signups, paid conversions, drafts generated, total Anthropic spend, top 3 errors from Sentry.

---

### Tests

- **Unit:** template render snapshot tests (11 files) + `enqueueEmail` queue-routing tests (priority → correct queue).
- **Integration:** spin up Redis + worker in CI via `testcontainers`; enqueue 50 jobs across both priorities; assert lag budgets, retry behaviour, DLQ landing.
- **Provider mock:** SES mocked with `aws-sdk-client-mock`; verify exact `SendEmailCommand` payload per template.
- **End-to-end:** new auth integration test `apps/auth/src/__tests__/email.welcome.test.ts` — POST /register, assert job lands on `email:high` queue with correct payload.
- **Suppression:** simulate SES bounce SNS event; next enqueue to same address is dropped.

---

### Effort

- **6 dev-days** (Vishal):
  - Day 1: scaffold `apps/email-worker` + `packages/email-client`, Dockerfile, env validation.
  - Day 2: SES adapter + SMTP fallback + suppression list.
  - Day 3: 11 React Email templates (skeleton — copy comes from Madhuri in parallel).
  - Day 4: Wire-ins to auth, billing, drafting; idempotency keys.
  - Day 5: Repeatable cron jobs (digest, monthly invoice); DLQ replay CLI.
  - Day 6: Tests + staging deploy + smoke.

---

### Dependencies

- **Blocks:** SCRUM-71 (referral founder ping), SCRUM-73 (subscription confirmation + receipt), Ranchi advocate-pack invite, founder daily digest.
- **Blocked by:**
  - DNS access to `lawie.in` for DKIM/SPF/DMARC (Arjun, parallel).
  - SES production access (Arjun, parallel — ~24h AWS approval).
  - Madhuri to deliver template copy for 11 templates (block on day 4 only — skeleton can ship without).
  - Ajay to sign off on legal disclaimer footer (one-time, blocks merge of any template).

---

### Out of scope

- Marketing / drip emails.
- WhatsApp / SMS.
- Inbound email parsing.
- User notification preferences UI beyond a single `draftCompleteEmail` boolean (file as separate ticket).
```

---

## Decision

Approved by Arjun pending founder sign-off. Once signed off, Priya files SCRUM-74 verbatim.
