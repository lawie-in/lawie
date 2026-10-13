# T-374 — Signed clause skeletons for the four bail packs

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead B (drafting config) + Ajay (writes the skeletons) |
| Mode   | Full chain |
| Status | To do; ready to start (spec ebea19e). Ordered by Arjun (NEXT 2, ADR-025 D1, lead B). Priya, 13 Oct 2026 |
| Source | ADR-025 (Arjun, 13 Oct 2026, handoff/tickets/ADR-025-structured-drafting-and-signed-data.md) |

## Acceptance criteria

**The build spec is in ADR-025 (ebea19e): skeleton format, Drafter tool schema, renderer rules, tests, and the two-lead split with the interface fixed. Build to it.** Lead A needs no skeleton from Ajay to begin. Questions go straight to Arjun. Scope from ADR-025 D1:
- A skeleton loader for Ajay-signed pack skeletons.
- Migration of the `bail_*` packs (regular, anticipatory, default, Magistrate) onto skeletons.
- Ajay writes the four skeletons in parallel, from his T-359 signed text.

Skeleton slot list for Ajay: ADR-025 (40a4e6e). Ajay has it and is writing the four skeletons.
