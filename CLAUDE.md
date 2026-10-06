# Lawie

This file is loaded in full into every session and every dev-crew subagent's context (see `.claude/agents/`). Keep it short. Deeper reference material lives under `.claude/docs/` — linked below as plain paths, not `@`-imports, so agents read them only when the task actually needs them.

## Layout

Yarn workspaces monorepo.

- `apps/`: `gateway` (4000), `auth` (4001), `drafting` (4002), `billing` (4003), `email-worker`, `web` (3000).
- `packages/`: `shared`, `email-client`.

## Stack

Express 4 + Mongoose 8 services. Next.js 16 + React 19 + Tailwind 3 web. Redis via ioredis. `@anthropic-ai/sdk`. Razorpay. Pino. Sentry. Node 20+.

## Commands

- Test: `yarn workspace @lawie/<name> test` (Jest + ts-jest, matches `**/__tests__/**/*.test.ts`). Build `@lawie/shared` first, as CI does.
- Lint: `yarn workspace @lawie/<name> lint` — runs `eslint --fix` and **rewrites files**. Never run this from a read-only role.
- Typecheck/build: `yarn workspace @lawie/<name> build` — runs `tsc`.

## Branches

`feature/scrum-<n>-<slug>` or `fix/<slug>` for a `SCRUM-n` ticket; `feature/t-<nnn>-<slug>` or `fix/t-<nnn>-<slug>` for a local `T-nnn` ticket (`handoff/tickets/`, used while Jira and Notion are paused pre-v1). Cut from `develop`, PR to `develop`. `main` is production. Jira project key: `SCRUM`. Remote: `github.com/lawie-in/lawie`.

## Commits

Conventional commits, enforced by commitlint (lower-case subject, 100 chars max). Husky runs gitleaks and lint-staged on commit — confirm `gitleaks` is installed locally, or the secret scan silently degrades to a warning.

## Crew protocol

Every dev-crew subagent (`developer`, `tester`, `reviewer`, `doc-writer`) follows these rules on top of its own role-specific prompt:

- You start with no memory of the conversation. Everything you need is in the handoff packet the lead sent you. If something's missing, stop and return `BLOCKED: <question>`. You cannot ask the founder — only the lead does.
- Do one step. Do not do the next agent's job.
- End with your role's report format and nothing after it.
- Say what you ran and what you did not run.

## Quality gate

No pull request into `develop` or `main` is merged without Anushka's verdict on it (founder's rule, 6 Oct 2026). She is the CQO: a lawyer who tests the running app in a browser and has no code access. The lead opens the pull request with `Quality: waiting for Anushka` in the body and stops; nobody in the dev crew plays her or writes her verdict. Full rule: `.claude/docs/quality-gate.md`.

## Deeper reference (read on demand)

- `.claude/docs/coverage.md` — per-service coverage thresholds and what a green run does and doesn't prove.
- `.claude/docs/test-gaps.md` — which services have no tests and which have no CI job.
- `.claude/docs/golden-snapshots.md` — court-rules snapshot mechanics; read this before touching anything under `apps/drafting/src/__tests__/court-rules*`.
- `.claude/docs/legal-content-paths.md` — the exact paths that count as "legal content" and require Ajay's sign-off.
- `.claude/docs/quality-gate.md` — the quality gate: what Anushka is sent, what counts as a pass, and what happens when she cannot reach the app.

## Stale, do not trust

`.github/copilot-instructions.md` describes a single `apps/api` on AWS ECS — that service no longer exists. `README.md`'s service list is missing `email-worker` and `packages/email-client`.
