# T-373 — Drafter structured output, renderer and checks panel (four bail packs)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead A (drafting) + Ajay (sign) + Arjun (contract) |
| Mode   | Full chain |
| Status | To do; ready to start (spec ebea19e). Ordered by Arjun (NEXT 2, ADR-025 D1, lead A). Priya, 13 Oct 2026 |
| Source | ADR-025 (Arjun, 13 Oct 2026, handoff/tickets/ADR-025-structured-drafting-and-signed-data.md) |

## Acceptance criteria

**The build spec is in ADR-025 (ebea19e): skeleton format, Drafter tool schema, renderer rules, tests, and the two-lead split with the interface fixed. Build to it.** Lead A needs no skeleton from Ajay to begin. Questions go straight to Arjun. Scope from ADR-025 D1:
- The Drafter returns structured output: `paragraphs[]{ clauseId, factRefs[], text }`.
- A code renderer builds the document. A paragraph with no clauseId is dropped. A missing required factRef becomes `{{MISSING: label}}`. An entity not in the referenced fact becomes a blank. Duplicate sections print once.
- Free text only in clauses sourced from the advocate's own words, rephrased for grammar only. Grounds come back as a list with one ref each.
- The checks panel reads the rendered clause ids.
- Golden assertions for the four bail packs; Anushka's run-3 drafts are fixtures.
T-359 and T-362 are delivered by this ticket and T-374, not by prompt or list tuning.

## Arjun (13 Oct 2026): the renderer is not legal content

draft-renderer.ts carries no legal wording. Its only fixed string is the signed {{MISSING: label}} marker. Rule: a change that adds a literal sentence goes to Ajay. A test asserts the renderer emits no text that isn't from a skeleton, a fact or the marker.
