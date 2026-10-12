# T-265 — Template batch 2: criminal, first 11 templates

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Matter context |
| Owner          | Lead (build). Ajay (signed specs; signs every diff). Anushka (samples) |
| Mode           | Full chain. Legal content: apply Ajay's signed text only |
| Status         | To do. Unassigned. Specs signed 12 Oct 2026 (96da5c8, 21aa6d9). Builds after T-257 (same area, same cue map) |
| Depends on     | T-240, T-245a, T-250 and T-255 (the transfer pairs b2-09 to b2-11 need the corrected CrPC→BNSS table), T-257 |

## Scope

The 11 templates in T-239's batch 2 table: special-statute bail (POCSO, UP Gangsters, Arms Act, PMLA), appeals and further evidence, and transfers.

## Acceptance criteria

1. Apply the specs word for word. No legal text written by the lead.
2. Category and price go in this batch's own file under `config/catalogue/` (T-240).
3. Three new cue sets (EA-proceeding, EA-transfer; the bail ones reuse EA-standard) go into `CLAUSE_CUES`. That diff goes to Ajay.
4. Test: an advocate's ground reproduced verbatim inside an allowed averment must not be stripped by the null-unlock bans. If it would be, drop those phrases from the ban lists.
5. The transfer cause-title heading is a blank on purpose, because the nomenclature differs by court.
6. Ajay signs each diff. Moved snapshots are listed for him. CI green on drafting.
