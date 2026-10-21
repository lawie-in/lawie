# T-520: Dashboard and app shell in Night Library

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (spec section 03), a web lead (build) |
| Mode   | Full chain (web) |
| Status | In build: Tanvi (21 Oct 2026). Priya |
| Source | T-511 part B; spec `handoff/design/T-511-night-library-spec.md` sections 03 and 08 |

## Scope
"Your shelf" dashboard using the T-506 summary endpoint; mount TopBar (theme toggle in the menu, no second header row), CommandBar (`hotkey={false}` if the section finder stays), the new dashboard layout and sidebar; error pages (404, 500, offline) per section 08.

## Acceptance criteria
1. Eight KPIs per the spec; no time-saved tile; tiles 3, 4, 6, 7 show a skeleton while loading, never a zero; empty, loading and error states as written.
2. Theme toggle (Night, Daylight, System) works and persists; follows the system theme by default.
3. 360px first, no horizontal scroll; reduced-motion stops all effects; loops pause when the tab is hidden.
4. Copy only from the Ajay-signed `handoff/copy/T-511-copy-v1.md`; Ink is "Ink a month", never a draft count.
5. Tests; browser check recorded in the ticket before Anushka tests.
