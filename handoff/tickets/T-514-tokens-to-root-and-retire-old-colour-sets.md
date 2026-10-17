# T-514: Move the Night Library tokens to :root and retire the old colour sets

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (token check), a web lead (build) |
| Mode   | Full chain (web) |
| Status | To do. After the pages are on the new components (T-509 and the T-511 screens), before V1 ships if time allows, else V1.1. Priya, 17 Oct 2026 |
| Source | Rajesh's review of T-511a (17 Oct 2026) |

## Problem

The Night Library tokens are scoped under `.nl` so they could ship without touching any page. Three older colour systems still sit next to them: the shadcn HSL variables, the `brand.*` set and the stale `lawie.*` blue scale. Two sources of truth means pages can drift back to the old look.

## Acceptance criteria

1. The Night and Daylight tokens live on `:root` (and the theme attributes), not under `.nl`.
2. The shadcn HSL variables, the `brand.*` set and the `lawie.*` scale are deleted from the Tailwind config and globals.css; nothing in apps/web references them (grep is clean).
3. Every page renders the same as before in Night and Daylight (screenshot check on the dashboard, settings, intake and editor in both themes at 1280 and 360).
4. Rajesh signs the token check; contrast table still passes AA.
5. Tests updated; no visual regressions reported by Anushka's run.
