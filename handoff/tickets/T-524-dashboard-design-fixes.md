# T-524: Dashboard polish (Rajesh's design review and Arjun's UI-quality pass of T-520)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (review), a web lead (build) |
| Mode   | Small fix (web); developer loads mobile-native, tester runs break-ui |
| Status | Merged into develop_staging beca26e9 (21 Oct 2026); CI 854 green. Priya |
| Source | Rajesh against DESIGN.md |

## Acceptance criteria
1. Must-fix: KPI numbers in `components/dashboard/ShelfKpis.tsx` are Tiro 40px/44px per DESIGN.md Typography (today 24px and 18px).
2. Spine label (`components/dashboard/Spine.tsx`) is Tiro 15px; the finalised mark is the 26px seal mark.
3. Shelf edge (`Shelf.tsx`) is 10px wood; "Recent documents" is set as a Title (24px) with the tiles keeping their labels.
4. Rajesh's rulings (21 Oct): the command bar's Draft is the one primary on the dashboard; "Start your first draft" and the low-Ink "Top up" are ghost buttons here (primary only inside the top-up modal and on the Plan tab). Spine titles truncate with an ellipsis on one vertical line at 52px, full title and status in the accessible name, no tooltip, no wrap, not below Tiro 15px. On /dashboard the command bar owns Ctrl/Cmd+K (hotkey on); the section finder is not bound there and stays reachable from the account menu; on editor and document routes the section finder owns it and the command bar is not mounted. One listener per route.
5. Arjun's UI-quality items: the spine hover target no longer moves from under the cursor; "Still working..." is on screen at 360; forced-colors (Windows High Contrast) works; a long name no longer overflows the greeting; dir="auto" on spine titles; no per-tile section landmarks; the low-Ink nudge is a quieter role=status.
6. Tanvi's items: Retry keeps focus after a shelf error; the 2 missing page tests are added.
7. Rajesh's values (DESIGN.md Colors): `::selection` background Night #4A3D1E, Daylight #EAD9A8 (text colour unchanged); `caret-color` Brass, #C9A24A night, #866619 day; `<meta name="theme-color">` Wall for the resolved theme, #0E1A17 night and #F3EFE4 day. Emit both with `media="(prefers-color-scheme: ...)"` in the root layout for first paint, and have ThemeProvider set the single meta to the resolved value whenever the toggle changes. Files added to this ticket: app/layout.tsx (the theme-color meta only), components/shell/ThemeProvider.tsx.
8. Tests updated; 360px still has no horizontal scroll; Rajesh re-checks.

## Files
apps/web: components/dashboard/**, app/dashboard/page.tsx, components/shell/** (command bar hotkey, ThemeProvider, OfflineBanner), app/layout.tsx (theme-color meta only), app/globals.css (tokens, selection, caret, forced-colors).
