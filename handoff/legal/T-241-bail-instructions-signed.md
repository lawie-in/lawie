# T-241: bail pack instructions that assert facts (signed)

Ajay (CLO), 12 Oct 2026 IST. Base read: `origin/develop_staging` after 2256e44. Builds on T-237 (909a49c); apply T-237 first, then this. Same rule as T-136: the Drafter states a fact only if the BRIEF gives it.

The lead applies this text **word for word**. Indexes are the `promptInstructions` positions **before** T-237's insertions; match the entry by its current text, not its index.

## `bail_anticipatory.json`

| Entry (current text starts) | Replace with, exact text |
|---|---|
| 1 "Begin with facts establishing the applicant's apprehension of arrest ..." | `Begin with the facts that give the applicant reason to believe that the applicant may be arrested (for example a complaint, an FIR, a notice or summons received, or a threat), only as the BRIEF gives them. Do not add a fact the BRIEF does not give; where the BRIEF does not say what the apprehension rests on, write [To be confirmed: the facts on which the applicant apprehends arrest].` |
| 2 "State grounds for anticipatory bail: no prima facie case, ..." | `Set out the grounds for anticipatory bail that the BRIEF gives, and no others. Do not assert a ground (for example no prima facie case, false implication, malafide intention of the complainant, no criminal antecedents, cooperation with the investigation, roots in the community) unless the BRIEF states it. State each ground as the BRIEF puts it: do not add a reason or a detail to it. A submission on the law or the facts is written as "It is submitted that ...", among the grounds, never among the facts.` |

Entry 5 is replaced under T-237 AC2. No other entry changes.

## `bail_before_magistrate.json`

| Entry / field (current text starts) | Replace with, exact text |
|---|---|
| `promptInstructions` 3 "Set out FIR particulars and circumstances of arrest." | `Set out the FIR particulars and the circumstances of arrest as the BRIEF gives them. Use a blank for any of them the BRIEF does not give.` |
| `promptInstructions` 4 "Apply the triple-test: flight risk (no — give antecedents and roots), ..." | `Address the risk of flight, of tampering with the evidence and of influencing witnesses as submissions, each written as "It is submitted that ..." and each reasoned only on facts the BRIEF gives (for example residence, family, occupation, antecedents, the stage of investigation). Do not state any such fact the BRIEF does not give. Where the BRIEF gives no fact for one of the three, write [To be confirmed: facts relied on to show no risk of <flight / tampering with the evidence / influencing witnesses>] for that one.` |
| `promptInstructions` 6 "If charge sheet has been filed, mention that custody ..." | `Only if the BRIEF states that the charge sheet has been filed, submit that custody is no longer required for investigation. Do not say that the charge sheet has been filed, or that investigation is complete, unless the BRIEF states it.` |
| `prompt_context`, the words `(4) show clean antecedents or contextualise;` | `(4) state the applicant's antecedents only as the BRIEF gives them, with a blank where it does not;` (rest of `prompt_context` unchanged) |
| `mandatoryClauses` → `triple_test` | see JSON below |

```json
{"id": "triple_test", "name": "Flight, Evidence and Witnesses", "required": true, "description": "Submissions on the risk of flight, of tampering with the evidence and of influencing witnesses, each reasoned only on facts the brief gives, with a blank where it gives none. Never a statement of fact the brief does not give."}
```

`triple_test` keeps no cues (R2b), as signed on 12 Oct in T-200.

## AC3: `bail_regular` `earlier_applications` cue

Ruling: **tighten now, in this ticket.** Replace the 11 Oct cue set for (`bail_regular`, `earlier_applications`) with **EA-standard** from the T-237 sign-off (909a49c): the 11 Oct set without `before`. Nothing else in the `bail_regular` cue table changes.

## AC2 and AC4 conditions

| Item | Mark |
|---|---|
| AC2 tests: anticipatory brief with no ground stated → no ground asserted; magistrate brief with no residence/antecedents → blank for flight, no fact stated; magistrate brief silent on charge sheet → no "charge sheet filed" | Condition |
| AC2 test: `bail_regular` paragraph "bail application before this Hon'ble Court" reported as `earlier_applications`, no other cue word → `clause_not_in_paragraph` | Condition |
| AC4: moved golden snapshots listed for me before merge | Condition |
| `triple_test` display name change may move snapshots | Acceptable |

Signed: Ajay (CLO), 12 Oct 2026 IST. Text above, on the conditions above. Any other wording comes back to me.

## Addendum 1 (12 Oct 2026 IST): three descriptions outside the table (found by Vishal)

Fix in this ticket, same rule. Exact text:

| Where | Replace the description with |
|---|---|
| `bail_before_magistrate.json`, clause `grounds` | `The grounds for bail that the brief gives, and no others, each stated as the brief puts it. Never a ground the brief does not state.` |
| `bail_anticipatory.json`, clause `false_implication` | `Only if the brief states that the applicant is falsely implicated, and only as the brief puts it.` |
| `bail_before_magistrate.json`, legacy `mandatory_clauses` item "clean antecedents or explanation thereof" | Delete the item (dead text). If deleting it moves anything, leave it and tell me instead |

Moved snapshots come to me with the diff.
