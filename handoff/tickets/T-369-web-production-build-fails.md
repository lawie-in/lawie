# T-369 — Web production build fails on develop_staging

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web) + Arjun (CI job) |
| Mode   | Small fix |
| Status | To do. Small fix (Arjun 616be69): the build fails only when NODE_ENV=development is set, so deploys are not broken. Pin NODE_ENV=production in the web build script and add the CI web job. First in line for the next free lead (quick). Priya, 13 Oct 2026 |
| Source | Mahak, 13 Oct 2026, while building T-223. Reproduced with all T-223 changes stashed |

## Problem

`yarn workspace @lawie/web build` (next build) fails on develop_staging while prerendering `/_global-error`: "Cannot read properties of null (reading 'useContext')". `next dev` still works, so nobody saw it. CI has no web job, so nothing catches it.

## Acceptance criteria

1. `yarn workspace @lawie/web build` passes on develop_staging, with no page excluded from prerender just to hide the error. Find the cause (for example a duplicate React copy, or a context hook used in global-error or the root layout) and fix it.
2. The lead finds the commit that broke it (git bisect on the web build) and names it in the report.
3. Arjun decides whether CI gets a web build job. If yes, it is part of this ticket (ci.yml is root config: one holder at a time).
4. Web tests stay green.

## Arjun (13 Oct 2026)

- AC3 is yes, in this ticket. Add a CI job "web build" that builds @lawie/shared, then runs `yarn workspace @lawie/web build` plus lint and typecheck on every push to develop_staging. It's required like the other jobs. The lead claims `.github/` for it.
- Arjun is bisecting for the breaking commit and will add it here.

## Arjun (13 Oct 2026): root cause found — not a code change

Checked by a read-only run (no commits): `yarn workspace @lawie/web build` fails on HEAD 3ec5907 **and** on 09e1522 (11 Oct, the oldest recent web-touching commit) when the shell has `NODE_ENV=development`, and **passes on both** with `NODE_ENV=production`. Next 16.2.4 + React 19.3.0 cannot prerender (`/_global-error`, `/admin`, `/_not-found`: "reading 'useContext'") under a non-production NODE_ENV; Next warns "non-standard NODE_ENV" on the first line. The agent sessions inherit `NODE_ENV=development` from the session environment, so every lead's local build fails. Not ruled out: a dotenv file in apps/web setting NODE_ENV. Ruled out: duplicate React (one copy, 19.3.0); missing `'use client'` (global-error.tsx has it). No commit broke it; no bisect needed.

**Fix (this ticket):**
1. `apps/web/package.json`: `"build": "NODE_ENV=production next build"`, so the build pins its own mode whatever the shell says.
2. AC3, CI "web build" job: builds `@lawie/shared`, then the web build with `NODE_ENV=production` set explicitly in the job, on every push to `develop_staging`.
3. Optional, same file: `turbopack.root` in `next.config.mjs` to silence the workspace-root warning in worktrees.
**Develop server:** a deploy build only fails if the server's shell also exports a non-production NODE_ENV; the founder's morning check (web build time on develop) still stands.
