# T-147a — Fact Ledger schema and the Indian/Hinglish normalizer

| Field          | Value                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase          | 1 — Describe and draft                                                                                                                                                                                                         |
| Owner          | Vishal (build). No tester gate: no user-visible change                                                                                                                                                                         |
| Mode           | Build, light chain (developer + reviewer). Merge to develop                                                                                                                                                                    |
| Status         | Ready                                                                                                                                                                                                                          |
| Size           | M (1.5 days)                                                                                                                                                                                                                   |
| Depends on     | ADR-022. Cut from origin/develop                                                                                                                                                                                               |
| Branch         | feat/t-147a-fact-ledger-schema                                                                                                                                                                                                 |
| Legal sign-off | Not needed. Pure types and number/date parsing, no legal content, no prompt text. Any edit under `config/document-rules/`, `config/court-rules/`, `config/courts/` or any `*.prompts.ts`: BLOCKED for Ajay with the exact diff |
| Created        | 2026-10-09                                                                                                                                                                                                                     |
| Source         | ADR-022 section 2A. Parent: T-147 (Anushka run 2, finding 2)                                                                                                                                                                   |

## Problem

The Drafter receives free prose, so there is no canonical value for any fact the advocate gave. That is why a Rs 3 lakh amount and a police station name given in Hinglish vanished from the draft, and why a memo date and a bank branch came out changed. Nothing in the codebase today says "this matter contains the value 300000", so there is also nothing a check could compare a draft against.

## User

District court advocate who types "3 lakh ka surety de sakta hai, PS Kotwali, memo 12/3/26" and expects those three values to appear in the draft exactly as given.

## Solution

Two pieces, both headless. No Reception change, no Drafter change, no UI.

1. **The Fact Ledger type**, in `packages/shared/src/types` so drafting and web both import it. Shape per ADR-022 section 2A: `{ matterId, rulePackId, runType, facts[], unresolved[] }`, where a fact is `{ id, label, value, display, raw_span, type, source, confidence, required_in_draft }`. `type` is the closed union in the ADR (`amount | date | person_name | place_name | police_station | court | section_ref | case_number | text | enum | boolean`). `runType` is `"user" | "fixture"`.
2. **The normalizer library**, one module, no LLM call, no network. Per fact type it returns either a canonical `value` plus an Indian-format `display`, or an ambiguity reason for `unresolved`.

## Acceptance criteria

1. The ledger type is exported from `packages/shared` and compiles in both `apps/drafting` and `apps/web`. No `any` on `value`; use a discriminated union on `type`.
2. **Amounts.** `3 lakh`, `3 lakhs`, `3 lac`, `3L`, `3,00,000`, `300000` and the Devanagari spelling all give `value: 300000`, `display: "Rs 3,00,000"`. Crore, thousand and a bare `k` suffix likewise. `display` uses Indian digit grouping (2,2,3) — `3,00,000`, never `300,000`.
3. **Dates.** `12/3/26`, `12-3-26`, `12.03.2026` and `12 March 2026` all give `value: "2026-03-12"`, `display: "12 March 2026"`. Day-first always; `03/12/2026` is 3 December, never 12 March.
4. **Ambiguity is never guessed.** A two-digit year that could be past or future, a day-month pair that is out of range, and a month name we cannot resolve each return an `unresolved` reason. There is no default year, no default month order, and no "closest match".
5. **Devanagari numerals** convert to Arabic digits wherever they appear in an amount, a date or a case number.
6. **Police stations and proper nouns.** A comparison form that is case-, space- and punctuation-insensitive and folds `PS`, `P.S.`, `P S`, `Thana` and the Devanagari equivalent, so `PS Kotwali` and `Kotwali P.S.` compare equal. `display` keeps the advocate's own spelling character for character. The normalizer never corrects a station name or a party name.
7. **Section refs** normalise to `{ act, section }`, so `S.483 BNSS`, `Sec 483 BNSS` and `Section 483 of the BNSS, 2023` compare equal. Keep the existing section handling in `citation-check.ts` working; if the two disagree on any input, stop and report rather than changing `citation-check.ts` in this ticket.
8. Every comparison helper is **pure and total**: given junk input it returns an `unresolved` reason, never throws.
9. Unit tests for 2 to 8 in a new `apps/drafting/src/__tests__/t147a-normalizer.test.ts` (or a shared-package test if the normalizer lands in `packages/shared/src/utils`). Minimum one case per bullet, plus the three real T-147 values: `3 lakh`, `PS` + station name, `12/3/26`.
10. CI green on all four services. No existing test modified. No golden snapshot changes; if one moves, stop and report.

## Out of scope

- Calling the normalizer from anywhere. Wiring Reception to produce a ledger is T-147b.
- The Drafter prompt contract and the banned-assertion lists: T-147c.
- Any check that compares a draft to the ledger: T-147d.
- Fixtures and real-model runs: T-147e.
- Confidence floors per fact type. Put a named constant per type with a first-pass value and a comment pointing at ADR-022 open question 5; calibration happens in T-147e.
- Touching `intake.prompts.ts`, `drafter.prompts.ts` or any rule pack.

## What Ajay must sign

Nothing. This ticket adds no legal content and changes no prompt or rule pack. If the work turns out to need a rule-pack field (for example `required_in_draft` per fact), stop and raise it — that field lands in T-147c with Ajay's sign-off, not here.

## Files (expected)

New: `packages/shared/src/types/fact-ledger.ts`, `packages/shared/src/utils/normalize/` (amount, date, name, section, index), `apps/drafting/src/__tests__/t147a-normalizer.test.ts`. Touched: `packages/shared/src/index.ts` (exports only). Read-only reference: `apps/drafting/src/services/citation-check.ts`, `apps/drafting/src/config/intake/date-meanings.json`.
