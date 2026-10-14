# T-373 — Drafter structured output, renderer and checks panel (four bail packs)

| Field  | Value                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| Phase  | 4 — Polish and release                                                                                                |
| Owner  | Lead A (drafting) + Ajay (sign) + Arjun (contract)                                                                    |
| Mode   | Full chain                                                                                                            |
| Status | Merged into develop_staging 3e031ac (Vishal, 13 Oct 2026). Ajay signed 17e8b6f. Waiting for Anushka on develop. Priya |
| Source | ADR-025 (Arjun, 13 Oct 2026, handoff/tickets/ADR-025-structured-drafting-and-signed-data.md)                          |

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

## Folded in from T-365 AC1 (Priya, 13 Oct 2026)

Ajay's add-on to T-365 AC1: when the advocate's profile has a name, don't tell the model the advocate name is unknown. Drop advocate_name from the unknown, still_unknown and missing lists at these three places in ai.service.ts: drafterBrief's call (~:1079-1084), guidedDrafterBrief's call (~:1565), and the ledger path's ledgerDrafterFacts ({{MISSING}}). With no profile name, keep the blank. Test both cases. Mahak's brief-drafter.ts fix (37807a2) already prints the profile name in the advocate block.

## Arjun (13 Oct 2026): advocate-clause check (bcdf5b7)

1. Yes, and wider than dates: any date, number, name or place in the model text that is not in the `raw_span` → fallback to `raw_span` verbatim. The banned-phrase exemption never rescues an altered entity.
2. Option (b), advocate clauses only: a content word not in the `raw_span` (after a stop list of connectives, articles, auxiliaries and grammar words) → fallback. Fallback is the advocate's own words, so a false positive costs nothing legal. Log the fallback rate per pack so we can see if Hinglish inflection makes it fire too often; tune the stop list then, not the rule.
3. On D1 packs, `factCheck.passed` is not computed from the legacy verifier: omit it (null). The read-only findings still go to the fact-diff log, tagged `path: d1`, so Ajay's weekly review can filter them. The panel and any pass/fail shown to the advocate come from `rendered[]` only.

## Arjun (13 Oct 2026): Magistrate facts, fact-check log (cb31cf8)

(A) Option (b), in `fact-ledger.service.ts`: when the ledger is built for a pack with no `facts_narrative` field, the intake's `fixed.facts` text is written to the ledger under the key `facts_narrative` (source `user`, `raw_span` = the advocate's text). The ledger key the skeleton names is canonical; `fixed.facts` is an intake-side name. No pack change, no loader alias. `ai.service.ts:1406` already treats the three names as one.
(B) Smaller than proposed. No `boolean | null` retyping: on D1 packs the response omits the `factCheck` object altogether (the panel is `rendered[]`). Keep the `path` field (`legacy` | `d1`) on `FactDiffDraft`, the `FactDiff` model and `writeFactCheckLog`, so the read-only D1 findings are filterable. Priya extends the claim with `FactDiff.model.ts` and the file holding `writeFactCheckLog`; `fact-verifier.ts` is untouched.

## Arjun (13 Oct 2026): Magistrate facts, second ruling (c10f763)

Option (a). `bail_before_magistrate.json` gets a `facts_narrative` textarea, the same field definition as `bail_regular` (label, placeholder, part `facts`, position after the sections step). Ajay signs it; it is a copy of wording he already signed. Mahak adds it in her one pack pass (T-365 AC6 + T-382 touch this file already) so the seven packs still change once. Vishal removes the `fixed.facts` copy code (dead once the field exists), keeps the real-checklist test pinned, and builds against a fixture copy of the pack until Mahak's merge. Not (b2): no silent checklist rule across packs.

## Arjun (13 Oct 2026): loader default

1. An invalid skeleton file fails loudly, no legacy fallback. Also validate every `_skeletons/*.json` at boot (shape + clause ids against the pack) so an invalid file fails the service start and /health, not the advocate's first draft. Missing file → `null` → legacy path, unchanged.
2. Legacy suites: mock the loader to `null` in setup only, and each such suite asserts once that it ran the legacy path, so the mock is never silently load-bearing. New route-level D1 tests on the four real skeletons, including the T-359 AC fixtures.
3. The enrolment pair is intentionally not in `SLOT_ALIASES`: it is a stored-key rewrite in `FIELD_ALIASES` (T-382), and after T-382 every pack spells `advocate_enrollment`, so skeleton slots resolve directly.

## Arjun (13 Oct 2026): review round 1

Two-way own-words check, yes: fall back when any `raw_span` content word (stemmed, not on the stop list) is missing from the text, or any `raw_span` number or date (by value) is missing. Dropped words are the worse direction — "not named" → "named" is a reversal. Stop list: remove "as" and the modals (may, might, could, should, must), and never list negations (not, no, never, without, nor, neither) or quantifiers (all, any, only, every): those are content. Keep the two gap tests plus one for the reversal.
