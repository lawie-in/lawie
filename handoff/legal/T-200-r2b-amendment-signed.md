# T-200: R2b amendment (signed)

Ajay (CLO), 12 Oct 2026 IST. Asked through Priya: under R2b as signed on 11 Oct, a legitimate fact-repair edit (for example the verifier removing the banned phrase "law-abiding citizen") changes a paragraph's recorded text and makes every uncued clause reported there count as missing. That is a false "missing", not the risk R2b was written for.

Ruling: **option 3, amend R2b.** Options 1 and 2 are refused: 1 hides the defect, 2 ships it.

## R2b, as amended (replaces the 11 Oct R2b; R0, R1, R2a and R3 unchanged)

**R2b (no cues: the paragraph has not changed).** When the clause is first counted present, the code records the text of its reported paragraphs, with paragraph numbers removed. At every later check, the clause is present only if a reported paragraph still holds the latest recorded text word for word, numbers aside. If not: `clause_not_in_paragraph`.

- **R2b.1 Code edits re-record.** When Lawie's own code changes a paragraph without the Drafter (the fact check removing or replacing a banned or unsupported phrase, inserting a blank, removing a label), the code re-records the text of each paragraph it changed, straight after that edit, for every clause reported at that paragraph.
- **R2b.2 Exceptions.** A code edit does not re-record a paragraph that it removes, or that it leaves empty or holding nothing but blanks. Such a clause goes to `paragraph_not_found` (R0) or `clause_not_in_paragraph`.
- **R2b.3 Drafter edits are checked.** An edit by the Drafter (the repair pass) and a renumbering are always checked against the latest recording, never re-recorded by them. A clause the repair pass adds is recorded afresh from the repair's own report (as 11 Oct).

## System parts

Clauses covered by a system part (`prayer`, `verification`, `advocate_details`, and any other `coveredBySystemPart` clause) are never checked by R0 to R3, whatever paragraph the Drafter reports for them. This restates the 11 Oct cue table ("system parts, no cues"). If the code checks them today, that is a defect to fix in this ticket. The fixture that reports them at paragraph 1 stays as it is: it is the test that they are skipped.

## Tests (conditions)

| Test | Expected |
|---|---|
| Fact check removes "law-abiding citizen" from a paragraph holding an uncued clause | Clause still present; no starting-draft label |
| Fact check leaves that paragraph holding only a blank | `clause_not_in_paragraph` |
| Repair pass rewrites a paragraph holding an uncued clause | `clause_not_in_paragraph` (unchanged R2b) |
| `prayer` / `verification` / `advocate_details` reported at paragraph 1, paragraph 1 edited | Not checked, not missing |
| Today's passing T-136 and T-200 tests | Still pass, assertions unchanged |

## Marks

| Item | Mark |
|---|---|
| R2b as amended | Approved |
| Residual risk: a fact-check edit could strip the substance of a clause while leaving other words; R2b.1 trusts it | Risk, accepted for v1 (the fact check removes phrases, it does not write) |
| Code change in `brief-drafter.ts` within vishal's T-200 claim | Approved; I sign that diff with the rest of T-200 before merge |

Signed: Ajay (CLO), 12 Oct 2026 IST. Replaces the 11 Oct R2b only. Any other change needs a fresh sign-off.

## Section 2: model repair inside the fact check, and the t147e assertion (12 Oct 2026 IST, 2:50 IST resume)

Asked through Priya: does the fact check's targeted model repair (inside `verifyAndRepair`, removing a phrase such as "law-abiding citizen") count as a code edit under R2b.1? The model can rewrite more than the phrase.

**R2b.4 Model repair inside the fact check.** A model repair is not a code edit by itself. It re-records a paragraph only when the code can prove the edit stayed confined:
1. Compare the paragraph before and after the repair, word for word, numbers aside.
2. If everything before and everything after one contiguous stretch is identical, and that stretch lies inside the sentence the fact check flagged, re-record that paragraph (R2b.1).
3. If the model changed anything outside the flagged sentence, or changed more than one stretch, do not re-record. The clause is checked against the earlier record: an uncued clause reported there goes to `clause_not_in_paragraph` and the clause-repair pass.
4. Cued clauses (R2a) are not affected.
5. Re-record points: after `removeUngivenCitations`, and after the fact check, before check 3. "Only blanks" means no letter or digit is left once blanks are removed (R2b.2).

**Tests (conditions):** (a) model repair replaces only the flagged phrase → clause present, no starting-draft label; (b) model repair also rewrites a neighbouring sentence → `clause_not_in_paragraph`.

**t147e assertion: change approved.** "A repair that returns paragraph 1 without its number reports the clauses there as missing" becomes: it reports the non-system clauses reported there as missing, and never `prayer`, `verification` or `advocate_details`. To keep the original intent, the fixture adds one ordinary uncued clause at paragraph 1 that must still be reported missing. The changed assertion is listed in the merge note.

Signed: Ajay (CLO), 12 Oct 2026 IST.
