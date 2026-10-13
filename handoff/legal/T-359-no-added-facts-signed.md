# T-359: bail drafts add no facts (signed rules)

Signed: Ajay (CLO), 13 Oct 2026 IST.

## AC1: blank or left out

| Point not given by the advocate | Rule |
|---|---|
| Criminal antecedents | **Blank** (the B-series blank from T-190). It must be disclosed, so it is never left out and never invented. |
| Earlier bail applications | **Blank** (T-190, T-341). |
| Roots in the community, family ties, character, "law-abiding", "no history of fleeing", occupation, health | **Left out.** These are positive claims and need the advocate's own facts. |
| Custody length or days in custody | Left out, unless arrest and remand dates are given. If they are, code computes it; the model never does. |
| Any ground not given (for example "business dispute", "false implication") | Left out. The Drafter may not add grounds. |

## AC5: a point both stated and blank

It is one or the other. If the description gave it without the question being asked, print it as given and raise the T-341 check-before-filing warning.

## AC6: relation in the verification

Use the relation as given (`S/o`, `D/o`, `W/o`). If it is not given, print `[To be confirmed: relation and name of parent or spouse]`. Never default to `S/o`.

## AC7: BNSS 480 proviso for a woman applicant (allowed text, exact)

`It is submitted that the applicant is a woman, and under the first proviso to Section 480(1) of the BNSS this Hon'ble Court may release her on bail even where the offence falls within clause (i) or (ii) of that sub-section.`

- Use it only when `applicant_sex` = Female.
- Never say bail is a right under this proviso; it is discretionary ("may").
- Verify the proviso text against the Gazette before release. The wording above follows CrPC 437(1), first proviso, which BNSS 480(1) carries forward.

## AC9

Prompt and check changes come to me as a diff before merge. Golden snapshots that move are reviewed by me.

## AC6 Addendum (T-393, Kunal), 13 Oct 2026

1. **Cause title too.** The AC6 rule applies everywhere the relation prints: cause title, memo of parties, verification and affidavit. Never a fixed `S/o`.
2. **Name given, relation not given:** print `[To be confirmed: relation] {name}`. Neither given: the full AC6 blank. Relation given, name not given: `{relation} [To be confirmed: name of parent or spouse]`.
3. **New question for the bail packs**, exactly. Label: `Relation to the person named below`. Options: `Son of (S/o)`, `Daughter of (D/o)`, `Wife of (W/o)`, `Husband of (H/o)`. Not required. It prints as `S/o`, `D/o`, `W/o` or `H/o`. The next field's label: `Name of father, mother or spouse`. Never infer the relation from sex.
4. **Scope.** Fix interim_bail, surrender_application and suspension_of_sentence in this ticket. It is the same defect and the same text, and I check them all in one diff.
