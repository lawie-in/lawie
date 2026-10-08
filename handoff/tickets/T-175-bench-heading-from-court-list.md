# T-175 — A Lucknow Bench court picked from the list prints its own heading

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal (build), Ajay (heading lines), Anushka (tests develop after the batch) |
| Mode           | Fix, light chain (developer + tester + reviewer). Merge to develop per founder's 8 Oct rule, after Ajay has seen the heading lines |
| Status         | Merged to develop (PR #71), 8 Oct. Anushka tests on develop. |
| Priority       | Blocker for UP launch |
| Size           | S (half day) |
| Depends on     | None. Cut from origin/develop. Pre-existing; not caused by T-171 |
| Branch         | fix/t-175-bench-heading-from-court-list (worktree `scratchpad/wt-t175`) |
| Legal sign-off | `template-engine.service.ts` is not a legal-content path, but Ajay must see the before/after heading lines before merge. Any golden snapshot change goes to Ajay. Any edit under a legal-content path (`config/court-rules/`, `config/courts/`, `config/document-rules/` ...): BLOCKED for Ajay, with the exact diff |
| Created        | 2026-10-08 |
| Source         | AJ-2026-10-08-T171-A3 (merge sign-off), "Risk, not a T-171 condition", in `scratchpad/ajay-signoff-2026-10-08.md`. Fix wording from AJ-2026-10-08-T171-A2 call 2 and A2 (final) |

## Problem

When the advocate picks "High Court of Judicature at Allahabad, Lucknow Bench" from the courts list instead of typing it, the draft heading prints `IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD`. That guesses the seat, which AJ-2026-10-08-T171-A1 item 3 forbids ("Never guess a seat or bench"). UP is a launch state.

Cause (court-picker path, not the prompt-assembler path T-171 fixed):
- `ai.service.ts:693` and `documents.routes.ts:767` / `:1475` load the entry's `formattingRulesRef` (`allahabad_hc`) via `loadCourtRule`.
- `courtHeading()` in `template-engine.service.ts` (~L470-520) takes the `else if (ruleDesignation)` branch and prints the rule's designation (`allahabad_hc.json`: `IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD`) instead of the entry's own (`indian-courts.json` ~L592: `IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD, LUCKNOW BENCH`).

## User

District court advocate in UP who files at the Lucknow Bench (bail, revision, writ) and picks the court from the list.

## Solution

Ajay's wording: in `courtHeading`, for a High Court with its own rule, print the courts-list entry's designation when it differs from the rule's. Pin it with a test.

- Applies only when the rule is a High Court's own rule (not a fallback/generic rule, which already has its own branches) and the entry has a non-empty designation.
- Do not mutate `courtData.courtRule` (the rule object is cached by `loadCourtRule`).
- No data change. `indian-courts.json` and `allahabad_hc.json` are not edited.

## Acceptance criteria

1. A Lucknow Bench court picked from the list (entry from `indian-courts.json`, `formattingRulesRef: allahabad_hc`) prints `IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD, LUCKNOW BENCH` as the heading. The addressing `designation` also names the Lucknow Bench. Pinned in a new test (`apps/drafting/src/__tests__/t175-*.test.ts`) on the rendered output.
2. Patna, Delhi, Jharkhand, Allahabad and Prayagraj headings are unchanged: one test per entry asserts the exact heading string before and after (their entry designation equals their rule's).
3. District and sessions court headings are unchanged, including the city append and the T-146 / T-157 blank cases. Existing tests for those pass without edits.
4. The cached rule is not mutated: after rendering Lucknow, `loadCourtRule('allahabad_hc').designation` is still `IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD`, and a following Allahabad render still prints `...AT ALLAHABAD`. Tested.
5. Golden status is reported: run `court-rules-golden`. Report pass/fail and snapshots written. If any snapshot changes, stop, do not update it, and send the diff to Ajay.
6. The annexures heading follows automatically: T-156 `chosenCourtHeading` (`template-engine.service.ts` ~L949, used by `annexures.service.ts` ~L562) prints the Lucknow Bench heading with no change to `annexures.service.ts`. Verified by a test on the annexures pack HTML.
7. The PR body carries the before/after heading lines for Lucknow, Allahabad, Prayagraj, Patna, Delhi, Jharkhand and one sessions court, for Ajay and for Anushka's packet.

## Out of scope

- T-155 (17 HC entries whose `formattingRulesRef` is `district_court_generic`).
- The prompt-assembler path (T-171, `prompt-assembler.ts`).
- Bare typed "Allahabad High Court" printing `...AT ALLAHABAD` and "Jharkhand High Court" printing `...AT RANCHI`: risks Ajay accepted in A2 (final).
- Any change to `config/courts/` or `config/court-rules/`.

## What Ajay must see

The before/after heading lines (AC 7) before merge, and any golden diff (AC 5). Not a legal-content-path signature unless a legal-content path changes.

## Files (expected)

`apps/drafting/src/services/template-engine.service.ts` (`courtHeading`, ~L470-520), one new test file. No change expected in `ai.service.ts`, `documents.routes.ts` or `annexures.service.ts`.
