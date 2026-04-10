# ⚖️ Lawie — Legal Tech Platform

> Modern case management, document handling, and client communication for legal professionals.

[![CI](https://github.com/your-org/lawie/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/lawie/actions/workflows/ci.yml)

---

## Tech Stack

| Layer        | Technology                         |
|--------------|------------------------------------|
| Frontend     | Next.js 14, TypeScript, Tailwind CSS |
| Backend      | Express.js, TypeScript             |
| Database     | MongoDB (Mongoose)                 |
| Auth         | JWT (access + refresh tokens)      |
| Infrastructure | Docker, AWS ECS, ECR             |
| CI/CD        | GitHub Actions                     |
| Testing      | Jest (API), Jest + RTL (Web)       |
| Logging      | Pino (structured JSON)             |
| Docs         | Swagger / OpenAPI 3.0              |

---

## Monorepo Structure

```
lawie/
├── apps/
│   ├── api/            # Express.js REST API  (port 5000)
│   └── web/            # Next.js frontend     (port 3000)
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
cp .env.example .env
# Edit .env with your local values
```

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

| Service          | URL                              |
|------------------|----------------------------------|
| Web              | http://localhost:3000            |
| API              | http://localhost:5000            |
| API Health       | http://localhost:5000/health     |
| Swagger Docs     | http://localhost:5000/api/docs   |
| Mongo Express    | http://localhost:8081 (dev-tools profile) |

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

| Jira Key  | Story                                           | Status      |
|-----------|-------------------------------------------------|-------------|
| SCRUM-6   | Set up project repository and monorepo structure | ✅ In Progress |
| SCRUM-7   | Configure CI/CD pipeline                        | To Do       |
| SCRUM-8   | Set up dev/staging/prod environments            | To Do       |
| SCRUM-9   | Implement user authentication (JWT)             | To Do       |
| SCRUM-10  | Role-based access control (RBAC)                | To Do       |
| SCRUM-11  | Core database schema                            | To Do       |
| SCRUM-12  | Initialize frontend with design system          | To Do       |
| SCRUM-13  | API gateway, routing, Swagger docs              | To Do       |

---

## Branch Strategy

| Branch       | Purpose                           |
|--------------|-----------------------------------|
| `main`       | Production — protected            |
| `develop`    | Integration — auto-deploys staging |
| `feature/*`  | Feature branches                  |
| `hotfix/*`   | Production hotfixes               |

---

## License

MIT © Lawie Team
