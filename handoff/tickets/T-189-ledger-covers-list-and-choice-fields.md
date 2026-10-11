# T-189 — The Fact Ledger covers list and choice fields

| Field          | Value                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                      |
| Owner          | Vishal (build). Ajay signs any prompt change. Anushka (verdict)                                                             |
| Mode           | Build, full chain. Merge to develop                                                                                         |
| Status         | Assigned to vishal, 11 Oct 2026. Not started. Founder confirmed option A, the approach below, 11 Oct 2026. AC1 done |
| Assigned lead  | vishal |
| Size           | M (1 day), plus Ajay's sign-off time if a prompt changes                                                                    |
| Depends on     | T-147b (extraction and ledger), T-147c (the ledger-only Drafter)                                                            |
| Blocks         | Switching `feature.fact_ledger` on for any real user. Same gate group as T-187, T-188 and T-147c                            |
| Gate           | Before `feature.fact_ledger` goes on for real users                                                                         |
| Branch         | feature/t-189-ledger-list-and-choice-fields                                                                                 |
| Legal sign-off | Needed only if the extraction prompt or `drafter.prompts.ts` changes. Ajay signs that diff                                  |
| Created        | 2026-10-10                                                                                                                  |
| Source         | Vishal, T-147c follow-up, 10 Oct 2026                                                                                       |

## Problem

With `feature.fact_ledger` on, `isLedgerItem` skips list and choices items. `bail_regular`'s required `sections_charged` and `grounds_for_bail` are list items, so they never reach the ledger and always render as missing, even when the advocate gave them.

## User

District court advocate drafting a regular bail application who has already given the sections charged and the grounds, and should not see them marked as missing.

## Solution (proposed, founder to confirm)

Extend T-147b's extraction and the ledger to list and choices items, under the same rule as other items: every value carries a verbatim span from the source (description or answer). No span, no fact.

## Acceptance criteria

1. The founder confirms the approach in this file before the build starts. **Done:** the founder confirmed option A, 11 Oct 2026.
2. `isLedgerItem` accepts list and choices items. Every list and choices item in the 5 seeded packs reaches the ledger when the advocate gave it.
3. Each list entry is its own ledger value with its own `raw_span`, copied verbatim from the source. An entry with no verbatim span is not stored as a fact; it goes to `unresolved` with its reason (T-147b AC5).
4. A choices value is stored only when it matches one of the item's allowed choices and has a verbatim span. A value outside the allowed choices goes to `unresolved`.
5. Test: `bail_regular` with `sections_charged` and `grounds_for_bail` given in the description renders both in the draft, not as `[To be confirmed: label]`.
6. Test: with neither given, both render as missing, as today.
7. Test: a list where one entry has no span keeps the entries that have one and puts the other in `unresolved`.
8. The brief shows list and choices items the same way the Drafter receives them (T-147b AC6).
9. No prompt text changes unless Ajay signs the diff.
10. Golden snapshots unchanged; if one moves, stop and report. CI green on all four services.

## Out of scope

- New questions for the packs (T-190)
- Code-computed facts (T-191, T-192)
- Items past the question cap (T-188)

## References

- T-147b, T-147c, T-188, ADR-022

## Ajay sign-off (11 Oct 2026)

Read (read-only): `LEDGER_DETAILS` in `apps/drafting/src/services/fact-ledger.service.ts` (signed 10 Oct 2026), `UnresolvedReason` in `packages/shared/src/types/fact-ledger.ts`, `factsByKey` in `apps/drafting/src/services/averments.ts`, `ledgerDrafterFacts` / `ledgerSkeletonBrief` in `apps/drafting/src/services/brief-drafter.ts`, `BriefItem.value` in `intake-brief.ts`. Branch `feature/t-189-ledger-list-and-choice-fields` not on origin at time of review; no diff read.

### (1) `no_verbatim_span` detail sentence: Approved with a rewording

- Proposed "We could not find where you wrote this." is **not signed**. Risk: it states the advocate wrote the entry. A list entry with no verbatim span may be the extraction model's own wording, not the advocate's; the sentence must not attribute it to them. "this" also lacks the "this detail" anchor the signed siblings use.
- **Signed text, exact:** `We could not find this detail in what you wrote.`
- Add it to `LEDGER_DETAILS` as `no_verbatim_span`, next to the three 10 Oct sentences; same "Do not reword" rule. Any other wording comes back to me.

### (2) `brief-drafter.ts` diff (factsByKey to factEntriesByKey): Approved, conditional: pending the pushed diff matching this description

