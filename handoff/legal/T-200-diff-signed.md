# T-200: diff sign-off (signed)

Ajay (CLO), 12 Oct 2026 IST. Read: `git diff -w origin/develop_staging...739c4e5` for `brief-drafter.ts` in full, `ai.service.ts` in full (the three prettier-only hunks seen and ignored), and every changed line of the existing test files (`-w`, so the re-wrapping is hidden). I did not run the tests; Priya reports drafting 5362/5362, 91 snapshots unchanged, eslint 0 errors. Against: T-200 sign-off (11 Oct), cue mapping (12 Oct), `T-200-r2b-amendment-signed.md` sections 1 to 3.

## Marks

| Item | Mark |
|---|---|
| R0: reported paragraphs must exist (`paragraph_not_found`) | Approved |
| R1: fixed wording on the reported paragraphs; re-point only when it is complete and in order inside one other paragraph; not anywhere in the body: `wording_not_found`; in part or split: `clause_not_in_paragraph`; no stretch of 12 characters: R2; not English: R2 and the warning | Approved. The code reads "complete and in order in one other paragraph", the stricter of the two readings of my R1.3; accepted |
| R1.7 warning text: `Fixed wording of <title> not checked: the draft is not in English.` | Approved as written. Condition: the warning's `type` is `missing_clause`, which the UI may render as "missing clause". Either give it its own type (for example `clause_not_checked`) or confirm in the merge note that the UI shows only the message. Not a blocker |
| R2a cues: `CLAUSE_CUES` for `bail_regular` (5 clauses), `bail_anticipatory.fir_details`, `interim_bail.undertakings`, `bail_before_magistrate` (4 clauses); no fallback by id; unlisted clauses go to R2b | Approved. Every entry equals the 11 Oct table and the 12 Oct map |
| `{{key}}` in a cue: the brief's value, or its blank; a cue that resolves to nothing never matches | Approved |
| R2b recording, `includes` test, system-part skip (a clause the system added is never checked in the paragraphs; `missing` and `system` branches unchanged) | Approved |
| R2b.1, R2b.2 (`recordAgainAfterCodeEdit`; not when a paragraph is gone or holds only blanks; never re-records a clause already missing) | Approved |
| R2b.4 (`changeConfined`: one contiguous stretch inside a flagged sentence, everything before and after identical; 'dropped' violations are not flagged spans) | Approved. 'dropped' violations mixed with a model repair make the paragraph look unconfined, so it is not re-recorded: the safe side |
| Re-record points: after `removeUngivenCitations` (twice) and after the fact check | Approved |
| Repair pass checked against a copy of the recording; accepted only if fewer clauses are missing; a clause the repair adds is recorded from its own report | Approved |
| `ai.service.ts` call sites | Approved, as in the 12 Oct ruling |
| Existing fixtures: only body text changed (cue words added so the old fixtures pass for the right reason), `{ brief }` passed as the 4th argument in 7 tests, the t147e assertion limited to non-system clauses (approved 12 Oct); the rest is prettier re-wrapping. No reported paragraph number, clause id or other assertion changed | Approved. This is the condition of my 12 Oct ruling and it is met |
| New tests: `t200-missing-clause-check` (50), `t200-repair-end-to-end` (5), `t200-r2b-amendment` (31) | Approved. Condition from earlier: the 31 include (a) a model repair that replaces only the flagged phrase keeps the clause present with no label, and (b) one that also rewrites a neighbouring sentence reports `clause_not_in_paragraph`; confirm both in the merge note |

## Still to come on the cue map (not in this diff)

| Ticket | Cue-map change |
|---|---|
| T-237 | `earlier_applications` for `bail_anticipatory`, `bail_before_magistrate` (EA-standard) and `interim_bail` (EA-interim); `bail_anticipatory.no_flight_risk` undertaking cue |
| T-241 | `bail_regular.earlier_applications` becomes EA-standard (drop `before`) |
| T-251 | `default_bail.earlier_applications` EA-standard |
| T-239 | the cue sets named in the signed specs (EA-appeal, EA-proceeding, EA-transfer), by pack and clause id |

Each of those diffs comes to me before merge.

Signed: Ajay (CLO), 12 Oct 2026 IST, for commit 739c4e5, on the two conditions in the table (warning type; tests (a) and (b)). A later change to `CLAUSE_CUES`, to the R1/R2 rules or to the warning text needs a fresh sign-off.
