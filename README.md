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
│   └── web/            # Next.js frontend                                      (port 3000)
├── packages/
│   └── shared/         # Shared types, constants, utilities
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

---

## Environment Variables

Lawie uses per-environment dotenv files. Secrets never live in git.

| Environment | File               | Source                                            |
| ----------- | ------------------ | ------------------------------------------------- |
| Development | `.env.development` | Committed (safe defaults for Docker)              |
| Demo        | `.env.demo`        | Created on EC2 manually (see docs/demo-deploy.md) |
| Production  | `.env.production`  | Written by CI/CD from AWS Secrets Manager         |

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

### Held verification emails: purge and resend (T-436 AC10)

Two operator scripts for clearing held `auth.verifyEmail` jobs and re-sending verification links once the corrected footer address is live. Both are dry runs by default and print counts only (the Redis URL is redacted). Run them with the target environment's `REDIS_URL` (and `EMAIL_QUEUE_PREFIX` if set); resend-all also needs the rest of the auth env (`MONGO_URI`).

```bash
yarn workspace @lawie/email-worker queue:purge [--yes]
yarn workspace @lawie/auth verify:resend-all [--yes] [--batch-size N] [--batch-pause-ms N]
```

- `queue:purge` removes every held `auth.verifyEmail` job from `email-high` and `email-low` (wait, paused, prioritized, delayed, stalled-active). Locked active jobs are counted, not removed, and the script exits 1. It also exits 1 if jobs vanish during removal. Failed jobs are kept. Without `--yes` it removes nothing.
- `verify:resend-all` picks users with `emailVerified != true` who are not Google sign-ins, are active and are not erased, and calls the real `requestVerifyEmail`. It skips users already re-sent (a 30-day Redis marker `auth:verify-resend-all:<userId>`, or a still-fresh link) and users with a job already pending, so a rerun is safe. Tally: queued, already_pending, rate_limited, already_verified, failed, skipped_rerun. It sends in batches of 50 with a 60 s pause (`VERIFY_RESEND_BATCH_SIZE` / `VERIFY_RESEND_BATCH_PAUSE_MS`, or the flags).

Order for the T-403 release: purge dry run, `purge --yes`, set the footer address env, deploy, check `/health` returns 200, resend-all dry run, `resend-all --yes`. Purge before the deploy so no old-footer email goes out; resend only after the new footer is live.

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

| Branch      | Purpose                            |
| ----------- | ---------------------------------- |
| `main`      | Production — protected             |
| `develop`   | Integration — auto-deploys staging |
| `feature/*` | Feature branches                   |
| `hotfix/*`  | Production hotfixes                |

---

## License

MIT
