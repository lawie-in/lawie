# Lawie — AI Coding Agent Instructions

## Architecture Overview

Yarn workspaces monorepo with three packages:

| Package | Name | Port |
|---|---|---|
| `apps/api` | `@lawie/api` | 5000 |
| `apps/web` | `@lawie/web` | 3000 |
| `packages/shared` | `@lawie/shared` | — |

`@lawie/shared` is consumed **directly from TypeScript source** (`"main": "src/index.ts"`) — no build step is needed for local development. It exports all shared types, constants, and utilities from a single barrel at `packages/shared/src/index.ts`.

## Developer Workflows

```bash
# Run both apps concurrently (no Docker)
yarn dev

# Run a single workspace
yarn workspace @lawie/api dev        # ts-node-dev with hot reload
yarn workspace @lawie/web dev

# Docker (recommended) — API hot-reloads via mounted src volume
docker compose up --build
docker compose --profile dev-tools up --build   # adds Mongo Express at :8081

# Tests
yarn workspace @lawie/api test       # Jest + supertest, 70% coverage threshold
yarn workspace @lawie/web test       # Jest + RTL
yarn workspace @lawie/api test:watch
```

## API Conventions

**Response envelope** — all endpoints must return `ApiResponse<T>` from `@lawie/shared`:
```ts
{ status: 'success' | 'error', data?: T, message?: string, statusCode?: number }
```

**Error handling** — throw `AppError(statusCode, message)` from `apps/api/src/middleware/errorHandler.ts` for operational errors; unhandled errors automatically become 500.

**Adding a route:**
1. Create `apps/api/src/routes/v1/<resource>.routes.ts`
2. Register it in `apps/api/src/routes/v1/index.ts`
3. Add JSDoc `@swagger` annotations inline in the route file — swagger auto-collects from `./src/routes/**/*.ts` and `./src/controllers/**/*.ts`

**Placeholder pattern** — unimplemented routes return `501` with a Jira ticket reference (see `auth.routes.ts`):
```ts
res.status(501).json({ message: 'Not implemented yet — tracked in SCRUM-9' });
```

## Domain Model

Three roles defined in `packages/shared/src/constants/roles.ts`:
- **Admin** — full access (`read:all`, `write:all`, `delete:all`, `manage:users`)
- **Lawyer** — case + document read/write, client read
- **Client** — read own cases and documents only

Core entities: `User`, `Case` (statuses: Open/Active/Pending/Closed/Archived, priorities: Low/Medium/High/Urgent), `Document`. Auth uses JWT — 15-minute access tokens + 7-day refresh tokens.

## Frontend Patterns (Next.js App Router)

- Route groups: `(auth)/` for public pages, `dashboard/` for protected pages
- UI primitives: **Radix UI**, styled with **Tailwind CSS** (`clsx` + `tailwind-merge`)
- Forms: **React Hook Form** + **Zod** resolvers
- Global state: **Zustand**
- API calls: **axios** with `NEXT_PUBLIC_API_URL` env var

## Testing

API tests live in `src/__tests__/*.test.ts` and import `app` directly (not `index.ts`) to avoid starting the HTTP server. See `apps/api/src/__tests__/health.test.ts` as the reference pattern.

## Key Files

| Purpose | File |
|---|---|
| Express app setup & middleware order | `apps/api/src/app.ts` |
| Versioned route registry | `apps/api/src/routes/v1/index.ts` |
| Shared types, constants, validators | `packages/shared/src/index.ts` |
| RBAC permission map | `packages/shared/src/constants/roles.ts` |
| HTTP status constants | `packages/shared/src/constants/status.ts` |
| Pino logger config | `apps/api/src/config/logger.ts` |
| MongoDB connection | `apps/api/src/config/database.ts` |
| Swagger config | `apps/api/src/config/swagger.ts` |

## Branch & Environment Strategy

`main` → production (AWS ECS ap-south-1) | `develop` → staging (auto-deploy) | `feature/*` | `hotfix/*`

CI runs lint → test (with a real Mongo 7.0 service container) → build on pushes to `main`/`develop`.
