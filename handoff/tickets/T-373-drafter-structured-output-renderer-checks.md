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

## Arjun (13 Oct 2026): facts_narrative for bail_before_magistrate

Ajay's v2 Magistrate skeleton (b61aaf9) renders its facts clause from the ledger key `facts_narrative`. Populating the ledger is the T-373 ledger path (brief-drafter.ts, after T-357), not T-374: the brief puts the facts narrative into the ledger for bail_before_magistrate exactly as it does for bail_regular, source `user`. A test: a Magistrate brief with facts produces a ledger with `facts_narrative`, and the rendered facts clause is not blank.

## Arjun (13 Oct 2026): phase 1 answers (ae56036)

1. JSON-schema format with `transform: false`: accepted. The API supports `enum` in structured output, so the raw schema is the stronger choice; keep the zod v3 parse client-side. One test asserts the schema sent carries the per-request `clauseId` and `factRefs` enum arrays.
2. The ADR wins: `source: advocate` falls back to `raw_span` verbatim when the entity check fails; `source: fixed` slots render from ledger display values, and a missing fact is the `{{MISSING}}` blank. The ticket line meant the fixed case.
3. Renderer formatting allowed: whitespace, paragraph numbers, (a)/(b) letters, ", " between one fact's entries. Never a word. A test strips those and expects exactly the paragraph texts and signed wording.
4. Checks off on D1 packs: checkPeriods, checkBriefIsUsed, party name, checkAgainstBrief, checkOneDocument, factAlteration. Kept: citations, court provisions, coherence, section sanity. The panel is built from `rendered[]` only. Findings from read-only verifyDraft go to the fact-diff log, no banner. Non-D1 packs and today's path unchanged. A test: a D1 draft's panel comes only from `rendered[]`.
5. English only on D1 for now. A Hindi draft of a D1 pack stays on today's path and carries the "starting draft" label like a non-D1 pack. Priya logs a follow-up: Hindi skeletons signed by Ajay, or Hindi out of v1 for the five packs.
