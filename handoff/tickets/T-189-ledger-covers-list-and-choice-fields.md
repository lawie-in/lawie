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

## Priya (11 Oct 2026, 23:15): T-228 folded in

Developer round 2 showed that AC5 cannot hold end to end while the verifier reads one entry per key: it flags 318(4) BNS as not in facts, runs a paid repair, and the delivered draft reads `{{MISSING: section}}`. Option A (Vishal): T-189 also makes the verifier (buildSources, checkDropped, repair facts) and averment unlocking read every entry of a list or choices key, each entry checked on its own, no merged fact and no joined `raw_span`. T-228's acceptance criteria 1 to 6 now belong to this ticket. `fact-verifier.ts` is added to vishal's claim. Ajay signs the per-entry read on the pushed diff. `factsByKey` stays byte-identical, and the new reads go through `factEntriesByKey`.


## Ajay rule for per-entry read (11 Oct 2026)

**Status: PRE-APPROVAL. It is not a sign-off.** It sets the rule Vishal builds against. The final sign-off is on the pushed diff to `averments.ts` and `fact-verifier.ts`, cited by commit hash in this file. Read (read-only): `conditionHolds` (averments.ts), `buildSources`, `checkDropped`, `present` (fact-verifier.ts). No code, tests or builds run.

**Answer: Approved in principle.** A per-entry presence check is the rule I will sign. Each held entry of a list or choices key is its own fact for every check. No check ever reads a joined string, a merged fact or a joined `raw_span`.

### R1. What counts as an entry being "present" in the draft

- An entry is present when the **existing** `present()` test for its type passes for that entry alone. That means the same `fold` whole-phrase match, the same section_ref, date, amount and police_station matching as today. This ticket does not add looser matching (no fuzzy match, no part-word match, no "most entries" threshold).
- Sections: the act has to match as well as the number. "318(4) IPC" or a bare "318(4)" in the draft does not satisfy the entry "318(4) BNS" if today's section_ref test would reject it. One draft phrase can satisfy several entries only when each entry passes its own test. Example: "Sections 318(4) and 319(2) BNS" passes both entries, provided today's section entity extraction reads both.
- Text entries (for example `grounds_for_bail`): present means the entry's trimmed display appears, after folding, as a whole phrase. This is the same strictness as single-value text keys today. **Risk, accepted:** if the Drafter paraphrases a ground, the verifier reports it as left out and a repair runs. That is safer than letting a ground drop silently. Loosening this needs its own ticket and its own sign-off.
- A `{{MISSING: ...}}` or `[To be confirmed: ...]` placeholder never counts as a held entry being present.

### R2. Verifier (`buildSources`, `checkDropped`, repair facts)

- `buildSources`: every held entry feeds the sources (ledger corpus, sectionKeys/sectionNumbers, dates, amounts, stations, verbatim corpus). A draft value is supported (not `not_in_facts`) if it matches **any** held entry of the key it belongs to. A value that matches no entry (for example 318(3) BNS when the advocate gave 318(4)) is still flagged.
- `checkDropped`: `required_in_draft` applies to each entry. Every missing entry gets its **own** `dropped` violation, with that entry's display as `ledgerValue`. There is never one violation per key with a joined value.
- Repair facts: each entry is passed as its own fact line with its own `raw_span`. The repair prompt's instruction text does not change. If it has to change, that is a separate prompt sign-off (AC9).
- The unresolved cue skip (`byKey.has`) stays as it is. A key with at least one held entry is held. Unresolved entries never enter sources, `facts` or the repair input.
- No repair fires when every entry is present (T-228 AC4).

### R3. Averment unlock conditions over a list or choices key

| Condition | Met when | Why |
| --- | --- | --- |
| `present: true` | at least 1 held, non-empty entry | Same as today |
| `equals` | **any** entry equals one of the wanted values | `equals` on a list means "this value is among what the advocate gave" |
| `not_in` | **every** entry is outside the `not_in` set. One entry inside the set fails the condition | `not_in` is an exclusion, so it fails closed. A barring value must not be outvoted by another entry |
| `all_of` | each child is tested under the rows above | Same as today |
| key missing, or zero non-empty entries | **false** | Same as today (Ajay, 10 Oct 2026). An empty array is never held |

