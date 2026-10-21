# T-547: Declare `js-yaml` in `@lawie/web`

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build) |
| Mode   | Small fix. Claim: `apps/web/package.json`, `yarn.lock` (root config, one lead at a time) |
| Status | To do. Priya, 21 Oct 2026 |
| Source | Vishal's T-543 report |

## Problem
The T-543 test imports `js-yaml`, which works only because it is hoisted. Add it to `apps/web` devDependencies and update `yarn.lock` with the repo's tooling. Acceptance: clean install, web tests green, no other lockfile churn.
