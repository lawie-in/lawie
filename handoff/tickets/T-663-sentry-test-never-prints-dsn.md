# T-663 — Sentry tests must never print a real DSN; suites fail fast if SENTRY_DSN is set

Status: merged into develop_staging 88ce6fc8 (tanvi, CI green), 29 Oct 2026. Arjun OK. Founder actions still open: remove SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN from the cloud env; rotate the drafting DSN at the next prod env edit.

## Acceptance criteria
1. apps/drafting sentry.test.ts (and any other service's Sentry tests) never reads the real env var. It sets a fixture DSN itself and asserts the real value is never printed.
2. Each service's jest setup fails fast when SENTRY_DSN is present, with: "SENTRY_DSN set — unset it, see CLAUDE.md". This covers drafting, auth, gateway, billing, email-worker and web.
3. CI is green; CI never sets SENTRY_DSN.

## Founder actions (not code)
- Remove SENTRY_DSN (and any NEXT_PUBLIC_SENTRY_DSN) from the cloud environment settings.
- Rotate the drafting DSN at the next prod env edit.
