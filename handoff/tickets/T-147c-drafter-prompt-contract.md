# T-147c — The Drafter may use only the ledger, and may not assert what it was not given

| Field          | Value                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                                                                                                                           |
| Owner          | Vishal (build), Ajay (allowlists), Anushka (tests on develop)                                                                                                                                                                    |
| Mode           | Build, full chain. Merge to develop                                                                                                                                                                                              |
| Status         | Blocked on T-147b                                                                                                                                                                                                                |
| Size           | M (1 day), plus Ajay's sign-off time                                                                                                                                                                                             |
| Depends on     | T-147b (a populated ledger exists)                                                                                                                                                                                               |
| Branch         | feat/t-147c-drafter-contract                                                                                                                                                                                                     |
| Legal sign-off | BLOCKED for Ajay, twice: (1) the `drafter.prompts.ts` diff; (2) the averment allowlist and banned-assertion list for each of the 5 seeded rule packs. ADR-022 makes the per-pack allowlist CLO-signed before that pack goes live |
| Created        | 2026-10-09                                                                                                                                                                                                                       |
| Source         | ADR-022 section 2B. Parent: T-147                                                                                                                                                                                                |

## Problem

The draft asserted "no criminal antecedents", "gainfully employed", "cooperated with the police" and "strong family ties". The advocate said none of it. The Drafter is pattern-completing standard bail boilerplate from its priors, and those four lines are averments of fact that the advocate signs a verification over.

## User

District court advocate filing a bail application who must not be made to verify a fact he never stated.

## Solution

1. **The Drafter's input becomes ledger JSON plus the rule-pack skeleton, and nothing else.** No raw prose, no prior draft, no retrieved material.
2. **A missing required fact is written as `{{MISSING: label}}`**, inline, in the draft. Never invented, never silently dropped. The placeholder is correct output.
3. **A banned-assertion list per rule pack.** Each banned assertion names the ledger `label` that unlocks it; with no backing fact it may not appear.
4. **An averment allowlist per rule pack**, the positive form: these averments may be made, and only when their backing fact is present. Ajay signs each pack's list.
5. **Seed 5 packs, not 92.** The highest-volume packs get real lists now. The other 87 run default-deny: the generic banned list plus the existing structural checks. The mechanism ships; the data fills in as Anushka finds failures.

## Acceptance criteria

1. The Drafter call is constructed from the ledger and the pack skeleton only. A test asserts the assembled prompt contains no free-prose description field.
2. The bail pack's banned list covers at minimum: no criminal antecedents, gainfully employed, cooperated with the investigation, deep roots in society, no flight risk, no likelihood of tampering with evidence, no likelihood of absconding, sole breadwinner. Each entry names its unlocking `label`.
3. With a ledger that contains no employment fact, the draft contains no employment averment in any phrasing on the banned list.
4. With a ledger that _does_ contain the backing fact, the averment is allowed and uses the ledger `display` value.
5. A required fact absent from the ledger produces exactly `{{MISSING: label}}` at the place it belongs. The draft is not shortened to avoid the gap and no substitute wording is used.
6. The 5 seeded packs are named in the ticket report with the reason each was chosen, and each has an Ajay-signed allowlist file. The remaining 87 resolve to the generic default-deny list with no code change.
7. **T-148 is restated in the Drafter prompt and still holds:** no case law, citation or precedent enters a draft unless it is a ledger fact from the advocate or sits in the pack's Ajay-signed static block. A test covers one pack to confirm no judgment name appears from a ledger with none.
8. No change to the code-assembled cause title, prayer or verification (ADR-021 keeps those). Golden snapshots unchanged; if one moves, stop and report.
9. CI green on all four services.

## Out of scope

- The checks that catch a violation after generation: T-147d. This ticket constrains the prompt; it does not verify the output.
- Filling allowlists for the other 87 packs. Priya tracks that backlog; seeding order follows real usage.
- Prayer and verification text for packs that have none: T-129.
- Named judgments still sitting in other packs: T-154.
- Any retrieval or reference corpus. ADR-022 section 5.1 rejected it for T-147; it must not appear in this build.

## What Ajay must sign

Two gates, both before merge. First, the `drafter.prompts.ts` diff. Second, for each of the 5 seeded packs, the averment allowlist and the banned-assertion list — ADR-022 records that a pack's allowlist is CLO-signed before that pack goes live. Ask him for the review format and a turnaround up front (ADR-022 open question 2) so the build does not stall waiting.

## Files (expected)

Touched: `apps/drafting/src/services/drafter.prompts.ts` (Ajay gate), `brief-drafter.ts`, `prompt-assembler.ts`, 5 files under `apps/drafting/src/config/document-rules/` (Ajay gate). New: `apps/drafting/src/config/document-rules/_averments/` (or a per-pack field — pick one and say which in the report), `apps/drafting/src/__tests__/t147c-drafter-contract.test.ts`. Read-only: ADR-022, T-148's citation rules in `citation-check.ts`.

## Notes

- 10 Oct 2026: in build (Vishal). Ajay is re-signing the prompt and `bail_regular`. Follow-ups logged as T-189 to T-195.