- Each entry is compared on its own `folded(value)` and `folded(display)`, as today. No concatenation.
- Single-value keys (one entry): byte-identical results to today.
- **Blocker trigger:** if any averment in the 5 seeded packs interpolates a list or choices key into its text (`{{key}}`), stop and send it to me. Do not invent a join for the averment text.

### R4. Unchanged (T-189 conditions still apply)

- `factsByKey` byte-identical to `origin/develop_staging`. The new reads go through `factEntriesByKey` only.
- No change to `drafter.prompts.ts`, the extraction prompt, `missingPlaceholder`, the `missing` filter or the signed `LEDGER_DETAILS` sentences.
- Golden snapshots unchanged (AC10). If one moves, stop and report it.
- Blockers 2 and 3 on 910ced6 still have to be fixed in the same push.

### R5. Tests I will look for in the diff

1. Entries "318(4) BNS" and "319(2) BNS", draft cites both: no violation, no repair call, no `{{MISSING}}`.
2. Draft cites only 319(2) BNS: exactly one `dropped` violation, for 318(4) BNS.
3. Draft cites 318(4) IPC: the 318(4) BNS entry is not present.
4. `equals` is met by the second entry of a list. `not_in` fails when any one entry is in the set.
5. Single-value key regression: results are identical to today.

## Ajay on Vishal's two points (11 Oct 2026)

Read-only: `buildFactRepairUserPrompt`, the repair call in `verifyAndRepair`, `present()` and `finalResolution` (fact-verifier.ts on `develop_staging` 042652e). I have not seen Vishal's uncommitted diff. No code, tests or builds run. This is still not the sign-off; that stays on the pushed diff, cited by hash.

### (1) `raw_span` in repair fact lines: **Approved: keep today's shape. Do not add `raw_span`.**

- My R2 line was wrong. Repair facts have never carried `raw_span`; the shape is `{key, label, type, display}`, the same as the Drafter input. R2 now reads: "each held entry is its own repair fact line in today's `{key, label, type, display}` shape. Nothing is joined, and no `raw_span` is added."
- Why not add it: it changes the repair input for every key (AC9 territory, a prompt sign-off) and gains nothing legally. The repair model needs the value to write, not the source quote. It would also send more of the client's own text to the model per call (DPDP Act 2023 s.8(7) and s.4: purpose-limited, minimum necessary).
- Several lines may share one `key` (one per entry). That is expected. There is never a merged line.

### (2) Joined citation "Sections 318(4) and 319(2) BNS": **Acceptable for T-189 (Risk, accepted), with a follow-up ticket.**

- R1 governs: no looser matching in this ticket. My R1 example was conditional ("provided today's section entity extraction reads both"). `sections_charged` entries are type `text`, so it does not. The current behaviour follows the rule; my example was wrong for this key.
- Why acceptable: it fails safe. The entry is flagged (`dropped` resolves to `flagged`, not a placeholder), the section stays in the draft text, and nothing drops silently. Cost: one extra repair call on such drafts.
- **Risk, accepted:** if the repair keeps the joined form, the advocate sees a false "left out" flag for 318(4) BNS. This errs toward review, which is acceptable. A false "present" would not be.
- Conditions for my sign-off on the pushed diff:
  1. A test for this exact case asserts: one `dropped` for 318(4) BNS, at most one repair call, no `{{MISSING}}` / `[To be confirmed]` inserted, and the original citation text not stripped or rewritten by the verifier.
  2. Follow-up ticket (Priya to raise; Ajay signs): section-aware matching for `sections_charged` entries. Either type each entry `section_ref`, or extract sections from text entries with today's section_ref rules (act must match; "318(4) IPC" or bare "318(4)" never satisfies "318(4) BNS"). It needs its own golden-snapshot check and my sign-off.
