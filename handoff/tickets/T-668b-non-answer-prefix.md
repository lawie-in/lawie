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
