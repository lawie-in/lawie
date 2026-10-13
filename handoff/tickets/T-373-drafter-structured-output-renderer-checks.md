# T-373 — Drafter structured output, renderer and checks panel (four bail packs)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead A (drafting) + Ajay (sign) + Arjun (contract) |
| Mode   | Full chain |
| Status | To do. Ordered by Arjun (NEXT 2, ADR-025 D1, lead A). Priya, 13 Oct 2026 |
| Source | ADR-025 (Arjun, 13 Oct 2026, handoff/tickets/ADR-025-structured-drafting-and-signed-data.md) |

## Acceptance criteria

Arjun writes the detailed ACs here before anyone starts. Scope from ADR-025 D1:
- The Drafter returns structured output: `paragraphs[]{ clauseId, factRefs[], text }`.
- A code renderer builds the document. A paragraph with no clauseId is dropped. A missing required factRef becomes `{{MISSING: label}}`. An entity not in the referenced fact becomes a blank. Duplicate sections print once.
- Free text only in clauses sourced from the advocate's own words, rephrased for grammar only. Grounds come back as a list with one ref each.
- The checks panel reads the rendered clause ids.
- Golden assertions for the four bail packs; Anushka's run-3 drafts are fixtures.
T-359 and T-362 are delivered by this ticket and T-374, not by prompt or list tuning.
