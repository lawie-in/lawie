# T-648 — yarn.lock has drifted from package.json

Status: backlog. Goes to mahak after T-633/T-632, because root config is held by one lead at a time. From Arjun, v1.2.1 deploy, 28 Oct 2026.

## Problem
On main 39efa0cf, `yarn --frozen-lockfile` reports 6 "Lockfile has incorrect entry … Ignoring it" lines: @sentry/opentelemetry, @types/node, camelcase, semver, make-dir and locate-path.

## Acceptance criteria
1. Regenerate yarn.lock with the repo's own yarn version. No dependency bumps and no package.json changes.
2. `yarn --frozen-lockfile` runs clean, with none of those warnings.
3. CI is green on every workspace.
4. The lockfile diff contains only the 6 entries, plus the transitive entries they require.
