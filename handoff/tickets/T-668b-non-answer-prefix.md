# T-668b — "Not known (…)" counts as a non-answer; doubled "the" fixed

Status: merged b1cd4f64, released v1.2.4 (main bcb5771). Anushka 5c FAIL on the declaration plaint → T-668c, strike 2: Arjun writes the exact fix (two-strike rule).

## Acceptance criteria
1. Ajay AJ-668-M5/M5b/M5d/M5e: a party-name value that equals a non-answer, or begins with one as a whole word followed by a boundary, is a non-answer. This applies in every pack, including the O.39 party checks. Relief and restraint stay exact. It never matches inside a word or a real name ("Nilesh", "Nagendra", "Not Known Traders", "Na. Muthukumar").
2. A declaration plaint with "Defendant: Not known (a person claiming…)" blocks Confirm on the brief and form, before any Ink.
3. M5a: partyLabel drops one leading "the". The signed override is "Add the name of the person or authority this is against or addressed to, to continue."
4. If the ledger-given check is exact-match, it uses the same predicate.
5. Ajay byte-checks before merge.

## Mode
Small fix (drafting + web mirror), legal content.

## Arjun (29 Oct 2026) — two-strike fix note (strike 2: Anushka run 5c, v1.2.4)

Read the branch and the failing path myself. The matcher (`isPartyNonAnswer`) is right; the block is lost one layer up.

**Root cause.** The declaration/eviction plaint packs name their parties with the generic keys `fixed.first_party` / `fixed.other_party` (`FIXED_KEYS`, intake-brief.ts:622). `ledgerGivenKeys` (intake-brief.ts:1451) treats a value as "given by the ledger" unless the key's last segment is on `O39_REQUIRED_FIELDS` (`isNoFactGuardedField`) — i.e. only `plaintiff_name` / `defendant_name`. So a typed or extracted "Not known (…)" on `fixed.other_party` lands in `ledger_given_keys`, and `confirmState` (intake-brief.ts:1915–1923) drops it from `missingParties` because of `!given.has(i.key)`. The route's own check (documents.routes.ts:1665–1675) recomputes the brief *with* the ledger, so the server passes too. Eviction looked fixed only because its form answer went in empty. The client "to continue" line that vanishes on blur is the same thing seen from the web: the first render has no ledger keys, the re-fetch does.

**Fix (apps/drafting only, two functions, no new strings):**
1. `confirmState`, line 1921: the ledger exemption applies to emptiness, never to a non-answer:
   `(nonAnswer ? isPartyNonAnswer(i.value) : (isEmpty(i.value) && !given.has(i.key)))` — i.e. on the NON_ANSWER_PARTY_PACKS (and O.39) a party item whose value is a non-answer is missing whatever the ledger says. Keep `!given.has` only on the empty branch.
2. `ledgerGivenKeys`, lines 1459–1464: a party-name fact is checked with `isPartyNonAnswer` for the generic party keys too. Replace the `isNoFactGuardedField(lastSegment(f.key))` gate with: `const seg = lastSegment(f.key); const partyKey = isPartyNameGuardedField(seg) || f.key === FIXED_KEYS.firstParty || f.key === FIXED_KEYS.otherParty; if ((partyKey && isPartyNonAnswer(f.display) || partyKey && isPartyNonAnswer(f.value)) || (isNoFactGuardedField(seg) && (isEmptyOrNonAnswer(f.display) || isEmptyOrNonAnswer(f.value)))) continue;` — so `ledger_given_keys` sent to the web is right as well and "Still unknown" shows the party.
3. The intake question "…or should the defendant be shown only as unknown?" is model-written, not code. Add one line to the intake question prompt for required party names: never offer "unknown"/"leave blank" as an option for a required party; ask for the name. **Legal content — Ajay signs the line** (handoff/legal/T-511-copy-rulings-ajay.md).

**Tests that prove it in the real flow (not the matcher):**
- t668b-non-answer-prefix.test.ts: `buildBrief` for `plaint_declaration` with `values=[{key:'fixed.other_party', value:'Not known (a person claiming through a forged sale deed dated 12.02.2025)', source:'typed'}]` and `ledgerGiven` = `ledgerGivenKeys([{key:'fixed.other_party', display: same, value: same}])` → `can_confirm === false`, `confirm_blockers` includes `'parties'`, `confirm_missing_party_keys` = `['fixed.other_party']`, `ledger_given_keys` does not contain `fixed.other_party`. Same for `source:'description'` with display `'Defendant: Not known'` (expect blocked — if `isPartyNonAnswer('Defendant: Not known')` is false, the extraction must not prefix the label; add the case and fix whichever side fails).
- Route test (supertest, as t644-o39-cause-title.test.ts does): POST the declaration confirm with that value and a ledger holding it → 400 `brief_not_confirmed`, blockers `['parties']`.
- Control: `'Not Known Traders, a partnership firm'` on `fixed.other_party` → confirmable.
- Tester runs Anushka's exact declaration scenario in the browser (Playwright, dev box or local) before merge: Confirm disabled, no Ink spent.

