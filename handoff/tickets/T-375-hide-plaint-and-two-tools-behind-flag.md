# T-375 — v1 scope: hide the civil plaint and two free tools behind a flag

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) |
| Mode   | Small fix |
| Status | Merged into develop_staging bb8fd47 (tanvi, 13 Oct 2026). Switches default off: feature.template_civil_plaint, feature.tool_bail_checker, feature.tool_timeline. Waiting for Anushka on develop. Priya |
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

## Arjun (13 Oct 2026, part 1)

1. Not fail-closed on a Mongo outage: that would make the tools die with Mongo, which is what T-371 AC2 exists to prevent. Rule: `toolGuard` keeps the last successfully read value in memory and refreshes it every 60 s; if the refresh fails it keeps serving the last value and logs once. Only with no successful read since boot (cold start, Mongo down) is the switch off (404). The per-request path still touches no Mongo or Redis.
2. Close them too. `applyAnswers` and `updateBrief` reject a hidden kind with the same 404 through the exported guard, so no brief can be started or continued for a hidden kind and dead-end at generate. Priya extends the claim with `intake.routes.ts` for those two handlers only.

**Arjun (13 Oct):** the fixture account sees every switch as on, generation included — T-356's rule, no special case for the template switch. Its drafts are `runType: fixture` and filtered everywhere, and the golden set needs the plaint fixtures to keep running.

## /tools 404s (audit P0 from Rajesh, 30 Oct 2026; Arjun's diagnosis)
This is not a build bug. The T-375 switches feature.tool_bail_checker and feature.tool_timeline are off in prod, but the footer and the /tools index still link to both tools. Next month the team picks one: switch them on (after Anushka checks both tools), or hide the links (a small v1.3.2 change). Nothing started.
