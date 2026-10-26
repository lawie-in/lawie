# T-586: web — browser-side Sentry, release tag from the commit SHA, explicit environment

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (from Arjun's Sentry audit, handoff/ops/go-live-2026-10-23.md) |
| Owner  | Arjun (raised), Kunal (build) |
| Mode   | Small fix (web only, no UI change) |
| Status | To do. Raised by Arjun, 26 Oct 2026. Priya |
| Source | Sentry audit: web has server and edge Sentry only; browser errors are lost |

## Acceptance criteria
1. Browser-side Sentry init in apps/web (instrumentation-client.ts or sentry.client.config.ts, whichever Next 16 expects), guarded by `NEXT_PUBLIC_SENTRY_DSN`, using the same scrub as server and edge (`sendDefaultPii` false; no PII or document content in events).
2. `release` is set from the commit SHA (read from `SENTRY_RELEASE`; the build or deploy sets it from `git rev-parse HEAD`), and `environment` is set explicitly from `SENTRY_ENVIRONMENT` (server and edge) and `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (browser), falling back to the build's NODE_ENV.
3. If `NEXT_PUBLIC_SENTRY_DSN` is a build arg in apps/web/Dockerfile and the deploy script's exported build env, add it there too (names only, no values).
4. Test that the init is skipped with no DSN and scrubs when present. Web tests and build green. No visible UI change.

## Files
apps/web/instrumentation.ts, apps/web/sentry.server.config.ts, apps/web/sentry.edge.config.ts, new browser init file, apps/web/next.config.mjs only if the SDK needs it, apps/web/Dockerfile (one ARG), their tests. Lead confirms the list after Explore; anything else comes to Priya first.
