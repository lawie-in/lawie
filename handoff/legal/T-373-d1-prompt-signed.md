# T-373: DRAFTER_D1_SYSTEM_PROMPT (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Build 11ba566 (Vishal), diff SHA-256 prefix `ec397d47e42e3d2f`. Only `DRAFTER_D1_SYSTEM_PROMPT` is added. The signed PACK, REPAIR, GUIDED and FACT_REPAIR prompts are untouched.

Approved with one change, to clear a conflict: the Magistrate `grounds` clause is both `source: advocate` and `list: true`. Rule 3 gives it item text, but rule 4 says "empty text". Rule 4's opening becomes exactly:

`4. FIXED LIST CLAUSES. For a fixed clause with "list": true, in items, give one item for each entry of the "from" fact, in the order FACTS gives them, with factRef "<key>[<n>]" (n counts the entries of that key from 0) and empty text. Give no item for anything FACTS does not hold. Leave factRefs and text empty. An advocate clause with "list": true follows rule 3.`

Rules 1, 2, 3, 5 and 6 are approved as written, including rule 3's one-item-per-entry line. With this change made and "PROPOSED" removed, the prompt is signed. Any later edit needs a fresh sign-off.

**f8d2102: final.** Rule 4 is byte-equal to the line above, "PROPOSED" is removed, and the comment cites this file. Nothing else changed. Signed.

Note: the legacy LEDGER, LEDGER_REPAIR and FACT_REPAIR prompts still carry old "PROPOSED" comments. "Untouched" above means unchanged, not signed. Their status is a separate review, to be logged with Priya.

## Renderer review: `draft-renderer.ts` at 4b59ec7 (Ajay, 13 Oct 2026)

| Area | Ruling |
|---|---|
| Fixed clauses: signed text, slots from the ledger, MISSING only when the fact is absent, variants, optional clauses left out | Approved |
| Grounds list: one signed sentence per ticked option, MISSING form for an unsigned or `requires`-failed option, `use_clause` printed once | Approved |
| Police-station prefix strip (whole words only), section dedupe on (code, number) | Approved |
| A condition on an unheld key fails closed; an unknown list name fails closed | Approved |
| No literal sentences (test-enforced); fallback log carries ids and reasons, never text | Approved |
| Own-words check (advocate clauses) | **Blocker, 3 changes**, below |

### Own-words check: changes before merge

The add and drop checks compare **sets** of words. A rephrase that keeps every word but changes who did what to whom passes today. The advocate's words verbatim are always safe, so each case below must fall back.

1. **Order.** The content words of the model's text (not on the stop list, compared on stems) must appear in the same order as in the raw_span. A passive-voice rewrite will fall back, which is accepted.
2. **Modals out of the stop list.** Remove `will`, `would`, `shall` and `can`. Adding one turns a fact into an undertaking or a hypothesis.
3. **Words kept as written, like the negators.** Third-person pronouns (`he`, `him`, `his`, `himself`, `she`, `her`, `hers`, `herself`, `they`, `them`, `their`, `themselves`) and `or` / `either`. One in the text that the raw_span lacks, or one in the raw_span that the text lacks, means fallback.

Tests (each must fall back; use fictitious names):
- `Ramesh assaulted Suresh` → `Suresh assaulted Ramesh`
- `the amount was paid by the applicant to the complainant` → `the amount was paid by the complainant to the applicant`
- `she was at home` → `he was at home`
- `the applicant cooperates with the investigation` → `the applicant will cooperate with the investigation`
- `the applicant and his brother were present` → `the applicant or his brother was present`

Control (must stay `ok`): a tense or article fix with the same word order, e.g. `applicant arrested on 2 March 2025` → `The applicant was arrested on 2 March 2025.`

With these three changes and the tests in place, the renderer is approved with no further review. I byte-check only the stop-list and kept-words diff.

**21378b9: approved (byte-checked against 4b59ec7).**
- Removed from `OWN_WORDS_STOP_LIST`: or, either, will, would, shall, can, and the 12 third-person pronouns.
- `OWN_WORDS_KEPT` is exactly my list.
- `ownWordsKeptWordChanged` checks in both directions, and `ownWordsReordered` compares content-word stems in order.
- Both run before the verifier.

The pronouns are now content words, so they also enter the order check. That is correct.

Still to come: dates and amounts in sequence, with the sixth fallback test (`arrested 2 March, released 5 March` → `arrested 5 March, released 2 March`). Logic only. I sign the SHA when it is sent.
