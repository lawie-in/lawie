# T-375 — v1 scope: hide the civil plaint and two free tools behind a flag

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) |
| Mode   | Small fix |
| Status | To do. Arjun's ruling on the v1 scope (13 Oct 2026, founder delegated). Next free lead. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL; Arjun's ruling: v1 = bail (4 packs), s.138 notice, converter |

## Acceptance criteria

1. One flag per item, default off, as an AppSetting or env key (Arjun's choice of mechanism): the civil plaint for recovery of money, the timeline tracker and the bail checker. Nothing is deleted.
2. When the flag is off, the item doesn't appear in the template list, search, Tools page, home page or navigation. A direct URL shows a short "not available yet" page, not a 500.
3. The timeline tracker comes back when T-367 merges. The bail checker comes back when T-371 and T-361 merge. The plaint comes back when T-368 merges. Each comes back by turning its flag on, with no code change.
4. Tests: each item is hidden when off and shown when on.
