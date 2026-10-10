# T-147b — Reception writes the ledger, and the brief renders from it

| Field          | Value                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                                                                           |
| Owner          | Vishal (build), Anushka (tests on develop with the batch)                                                                                                                        |
| Mode           | Build, full chain (developer + reviewer + tester). Merge to develop                                                                                                              |
| Status         | Blocked on T-147a                                                                                                                                                                |
| Size           | M (1.5 days)                                                                                                                                                                     |
| Depends on     | T-147a (the ledger type and the normalizer)                                                                                                                                      |
| Branch         | feat/t-147b-reception-to-ledger                                                                                                                                                  |
| Legal sign-off | BLOCKED for Ajay on the `intake.prompts.ts` diff — the extraction pass changes what Reception is asked to do. Send him the before/after prompt text and the new question wording |
| Created        | 2026-10-09                                                                                                                                                                       |
| Source         | ADR-022 section 2A rules 1, 5 and 6. Parent: T-147                                                                                                                               |

## Problem

Reception hands prose to the Drafter. Facts the advocate gave in Hinglish are lost on the way, and the confirm-brief screen shows the advocate something other than what the Drafter will actually receive — so there is no point at which the advocate can see a missing fact before paying for a draft.

## User

District court advocate on the confirm-brief screen, about to spend Ink on a draft, who needs to see every value the system picked up and fix the ones that are wrong.

## Solution

1. **An explicit extraction pass.** A dedicated Haiku call whose only job is to emit `facts[]` from the advocate's description plus the rule pack's required-fact list. It does not draft, does not summarise, does not advise. Its output goes through the T-147a normalizer before it is stored.
2. **Low confidence becomes a question.** Anything below the fact type's confidence floor, and anything the normalizer returns as ambiguous, goes to `unresolved` and is asked through the existing ask-only-what-is-missing step. No silent inference.
3. **The brief renders from the ledger.** `BriefStep.tsx` reads ledger facts, not prose. Each fact is editable, and tapping one shows its `raw_span` — the advocate's own words that produced it.
4. **The ledger is persisted with the matter and versioned on edit**, so there is an audit record of what the advocate said and what they corrected.

## Acceptance criteria

1. The extraction pass is its own call with its own prompt. It is not folded into the existing match call or the question-generation call.
2. Every value in the stored ledger has a non-empty `raw_span` that appears verbatim in the advocate's input or in their answer to a question. A fact whose span cannot be located is dropped and logged, never stored with an invented span.
3. `source` is `"user"` for a value taken from the free description and `"asked"` for a value that came from an answer.
4. **The three T-147 values survive.** Given a Hinglish description containing an amount as "3 lakh", a police station as "PS <name>" and a date as "12/3/26", the stored ledger holds all three with correct `value` and `display`. This is the ticket's headline test.
5. A value the normalizer cannot resolve appears in `unresolved` with its reason and is asked. It is never stored as a fact with a guessed value.
6. `BriefStep.tsx` renders every ledger fact with its `display`, marks the ones flagged `required_in_draft`, and shows `unresolved` labels as outstanding. What the screen shows and what the Drafter would receive are the same set — a test asserts this, comparing the rendered facts to the ledger payload.
7. Editing a fact on the brief writes a new ledger version with the old value retained. The edited value goes through the normalizer, so an edit typed as "3 lakh" normalises the same way the original did.
8. `runType` is set on every ledger: `"user"` for real traffic. The `"fixture"` path is not exercised here; it lands in T-147e.
9. No Drafter change. The Drafter still receives what it receives today — the ledger is written and shown but not yet the Drafter's input contract. That swap is T-147c, so this ticket cannot regress draft output.
10. CI green on all four services. Existing intake and brief tests pass unmodified; if `t150-brief-edit.test.ts` or `intake.brief.test.ts` needs a change, stop and report before changing it.

## Out of scope

- Making the ledger the Drafter's only input: T-147c.
- Any check comparing a draft to the ledger: T-147d.
- Image or PDF attachments as a source of facts (T-301, T-304).
- Changing which document is matched, or the court picker — T-134 and T-140 own those.
- Re-asking behaviour already scoped in T-139. If the extraction pass makes T-139 easier, note it in the report; do not fold it in.

## What Ajay must sign

The `intake.prompts.ts` diff for the extraction pass, and the wording of any new question the `unresolved` path asks. Send the before/after prompt text and the question strings. Per ADR-022 this is a gate: do not merge without it.

## Files (expected)

Touched: `apps/drafting/src/services/intake.service.ts`, `intake-brief.ts`, `intake-text.ts`, `intake.prompts.ts` (Ajay gate), `apps/drafting/src/routes/intake.routes.ts`, `apps/web/src/components/intake/BriefStep.tsx`, `briefTypes.ts`, `ValueInput.tsx`, the matter/ledger model under `apps/drafting/src/models`. New: `apps/drafting/src/services/fact-ledger.service.ts`, `apps/drafting/src/__tests__/t147b-ledger.test.ts`. Read-only: ADR-022, the 92 packs in `config/document-rules/`.
