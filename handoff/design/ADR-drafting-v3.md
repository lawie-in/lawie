# ADR: Drafting v3 — an orchestrated pipeline of narrow roles over one fact ledger

| Field | Value |
| ----- | ----- |
| Status | PROPOSED 26 Oct 2026. Signatures needed: Arjun (CTO), Ajay (legal parts, marked LEGAL), founder (approval) |
| Authors | Priya (PM) and Arjun (CTO), at the founder's request: "drafting needs more subagents: explorer, fact checker, grammar checker; the main drafter/reception agent interacts with them. Our drafter should be a solid one." |
| Supersedes | Extends ADR-022 (fact ledger, verifier) and ADR-025 (structured drafting D1). Neither is reverted |
| Evidence | handoff/quality/2026-10-26-prod-drafting-FAIL.md (Anushka, prod, FAIL); code map of 26 Oct (below) |

## 1. Why

Anushka's prod check (26 Oct, 5 drafts) failed on facts lost between steps, not on the model's legal knowledge:

| Seen on prod | Where it breaks today (code read, 26 Oct) |
| --- | --- |
| Bail grounds picked twice, brief says "To be asked", draft prints `{{MISSING: Grounds for Bail}}` (both bail types) | The web app drops list answers before sending them: `OneFlow.tsx` ~568-572 (`ledgerEdit` returns nothing for an array; `LedgerEditBody.text` typed string-only). The server accepts arrays (`applyMultiEdit`). `overlayBrief` also skips lists |
| Amount in words `{{MISSING}}` x3 although the brief shows it | `withAmountInWords` fills the brief only (source `description`); `overlayBrief` writes only source `user`, so the ledger never holds it |
| Sale deed date `{{MISSING: date}}` x4; cheque date blanked; in-custody-since blanked | `judgeDate` blanks a held date when a nearby word stem matches another date fact's label (`wrong_fact`), and checks dates inside narrative facts against the skeleton only |
| Regular bail "We could not find a ready document" x3 | One 300-token match call over a catalogue with five bail packs; `bail_regular` has no match terms; malformed/truncated output or an off-list id gives `no_match` |
| Raw `{{MISSING}}` visible to the lawyer | Converted to `[To be confirmed: …]` only on export/review/count, never in the editor |
| Grounds not argued, prayer restrains a past act, blank cause title, "Police Station X Police Station", "himself or herself", "Rs. Rs" | No role reviews the finished draft as a lawyer would; derived wording is left to the model |

## 2. Decision: principles (non-negotiable)

1. **The fact ledger is the only state.** Every role reads and writes typed entries `{key, value, display, source: user|asked|derived|template, confidence, askedAt}`. No LLM output is state until a code step validates it into the ledger. Prompts receive the ledger, never earlier prose.
2. **Deterministic orchestrator.** Roles are functions with JSON-schema contracts called in a fixed order by code. No agent-to-agent conversation, no open loops. Each reviewer gets at most ONE repair pass; anything unresolved becomes a user question or a typed violation at the gate.
3. **Derived facts are code:** amount in words, limitation and date arithmetic, pronouns from gender, cause-title assembly, currency format, court display names. LLMs never compute these.
4. **"Explorer" = the Matcher over our own catalogue.** No live legal-research agent in v3 (invented citations, BCI exposure). Statutory text comes from our signed packs and court data. *Founder to confirm this reading of "explorer".*
5. **The delivery gate is code.** No `{{MISSING` for a ledger-held key, no unresolved blocking violation, no past date in a prayer, cause title complete. Otherwise: no Ink debited (T-545/T-567 contracts), the run is retryable, the user is asked the one missing thing. Raw tokens never reach the editor.
6. **Guards per step:** timeout, per-run token and cost cap, rate limit. A run that trips a cap fails safe with no charge.
7. **Data rule:** no prod draft content leaves the prod database into an AI session, test matters included. Aggregates and ids only.

## 3. The roles

