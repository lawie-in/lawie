# T-600: Landing catalogue exporter (drafting) and committed catalogue data file (web)

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Growth (first build half of T-584; no copy needed, no UI) |
| Owner  | Arjun (design, answered in the T-584 spec §11), Vishal (build) |
| Mode   | Full chain (two services: drafting exporter + test, web data file). Fresh reviewer |
| Status | To do. Raised 26 Oct 2026. Priya |
| Source | handoff/design/T-584-landing-reading-desk-spec.md §11 (Arjun) |

## Problem
The landing page's coverage section ("drafting coverage") must list the full template catalogue and never go stale, so it is generated from the catalogue, not hand-written.

## Acceptance criteria
1. A drafting-workspace exporter `export:catalogue` writes a committed `apps/web/src/data/landing-catalogue.json`.
2. "Shown" = `TEMPLATE_CATALOGUE` keys in category order, excluding aliases, non-template price ids, and anything `feature-switches.ts` hides at its default.
3. A CI drift test fails when the committed JSON differs from what the exporter would write now.
4. Headline number = total rounded down to ten with "+" (computed by the web from the JSON, not stored as prose).
5. No secrets, no env reads beyond defaults; the exporter runs without a database.
6. Drafting and web tests and build green. No UI change.

## Files
Lead lists them after Explore: the exporter script and package.json script in apps/drafting, its drift test, and the new apps/web/src/data/landing-catalogue.json. Nothing in apps/web components (the landing build is a later ticket after copy and Ajay's sign-off).
