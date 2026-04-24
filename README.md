# ⚖️ Lawie — Legal Tech Platform

> Modern case management, document handling, and client communication for legal professionals.

[![CI](https://github.com/your-org/lawie/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/lawie/actions/workflows/ci.yml)

---

## Tech Stack

| Layer          | Technology                                        |
| -------------- | ------------------------------------------------- |
| Frontend       | Next.js 14, TypeScript, Tailwind CSS              |
| Backend        | Express.js microservices (4 services), TypeScript |
| Database       | MongoDB (Mongoose)                                |
| Auth           | JWT (access + refresh tokens)                     |
| Infrastructure | Docker, AWS ECS, ECR                              |
| CI/CD          | GitHub Actions                                    |
| Testing        | Jest (API), Jest + RTL (Web)                      |
| Logging        | Pino (structured JSON)                            |
| Docs           | Swagger / OpenAPI 3.0                             |

---

## Monorepo Structure

```
lawie/
├── apps/
│   ├── gateway/        # API Gateway — routing, CORS, rate limiting  (port 4000)
│   ├── auth/           # Auth Service — JWT, Google OAuth            (port 4001)
│   ├── drafting/       # Drafting Service — AI engine, templates     (port 4002)
│   ├── billing/        # Billing Service — Razorpay, subscriptions   (port 4003)
│   └── web/            # Next.js frontend                            (port 3000)
├── packages/
│   └── shared/         # Shared types, constants, utilities
├── docker/
│   └── mongo/          # MongoDB init scripts
├── .github/
│   └── workflows/      # GitHub Actions CI/CD
├── docker-compose.yml
├── .env.example
└── README.md
```

### Service routing (via Gateway)

| Client request     | Gateway forwards to         | Service          |
| ------------------ | --------------------------- | ---------------- |
| `/api/auth/*`      | `auth:4001/auth/*`          | Auth Service     |
| `/api/documents/*` | `drafting:4002/documents/*` | Drafting Service |
| `/api/billing/*`   | `billing:4003/billing/*`    | Billing Service  |

---

## Getting Started

### Prerequisites

- Node.js >= 20
- Yarn >= 1.22
- Docker & Docker Compose

### 1. Clone & install

```bash
git clone https://github.com/your-org/lawie.git
cd lawie
yarn install
```

### 2. Configure environment

```bash
# Local dev uses the committed, Docker-friendly defaults
cp .env.development .env
```

See the [Secrets & environment variables](#secrets--environment-variables) section below for how staging and production get their values.

### 3. Start with Docker (recommended)

```bash
# Start all services (API + Web + MongoDB)
docker compose up --build

# With dev tools (Mongo Express UI at :8081)
docker compose --profile dev-tools up --build
```

### 4. Or start without Docker

```bash
# Terminal 1 — API
yarn workspace @lawie/api dev

# Terminal 2 — Web
yarn workspace @lawie/web dev
```

---

## URLs

| Service          | URL                                       |
| ---------------- | ----------------------------------------- |
| Web              | http://localhost:3000                     |
| Gateway          | http://localhost:4000                     |
| Auth Service     | http://localhost:4001                     |
| Drafting Service | http://localhost:4002                     |
| Billing Service  | http://localhost:4003                     |
| Mongo Express    | http://localhost:8081 (dev-tools profile) |

---

## Secrets & environment variables

Lawie runs three environments (dev / staging / prod). Each has its own secrets — **secrets never live in git**.

### Where secrets live

| Environment | Storage                                  | How it loads                              |
| ----------- | ---------------------------------------- | ----------------------------------------- |
| Development | `.env` file (local only)                 | `dotenv` reads `.env` on API boot         |
| Staging     | AWS Secrets Manager (`/lawie/staging/*`) | ECS injects into containers at task start |
| Production  | AWS Secrets Manager (`/lawie/prod/*`)    | ECS injects into containers at task start |

All variable names are declared in [`.env.example`](.env.example). Secrets Manager entries are created manually via the AWS CLI — see [docs/environments.md](docs/environments.md) for the exact commands per service and environment.

### Local dev setup

```bash
# 1. Use the committed, Docker-friendly defaults — safe to commit
cp .env.development .env

# 2. If you need real external services (SMTP, Sentry, etc.), edit .env locally.
#    Never commit the resulting file — .gitignore excludes it.
```

To pull the current **staging** or **prod** secrets onto your machine for debugging (requires IAM access):

```bash
aws secretsmanager get-secret-value \
  --secret-id /lawie/staging/JWT_SECRET \
  --query SecretString --output text
```

### Setting or rotating a staging/prod secret

```bash
aws secretsmanager put-secret-value \
  --secret-id /lawie/prod/JWT_SECRET \
  --secret-string "$(openssl rand -hex 64)"

# Force ECS to pull fresh values on next task start
aws ecs update-service --cluster lawie-prod-cluster --service lawie-prod-api --force-new-deployment
```

### Startup validation

Each service validates its own required env vars at boot via Zod (`apps/<service>/src/config/env.ts`). On a misconfiguration the service fails fast with a list of problems before it opens a port. If you see a validation error, check your `.env` against `.env.example`.

### Pre-commit secret scanning

Every commit is scanned by [gitleaks](https://github.com/gitleaks/gitleaks) via the Husky pre-commit hook. Install once:

```bash
brew install gitleaks            # macOS
# or: https://github.com/gitleaks/gitleaks/releases
```

If a commit is blocked, the output will show the file and line that triggered the rule. To allow a legitimate placeholder (e.g. `CHANGE_ME`), add it to the `[allowlist]` in [.gitleaks.toml](.gitleaks.toml).

### Full reference

See [docs/environments.md](docs/environments.md) for the full list of variables, per-environment URLs, and the bootstrap commands for the Terraform state bucket.

---

## Running Tests

```bash
# All tests
yarn test

# API only
yarn workspace @lawie/api test

# Web only
yarn workspace @lawie/web test

# Watch mode
yarn workspace @lawie/api test:watch
```

---

## Sprint Progress

| Jira Key | Story                                            | Status         |
| -------- | ------------------------------------------------ | -------------- |
| SCRUM-6  | Set up project repository and monorepo structure | ✅ In Progress |
| SCRUM-7  | Configure CI/CD pipeline                         | To Do          |
| SCRUM-8  | Set up dev/staging/prod environments             | ✅ Done        |
| SCRUM-9  | Implement user authentication (JWT)              | To Do          |
| SCRUM-10 | Role-based access control (RBAC)                 | To Do          |
| SCRUM-11 | Core database schema                             | To Do          |
| SCRUM-12 | Initialize frontend with design system           | To Do          |
| SCRUM-13 | API gateway, routing, Swagger docs               | To Do          |
| SCRUM-14 | Secrets management & env var strategy            | ✅ Done        |

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

MIT © Lawie Team