Developer applies exactly this; nothing else rides on the ticket. Release v1.2.5 = this alone.

### Arjun — corrections to the strike-2 note (29 Oct 2026, 15:20 UTC, on Vishal's findings)

1. **confirmState expression — Vishal's version approved** (276/276): `(nonAnswer ? (isEmpty(i.value) ? !given.has(i.key) : isPartyNonAnswer(i.value)) : (isEmpty(i.value) && !given.has(i.key)))`. The ledger exemption applies to an empty value only; a typed non-answer is missing whatever the ledger holds. My draft expression was wrong because `isPartyNonAnswer('')` is true.
2. **Key correction**: `plaint_declaration` uses `plaintiff_name` / `defendant_name`, not the FIXED_KEYS — my root cause named the wrong key. The real hole in run 5c is the value `"Defendant: Not known"` (the advocate's own text, label included): `isPartyNonAnswer` returns false for it, so no blocker. Fix belongs in `isPartyNonAnswer` (signed-confirm-messages.ts): strip a leading party-role label (`plaintiff|defendant|petitioner|respondent|applicant|accused|complainant|opposite party|tenant|landlord` + optional number, followed by `:`, `-`, `–` or `—`) before the non-answer test. **Rule is Ajay's** (AJ-668c); it rides on T-668c, and Priya extends Vishal's claim to `apps/drafting/src/config/intake/signed-confirm-messages.ts` and its test.
3. **Scenario 2 of run 5c** (typed `Not known (…)` in the brief box, line shows while typing, clears on blur, Confirm drafts) is not yet explained by (1)+(2). Before merge, the tester reproduces it against the real update→confirm path with the ledger on (the web sends the ledger facts back; check whether the fact's `display` for `defendant_name` is label-prefixed by the web or the extractor after blur) and the ticket records what actually let it through. No merge on a theory.
4. **Prompts**: AJ-668c-P1 goes into both the pack prompt and `RECEPTION_GUIDED_SYSTEM_PROMPT` — same line, both places; legal content, Ajay signs once for both.

## T-668c merge gate (Arjun, 29 Oct 2026, via message; recorded by Priya)
- The gate is the real-route supertest on the confirm endpoint for the declaration template, plus one case that mirrors Anushka's run 5c sequence. No browser run, because the container has no Mongo/Redis and the develop box isn't built. Anushka re-checks on prod after v1.2.5.
- Ajay APPROVED 397c6c84 (945922df). P1 prompt line AJ-668c-P1 (82fd2097) is copied byte for byte into handoff/design/T-127-one-flow-rules-and-prompts.md.
- The no-pack fixed.other_party gap is split out to T-668d.

### Arjun — run 5c scenario 2 explained (29 Oct 2026, 15:50 UTC, from Anushka's records)

Anushka's defendant box in that run was labelled **"The person or authority it is against or addressed to"** with "Needed to continue" — that is `fixed.other_party`, the generic brief item, not `defendant_name`. Her description was "Suit for declaration and permanent injunction… Defendant: Not known (…)", court "District Court, Lucknow". So the brief was on the generic/no-pack path (or a kind whose party items are the fixed keys), where `nonAnswer` is false and only emptiness blocks: typed "Not known (a person claiming…)" is non-empty → Confirm enabled → drafted, 2 Ink. The "to continue" line she saw was the empty-box state before her fill; the blur re-check cleared it. This is Vishal's "second gap" (T-668d) and it IS the headline case, so it rides on T-668c:
- Rule (Ajay, AJ-668d): the §(j)3 non-answer test applies to the generic party items `fixed.first_party` / `fixed.other_party` on every court document, not only on the 8 packs.
- Code: `confirmState` — treat `nonAnswer` as true for items whose key is `FIXED_KEYS.firstParty`/`otherParty` when `courtDocument` is true; `ledgerGivenKeys` — same keys use `isPartyNonAnswer`.
- Tests: `buildBrief` with the exact description above → record which kind id the matcher assigns (the ticket states it); typed `fixed.other_party` = "Not known (a person claiming through a forged sale deed dated 12.02.2025)" → `can_confirm === false`, blockers include `parties`; real-route supertest update→confirm → 400. Control "Not Known Traders" passes.
