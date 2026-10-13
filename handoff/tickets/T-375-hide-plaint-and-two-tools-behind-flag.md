# T-375 — v1 scope: hide the civil plaint and two free tools behind a flag

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) |
| Mode   | Small fix |
| Status | To do. Arjun's ruling on the v1 scope (13 Oct 2026, founder delegated). Next free lead. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL; Arjun's ruling: v1 = bail (4 packs), s.138 notice, converter |

## Acceptance criteria

1. The same on/off AppSetting switches as T-356 (Arjun): `feature.tool_timeline`, `feature.tool_bail_checker` and `feature.template_civil_plaint`, default off in code. Nothing is deleted. No new mechanism.
2. When the flag is off, the item doesn't appear in the template list, search, Tools page, home page or navigation. The routes return 404 when the switch is off (Arjun).
3. The timeline tracker comes back when T-367 merges. The bail checker comes back when T-371 and T-361 merge. The plaint comes back when T-368 merges. Each comes back by turning its flag on, with no code change.
4. Tests: each item is hidden when off and shown when on.