| Role | Job | Code / LLM | Model setting |
| --- | --- | --- | --- |
| A Orchestrator (reception) | Owns the run: calls roles in order, writes the ledger, asks the user, resumes after a crash or token expiry | Code (state machine) | none |
| B Matcher (explorer) | Description → template. Code alias/keyword pass, then one cheap classify returning top-3 + confidence; below the calibrated threshold (start 0.75, tuned on logged intakes) the user picks from 3. Never "not found" when the catalogue has a plausible match | Code + 1 Haiku | `ai.model.matcher` |
| C Fact extractor | Description + each answer → ledger candidates; code validates types and ranges, computes derived keys, flags conflicts (two dates for one key) as a question | 1 Sonnet per intake turn + code | `ai.model.extractor` |
| D Drafter | Writes from the ledger + the pack skeleton + Ajay's section instructions only (D1 structured output where a skeleton exists) | Sonnet | `ai.model.drafter` |
| E Fact checker | First a code diff of draft placeholders vs ledger (catches most of today's failures at zero tokens); then one Haiku pass for semantic mismatch. Returns typed violations; the orchestrator repairs from the ledger or asks. **Never blanks a value the ledger holds** | Code + 1 Haiku | `ai.model.fact_checker` |
| F Legal reviewer (LEGAL) | Ajay's rubric as a checklist with ids: grounds argued, prayer coherent and future-dated, cause title complete, provisions match the pack, no prohibited claims. Findings keyed to rubric ids and paragraph anchors; one Drafter repair with the findings. Every draft on a Haiku rubric; Sonnet for packs Ajay marks "argued" (bail, injunction, quashing). A diff guard rejects any pass that alters a ledger value | Haiku / Sonnet | `ai.model.legal_reviewer` |
| G Language | Code rules (doubled labels, "Rs. Rs", pronoun agreement, currency) + one Haiku grammar pass forbidden from changing facts (diff guard) | Code + 1 Haiku | `ai.model.language` |
| H Delivery gate | Principle 5 | Code | none |

Hindi: a separate ticket on top of Phase 1 (ledger `display` forms carry the language; roles are language-agnostic).

## 4. Budget, models, orchestration

- **Budget** (asserted in CI and at runtime): p50 ≤ 45 s, p95 ≤ 90 s end to end; ≤ 30k tokens per draft; cost cap per run `ai.cost_cap_paise`, default 800 paise, **Vikram confirms** against Ink pricing (1 Ink ≈ ₹21.7 at the 3-Ink pack; his model puts cost near ₹4 per Ink).
- **Models:** one AppSetting per role (table above) plus `ai.effort.*`. The admin AI page (T-609) lists all of them as required/optional, with the T-585 boot warning. Migration: today's `ai.drafting_model`/`ai.intake_model`/`ai.preflight_model` map to drafter/extractor/fact_checker with a fallback for one release.
- **Orchestration:** an in-process state machine in the drafting service. Every step idempotent and persisted (a run document: step, ledger version, outputs by step id), so a crash or a token expiry resumes from the last step. SSE stages (T-538) extended with the new stage names and `round`. No BullMQ in v3.0; the state machine is written so a queue can wrap it later (T-537).

## 5. Acceptance

- **Golden set (T-147e) is the gate, two layers.** (a) CI: recorded model responses (cassettes) per golden case, a deterministic run asserting zero `{{MISSING` for ledger-held keys, zero blocking legal findings, clean language rules, and a snapshot diff of the final draft that Ajay reviews when it changes. (b) Nightly live run on develop against real models with the budget asserted; results to a dashboard row and Sentry on regression. **The golden set includes Anushka's six matters of 26 Oct.**
- **KPI:** the existing PlaceholderRate model records `{{MISSING}}` counts per delivered draft. Target: zero ledger-held blanks, shown on the admin dashboard.
- **Release gate:** Anushka's PASS on develop before any prod cut.

## 6. What Ajay signs (LEGAL)

Drafter prompts and section instructions; the legal-reviewer rubric; the fact-checker violation policy (what counts as wrong); language rules that touch legal terms; every golden snapshot change. Nothing else in the pipeline is legal content.

## 7. Phasing (each phase behind `feature.drafting_v3_stage`, so prod can step back)

| Phase | What | Tickets | Size |
| --- | --- | --- | --- |
| 0 — now | Anushka's P0/P1 inside today's pipeline: the delivery gate (no charge, one auto-repair from the ledger, then ask; raw tokens never shown); the verifier never blanks ledger-held values; amount in words as a computed ledger fact; matcher top-3 pick; bail grounds as ledger keys (array answers sent); session refresh and resume; court/State data fixes | T-611 (+T-488), T-610, T-612, T-616, T-613, T-614/615/619, T-618 | days |
| 1 | The ledger as an explicit typed store; Extractor; derived facts in code; per-role model settings; resumable run state | new tickets after sign-off | ~2 weeks |
| 2 | Legal reviewer + Language pass + the single repair loop | new tickets | 1-2 weeks |
| 3 | Golden cassettes in CI + nightly live run + budget gate; then the flag default on, old path removed one release later | T-147e follow-ups, new | ~1 week |

Phase 0 gate: one automatic repair from the ledger, then ask the user. The "ask the one missing thing" screen needs one Rajesh line.

## 8. Rejected

- A live legal-research agent (principle 4).
- Free agent-to-agent conversation or unbounded loops (principle 2).
- LLM-computed derived facts (principle 3).
- BullMQ in v3.0 (section 4).

## 9. Open for the founder

1. Confirm "explorer" means catalogue matching (principle 4), not live research.
2. Approve the phasing and the budget (Vikram confirms the cost cap).

## Signatures

- Arjun (CTO): ____
- Ajay (CLO), sections 3F, 5, 6: ____
- Founder approval: ____
