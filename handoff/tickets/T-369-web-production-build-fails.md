# T-369 — Web production build fails on develop_staging

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web) + Arjun (CI job) |
| Mode   | Small fix |
| Status | To do. RELEASE GATE: a web deploy fails today. First in line for the next free lead. Priya, 13 Oct 2026 |
| Source | Mahak, 13 Oct 2026, while building T-223. Reproduced with all T-223 changes stashed |

## Problem

`yarn workspace @lawie/web build` (next build) fails on develop_staging while prerendering `/_global-error`: "Cannot read properties of null (reading 'useContext')". `next dev` still works, so nobody saw it. CI has no web job, so nothing catches it.

## Acceptance criteria

1. `yarn workspace @lawie/web build` passes on develop_staging, with no page excluded from prerender just to hide the error. Find the cause (for example a duplicate React copy, or a context hook used in global-error or the root layout) and fix it.
2. The lead finds the commit that broke it (git bisect on the web build) and names it in the report.
3. Arjun decides whether CI gets a web build job. If yes, it is part of this ticket (ci.yml is root config: one holder at a time).
4. Web tests stay green.
