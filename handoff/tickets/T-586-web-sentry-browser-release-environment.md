# T-586: web — browser-side Sentry, release tag from the commit SHA, explicit environment

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (from Arjun's Sentry audit, handoff/ops/go-live-2026-10-23.md) |
| Owner  | Arjun (raised), Kunal (build) |
| Mode   | Small fix (web only, no UI change) |
| Status | Merged into develop_staging (1606252c, CI 1026 green), 26 Oct 2026. Redeploy web; set NEXT_PUBLIC_SENTRY_DSN and NEXT_PUBLIC_SENTRY_ENVIRONMENT before the web build. Priya |
| Source | Sentry audit: web has server and edge Sentry only; browser errors are lost |

## Acceptance criteria
1. Browser-side Sentry init in apps/web (instrumentation-client.ts or sentry.client.config.ts, whichever Next 16 expects), guarded by `NEXT_PUBLIC_SENTRY_DSN`, using the same scrub as server and edge (`sendDefaultPii` false; no PII or document content in events).
2. `release` is set from the commit SHA (read from `SENTRY_RELEASE`; the build or deploy sets it from `git rev-parse HEAD`), and `environment` is set explicitly from `SENTRY_ENVIRONMENT` (server and edge) and `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (browser), falling back to the build's NODE_ENV.
3. If `NEXT_PUBLIC_SENTRY_DSN` is a build arg in apps/web/Dockerfile and the deploy script's exported build env, add it there too (names only, no values).
4. Test that the init is skipped with no DSN and scrubs when present. Web tests and build green. No visible UI change.

## Files
apps/web/instrumentation.ts, apps/web/sentry.server.config.ts, apps/web/sentry.edge.config.ts, new browser init file, apps/web/next.config.mjs only if the SDK needs it, apps/web/Dockerfile (one ARG), their tests. Lead confirms the list after Explore; anything else comes to Priya first.

## Follow-ups from Kunal (26 Oct 2026, not blocking; first prod browser error must be checked in Sentry)
1. A `#...` hash is not cut by the shared scrubUrl (packages/shared); the app's only hashes are fixed words today.
2. The 24-hex document id in API paths stays in clear in fetch/xhr breadcrumbs: opaque, but it ties an id to a user's session in Sentry.
3. No live Sentry event has been sent yet: after the first prod browser error, check the release tag and the scrubbed breadcrumbs.
4. A Docker/compose build needs SENTRY_RELEASE passed as a build arg (no .git in the build context).
