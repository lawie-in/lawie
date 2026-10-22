# Lawie — AI Legal Productivity for Indian Advocates

> AI-powered document drafting, section mapping, and legal tools for advocates and corporate legal teams.

[![CI](https://github.com/abhinava32/lawie/actions/workflows/ci.yml/badge.svg)](https://github.com/abhinava32/lawie/actions/workflows/ci.yml)

---

## Tech Stack

| Layer          | Technology                                             |
| -------------- | ------------------------------------------------------ |
| Frontend       | Next.js 16, React 19, TypeScript, Tailwind CSS         |
| Backend        | Express.js microservices (4 services), TypeScript      |
| Database       | MongoDB 7.0 (Mongoose)                                 |
| Cache          | Redis 7.4 (ioredis)                                    |
| Auth           | Email+password/Google OAuth, JWT access+refresh, Redis |
| AI             | Anthropic Claude (Sonnet 4)                            |
| Payments       | Razorpay subscriptions + webhooks                      |
| Infrastructure | Docker Compose (dev + demo), EC2 + Nginx (prod)        |
| CI/CD          | GitHub Actions                                         |
| Testing        | Jest, Supertest, mongodb-memory-server, ioredis-mock   |
| Logging        | Pino (structured JSON) + Sentry                        |

---

## Monorepo Structure

```
lawie/
├── apps/
│   ├── gateway/        # API Gateway — routing, JWT validation, rate limiting  (port 4000)
│   ├── auth/           # Auth Service — email+password, Google, user model     (port 4001)
│   ├── drafting/       # Drafting Service — AI engine, templates, sections     (port 4002)
│   ├── billing/        # Billing Service — Razorpay subscriptions              (port 4003)
│   ├── email-worker/   # BullMQ email worker (no HTTP port)
│   └── web/            # Next.js frontend                                      (port 3000)
├── packages/
│   ├── shared/         # Shared types, constants, utilities
│   └── email-client/   # Queue client used by auth and billing to enqueue email
├── docker/
│   ├── mongo/          # MongoDB init scripts
│   └── nginx/          # Nginx configs (prod + demo)
├── docs/               # Architecture docs, deploy guides
├── docker-compose.yml          # Local dev
├── docker-compose.demo.yml     # EC2 t3.micro demo
├── deploy.sh                   # Production deploy: pm2 on EC2 (ecosystem.config.js), health-gated
└── .env.example
```

### Service routing (via Gateway)

| Client request     | Routed to       | Service                           |
| ------------------ | --------------- | --------------------------------- |
| `/api/auth/*`      | `auth:4001`     | Auth Service                      |
| `/api/documents/*` | `drafting:4002` | Drafting Service                  |
| `/api/templates/*` | `drafting:4002` | Drafting Service                  |
| `/api/sections/*`  | `drafting:4002` | Drafting Service (public, no JWT) |
| `/api/billing/*`   | `billing:4003`  | Billing Service                   |

**Analytics consent.** Google Analytics (GA4) loads in the browser only after a visitor presses Accept on a public page; with no answer or Decline there is no Google script and no `_ga` cookie. The choice is kept in the browser (`localStorage`, key `lawie.consent.analytics`) and can be changed from the footer ("Cookie settings") or the privacy page. Each choice is also recorded by the auth service via the public, unauthenticated `POST /api/auth/consent` (body: random id, `granted`/`denied`, text version; 1 KB limit; returns 204). The record holds no IP, user agent or account link, is deleted after 12 months, and the visitor is asked again then. If the store write fails, auth logs the fixed message `consent_store_failed` with the error name and code only. Browser-side Sentry is off (server and edge Sentry are on); turning it on needs a new ticket. Web tests: `yarn workspace @lawie/web test`.

---

## Quick Start

### Prerequisites

- Node.js >= 20
- Yarn >= 1.22
- Docker & Docker Compose

### One-command setup

```bash
git clone https://github.com/abhinava32/lawie.git
cd lawie
cp .env.development .env
docker compose up --build
```

This starts: MongoDB, Redis, Gateway, Auth, Drafting, Billing, and the Next.js frontend.

### URLs (local dev)

| Service          | URL                                       |
| ---------------- | ----------------------------------------- |
| Web              | http://localhost:3000                     |
| Gateway API      | http://localhost:4000                     |
| Auth Service     | http://localhost:4001                     |
| Drafting Service | http://localhost:4002                     |
| Billing Service  | http://localhost:4003                     |
| MongoDB          | localhost:27017                           |
| Redis            | localhost:6379                            |
| Mongo Express    | http://localhost:8081 (dev-tools profile) |

### With dev tools

```bash
docker compose --profile dev-tools up --build
```

### Without Docker

```bash
yarn install

# Start all services (requires local MongoDB + Redis running)
yarn dev
```

---

## Running Tests

```bash
# All services
yarn test

# Individual service
yarn workspace @lawie/gateway test
yarn workspace @lawie/auth test
yarn workspace @lawie/drafting test
yarn workspace @lawie/billing test

# Watch mode
yarn workspace @lawie/drafting test:watch
```

### Sentry scrubbing (T-229)

No credentials or personal data may reach Sentry from any service. One scrub does it: `packages/shared/src/observability/sentry-scrub.ts` (exported from `@lawie/shared`). It keeps only an allowlist of request headers, removes request bodies, cookies and query strings, masks emails and reset/review tokens in URLs, cuts `event.user` to `{id}`, and scrubs tags and breadcrumb data. The header comment in that file lists the full rules.

- Every service that initialises Sentry must run the scrub from **both** `beforeSend` and `beforeSendTransaction`. Transactions skip `beforeSend` but carry the same request data. This covers gateway, auth, drafting, billing, email-worker (`apps/email-worker/src/config/sentry.ts`) and the web server and edge configs. A new service copies that pattern.
- Each service has a `t229-sentry-hooks` test that checks both hooks. Do not use the SDK's `dataCollection` option instead; it loosens other defaults.
- Gotcha for local tests: the services call `Sentry.init` (and so register the hooks) only when `SENTRY_DSN` is set, and CI leaves it unset. A test that exercises the hooks must set a dummy `SENTRY_DSN`, mock the SDK, and load the config module fresh (`jest.isolateModules`), as the `t229-sentry-hooks` tests do. (email-worker takes the env as an argument: call `initSentry({ SENTRY_DSN: ... })`.)
- Build `@lawie/shared` before running service tests, as CI does.

---

## Environment Variables

Lawie uses per-environment dotenv files. Secrets never live in git.

| Environment | File               | Source                                                                                                                        |
| ----------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Development | `.env.development` | Committed (safe defaults for Docker)                                                                                          |
| Demo        | `.env.demo`        | Created on EC2 manually (see docs/demo-deploy.md)                                                                             |
| Production  | none (no file)     | SSM Parameter Store at boot via instance role (T-534); CI uses OIDC, no stored AWS keys. See [docs/DEPLOY.md](docs/DEPLOY.md) |

All variable names are declared in `.env.example`. Each service validates its env vars at boot via Zod — misconfiguration fails fast with a clear error message.

### Closing and erasing an account (T-115c)

Users close their account from Settings. Auth then locks the account, ends every session, and calls `POST /internal/erase-user` on drafting and billing (header `x-internal-secret`), erases its own data, and hard-deletes the User. It returns 200 when done or 202 when pending; a 10-minute sweep in auth finishes pending erasures. Billing also exposes `GET /internal/subscription-status/:userId`.

Auth needs `DRAFTING_SERVICE_URL` and `BILLING_SERVICE_URL`. They default to `http://localhost:4002` and `http://localhost:4003`, so set them in every deployed environment.

Operator script, for support or a stuck erase:

```bash
yarn workspace @lawie/auth erase-user <userId> [--dry-run|--resume]
```

Exit codes: 0 done, 1 failed, 2 refused (Admin or golden-set user), 3 pending.

Kept on purpose: billing payment, top-up and plan rows (tax, 72 months) and subscriptions. Reviewer feedback on other people's documents is kept but anonymised.

Manual operator steps (nothing alerts on these yet):

- Watch Sentry and auth logs for erase failures.
- Check auth logs for the sweep's stuck-erase warning (logged at 5 or more attempts) and run the script with `--resume` for that user.

### Deleting unverified accounts (T-358)

An hourly sweep in auth (also run at boot) deletes accounts whose email was never verified. The clock starts at `firstVerifySentAt`, stamped once on the first confirmed send of any verify-carrying email (verify email, resend, or the deletion notice). If it is not set yet, the sweep sends the deletion notice as the first email (a 24-hour grace for new sign-ups). A warning notice goes out at day 23 with a 7-day link. Deletion happens at the end of the IST day of day 30, and only 7 or more days after the warning. Deactivated accounts get a variant with no link ("write to privacy@lawie.in to keep it"). The notice is the `auth.unverifiedDeletionNotice` email template (job carries only the userId; the worker looks up address, name and link when it sends).

The worker reports each verify-email and notice outcome to auth through `POST /internal/unverified-notice/prepare` and `/outcome` (header `x-internal-secret`). Only an SMTP recipient rejection (RCPT TO, reply 550/551/553, enhanced status 5.1.1, 5.1.2, 5.1.3, 5.1.6 or 5.1.10) counts as a hard bounce. Any other failure holds the deletion and the job retries (3 attempts, exponential backoff). New User fields (`firstVerifySentAt`, `firstVerifySentVia`, `unverifiedNoticeSentAt`) go away with the T-115c hard delete.

Env var, in auth only:

- `UNVERIFIED_SWEEP_ENABLED` (default off). Only the exact string `true` turns it on; unset, `1`, `TRUE` and anything else are off. While off, the sweep only counts and logs what is due (`enabled:false`, counts only) and enqueues, locks and deletes nothing. The internal routes and the worker are not gated, so verify emails and stamps keep working.

Operator steps:

- Before enabling, watch the sweep log line in auth and check the due counts look sane.
- To keep an account whose owner asks, mark it verified by hand. That removes it from the sweep.
- Go-live order (T-403 checklist): queue purge dry-run, purge, footer env, deploy, `/health` check, resend-all dry-run, resend-all, set `UNVERIFIED_SWEEP_ENABLED=true`, deploy auth.

### Held verification emails: purge and resend (T-436 AC10)

Two operator scripts for clearing held `auth.verifyEmail` and `auth.unverifiedDeletionNotice` jobs and re-sending verification links once the corrected footer address is live. Both are dry runs by default and print counts only (the Redis URL is redacted). Run them with the target environment's `REDIS_URL` (and `EMAIL_QUEUE_PREFIX` if set); resend-all also needs the rest of the auth env (`MONGO_URI`).

```bash
yarn workspace @lawie/email-worker queue:purge [--yes]
yarn workspace @lawie/auth verify:resend-all [--yes] [--batch-size N] [--batch-pause-ms N]
```

- `queue:purge` removes every held `auth.verifyEmail` and `auth.unverifiedDeletionNotice` (the T-358 deletion notice) job from `email-high` and `email-low` (wait, paused, prioritized, delayed, stalled-active). Locked active jobs are counted, not removed, and the script exits 1. It also exits 1 if jobs vanish during removal. Failed jobs are kept. Without `--yes` it removes nothing. Output is counts only: a total, then one line per template. Removing a held notice frees its job id, so the hourly unverified-account sweep queues that notice again later. That is intended: the `firstVerifySentAt` and `unverifiedNoticeSentAt` stamps are written only when the worker confirms a real send, so a purged notice never leaves a user marked as noticed.
- `verify:resend-all` picks users with `emailVerified != true` who are not Google sign-ins, are active and are not erased, and calls the real `requestVerifyEmail`. It skips users already re-sent (a 30-day Redis marker `auth:verify-resend-all:<userId>`, or a still-fresh link) and users with a job already pending, so a rerun is safe. Tally: queued, already_pending, rate_limited, already_verified, failed, skipped_rerun. It sends in batches of 50 with a 60 s pause (`VERIFY_RESEND_BATCH_SIZE` / `VERIFY_RESEND_BATCH_PAUSE_MS`, or the flags).

Order for the T-403 release: purge dry run, `purge --yes` (covers both templates), set the footer address env, deploy, check `/health` returns 200, resend-all dry run, `resend-all --yes`, then set `UNVERIFIED_SWEEP_ENABLED=true` and deploy auth. Purge before the deploy so no old-footer email goes out; resend only after the new footer is live.

### GST tax invoices and credit notes: state of supply and email (T-436 b/c)

Each captured payment gets a GST tax invoice, and each refund a credit note. The place of supply is the user's State, stored as `User.gstStateCode`. `GET /api/auth/me` returns it. `PATCH /api/auth/me` sets it only after the user has accepted the current privacy version (`CURRENT_PRIVACY_VERSION` in `@lawie/shared` is `2026-10-15`; `CURRENT_TERMS_VERSION` in auth is `2026-10-22`). The web app asks for the State on upgrade, top-up and Settings, and Settings has an Invoices card with PDF download (`GET /api/billing/invoices`, `/invoices/:id/pdf`). Refunds are capped atomically per invoice (`RefundCap`).

Invoice and credit-note emails go through the `billing.taxInvoice` and `billing.creditNote` templates. The job carries only the invoice id. The email-worker fetches the content from billing at send time (`GET /internal/invoices/:id/email-view`, header `x-internal-secret`; 410 if the user has been erased) and does not log it.

Env vars:

- Billing: `INVOICE_EMAIL_ENABLED` (default off; `true`, `false` or empty; any other value fails at boot). Emails are queued only when it is `true` and `REDIS_URL` is set; the enqueue has a 5 s timeout. While off, nothing is queued and rows stay unemailed; a sweep in billing emails issued rows once and stops at the first failure. Users who are gone or mid-erasure are skipped. `yarn workspace @lawie/billing backfill:invoices [--apply]` (dry run by default) issues invoices for earlier payments and emails them once.
- Email-worker: `BILLING_SERVICE_URL` (optional). Without it the worker runs, but invoice and credit-note jobs fail and retry until it is set. It also needs `INTERNAL_SECRET`, as before.

Billing now depends on `@lawie/email-client` (see its Dockerfile and `ci.yml`).

### Pre-commit secret scanning

```bash
brew install gitleaks   # macOS, one-time
```

Every commit is scanned by gitleaks via the Husky pre-commit hook.

---

## Deployment

| Target               | Guide                                      | Cost                      |
| -------------------- | ------------------------------------------ | ------------------------- |
| **Demo (t3.micro)**  | [docs/demo-deploy.md](docs/demo-deploy.md) | ₹0/month (free tier)      |
| **Production (EC2)** | [docs/ec2-setup.md](docs/ec2-setup.md)     | ~₹2,100/month (t3.medium) |

Frontend deploys to Vercel separately.

---

## Branch Strategy

| Branch            | Purpose                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`            | Production — protected. Nobody merges into it, ever: a release workflow (`release-to-main.yml`, founder approves) cuts a snapshot of `develop` with the handoff and agent files removed (founder rule, 21 Oct 2026) |
| `develop_staging` | Where leads merge finished tickets (`--no-ff`); only the founder merges it into `develop`                                                                                                                           |
| `develop`         | Integration — auto-deploys staging                                                                                                                                                                                  |
| `feature/*`       | Feature branches                                                                                                                                                                                                    |
| `hotfix/*`        | Production hotfixes                                                                                                                                                                                                 |

---

## License

MIT
