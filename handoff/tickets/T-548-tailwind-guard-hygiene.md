# T-548: Tailwind guard hygiene (from the T-528 content fix)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build) |
| Mode   | Small fix. Claim: `apps/web/package.json`, `yarn.lock` (root config, one lead at a time), the guard test |
| Status | To do. Not a v1 blocker. Priya, 21 Oct 2026 |
| Source | Vishal's fresh reviewer, Tailwind fix 04e575e8 |

1. The tailwind config resolves `micromatch` one level up. Declare `micromatch` and `fast-glob` as `@lawie/web` devDependencies, or stop relying on them.
2. Widen the guard's regex to `.mdx` test files.

Acceptance: clean install, web tests green, no other lockfile churn.
