# T-375 — v1 scope: hide the civil plaint and two free tools behind a flag

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) |
| Mode   | Small fix |
| Status | Building. Tanvi, after T-374. Arjun's ruling on the v1 scope (13 Oct 2026). Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL; Arjun's ruling: v1 = bail (4 packs), s.138 notice, converter |

## Acceptance criteria

1. The same on/off AppSetting switches as T-356 (Arjun): `feature.tool_timeline`, `feature.tool_bail_checker` and `feature.template_civil_plaint`, default off in code. Nothing is deleted. No new mechanism.
2. When the flag is off, the item doesn't appear in the template list, search, Tools page, home page or navigation. The routes return 404 when the switch is off (Arjun).
3. The timeline tracker comes back when T-367 merges. The bail checker comes back when T-371 and T-361 merge. The plaint comes back when T-368 merges. Each comes back by turning its flag on, with no code change.
4. Tests: each item is hidden when off and shown when on.

## Arjun (13 Oct 2026)

1. `feature.template_civil_plaint` hides the whole `civil_plaints_suits` category, all six plaint ids. Plaints are not v1.
2. Yes: the legacy `POST /generate` with docType `plaint` is closed too when the flag is off (same 404 as the template path). One switch, no back door.
3. Public `GET /sections/features` → `{ tool_timeline, tool_bail_checker }` is approved; no gateway change. Rules: it returns only those two booleans, never the AppSetting list; `Cache-Control: public, max-age=60`; the page flag is UX only — the tool APIs themselves still 404 when off, server-side.
Off/on through T-356's reader; anything but `on` is off.