Legal effect as described: no averment, prompt, missing-clause or label rule changes in substance. Today list and choices items never reach the ledger, so every entry becomes a new fact the advocate gave with its own span (AC3); a key that was missing becomes held, which is the intended fix (AC5). Missing keys still get `{{MISSING: label}}`; array values in the skeleton match how the non-ledger brief already carries list values (`BriefItem.value: string | string[] | null`).

Conditions (each one a Blocker if the pushed diff departs from it):
- No change to `drafter.prompts.ts`, the extraction prompt, any prompt string inside `brief-drafter.ts`, `missingPlaceholder`, or the `missing` filter (`required && !held.has(key)`).
- `averments.ts` `factsByKey`, `resolveAverments`, `conditionHolds` and `fact-verifier.ts` untouched. Averment selection and the verifier keep their current per-key reading; changing that is a separate sign-off.
- `factEntriesByKey` keeps `factsByKey`'s filter: an entry whose `display` is empty or whitespace is dropped, and a key with no non-empty entry is **not** held (so it still renders `{{MISSING: label}}`). An empty array must never count as a held value.
- Entries keep ledger order and are not de-duplicated, merged or re-worded; each `display` is trimmed only, as today.
- Non-list, non-choices kinds: value stays the single string, byte-identical to today. Golden snapshots unchanged (AC10).
- Unresolved list entries (including `no_verbatim_span`) never appear in `facts` or in the skeleton value array.

Reviewer: confirm each condition against the pushed diff and cite this section in the handoff. If any fails, stop and send it back to me.

## Ajay sign-off on pushed diff 910ced6 (11 Oct 2026)

**Verdict: BLOCKED.** Read `git diff origin/develop_staging...910ced6` (after `git fetch origin`) for `brief-drafter.ts`, `averments.ts`, `fact-verifier.ts`, `fact-ledger.service.ts`, `intake.routes.ts`, `packages/shared/src/types/fact-ledger.ts`. No tests or builds run.

1. **`missingPlaceholder` (brief-drafter.ts): Acceptable.** The 4-line chain is joined onto one line; same three calls, same order, same output `{{MISSING: <label>}}`. Formatting only; this does not breach condition 1. No prompt string, `drafter.prompts.ts`, extraction prompt or `missing` filter changed. (The same commit also splits other chains across lines, so "prettier did it" does not explain everything. Not a legal point.)
2. **`averments.ts` `factsByKey`: Blocker.** It was meant to stay untouched, but it was rewritten. A key with several entries now becomes one made-up fact (`mergedEntries`): `display` and `raw_span` are comma-joined, and `value` is comma-joined only when every entry is text. Otherwise it keeps the first entry's value. Breaches:
   - `factsByKey` is changed, against condition 2.
   - Entries are merged, against condition 4.
   - The joined `raw_span` is not a verbatim span from the source, which breaks the "every fact carries a verbatim span" rule (ADR-022 / T-147b).
   - `resolveAverments` and `conditionHolds` (averments.ts line 425) and `fact-verifier.ts` (`buildSources` line 628, repair prompt facts line 1449) all call `factsByKey`. So averment selection, the verifier's held-value sources and the fact-repair prompt input all change behaviour, even though `fact-verifier.ts` itself has no diff lines. For a non-text list (for example section refs), only the first entry's value reaches the verifier, so it can flag correctly given sections as unsupported.
   - Fix: restore `factsByKey` byte-identical to `origin/develop_staging`. Keep the new exported `factEntriesByKey`, used only by `brief-drafter.ts`. Changing how averments and the verifier read multi-entry keys needs its own ticket and sign-off.
3. **`no_verbatim_span` sentence: Blocker.** The branch ships `'We could not find where you wrote this.'`, the wording I rejected. It sits in a separate `LEDGER_DETAILS_T189` const and is commented "NOT YET SIGNED by Ajay". Fix: add `no_verbatim_span: 'We could not find this detail in what you wrote.'` to `LEDGER_DETAILS` next to the 10 Oct sentences. Delete `LEDGER_DETAILS_T189`, and update any test that asserts the old text.
4. **Risk (not blocking, noted):** `readMultiEntries` and `applyMultiEdit` drop an entry when its normalised value repeats an earlier one, keeping one. This happens at ledger write, not in `factEntriesByKey`, so it does not breach condition 4 as written. It is acceptable only because both entries normalise to the same value. Anushka should check a list with a repeated entry on develop.
5. **Conditions met in this diff:** `factEntriesByKey` drops entries whose display is empty or whitespace, and creates no key without a non-empty entry, so `held.has` still drives `{{MISSING}}`. Entries keep ledger order and are only trimmed. Non-list kinds take the single (last) entry as before. Unresolved entries never enter `facts` or the skeleton array.

Re-review needed after items 2 and 3 are fixed. Send me the new commit hash; I will re-check only those two items and the golden snapshots (AC10).
