# T-612: bail step 2 wording (Ajay, signed 26 Oct 2026)

For Tanvi. Files: bail_regular.json, bail_anticipatory.json, `_skeletons/`, `_averments/`. Labels and texts go in **byte for byte**. Option ids are Tanvi's choice unless named. Any `_averments/` entry follows the same text, as `it is submitted that …` where the kind is `submission`. I byte-check at READY.

## (1) New grounds (grounds_for_bail options + skeleton item)

| id | pack | option label | skeleton text (no slot unless shown) |
| --- | --- | --- | --- |
| G1 civil | regular (anticipatory already has it) | `Dispute is essentially civil in nature` | `The dispute between the parties is essentially civil in nature.` Use option id `business_dispute_civil_in_nature`, the same as anticipatory. |
| G2 money returned | regular and anticipatory | `Amount in dispute paid or deposited (without admission)` | `The amount in dispute has been paid or deposited by or on behalf of the applicant, without prejudice to the applicant's defence.` |
| G3 sole earner | regular (anticipatory only if it has the `sole_earning_member` field) | `Only earning member of the family` | No new sentence: `use_clause: "sole_breadwinner"`, see (2). |
| G4 sureties | regular and anticipatory | `Ready to furnish a bail bond and sureties` | `The applicant is ready to furnish a bail bond with surety to the satisfaction of this Hon'ble Court and to abide by every condition this Hon'ble Court may impose.` |

G2 note: "without prejudice to the applicant's defence" must stay. Paying back is not an admission, and the draft must not read as one. Neither the amount nor the date goes in this line. If the advocate wants them, they go in "Anything else".

## (2) Sole earner vs `sole_breadwinner`

They duplicate each other. **The existing fact and clause stay**: field `sole_earning_member` and clause `sole_breadwinner` (`The applicant is the only earning member of the family.`). The new ground G3 points to that clause (`use_clause`), with `requires: sole_earning_member = yes` and `missing_label: "Whether the applicant is the only earning member of the family"`. If G3 is ticked but the field is not yes, the gate asks the field (T-611 P6). The fixed `sole_breadwinner` clause gets `skip_if_rendered: "grounds.<G3 id>"`, so it never prints twice.

## (3) Anticipatory `deep_roots_in_community` with empty `{local_ties}`

| case | text |
| --- | --- |
| local_ties held | unchanged: `The applicant has roots in society: {local_ties}.` |
| local_ties empty, address held | `The applicant resides at {address} and has roots in society.` |
| both empty | `The applicant has roots in society.` |

The same fallback applies to bail_regular's `deep_roots_in_society` / `roots` clause, if it has the same gap.

## (4) Medical question (`medical_condition`, both packs)

Question, signed: `Does the applicant have any illness, disability or medical condition you want placed before the court? If yes, name it as written in the medical papers. If not, write "None".`

Rules: an answer of `None`, `none`, `no`, `नहीं` or `कोई नहीं` counts as **answered** (askedAt set, never asked again) and as **absent** for rendering, so the draft never says "suffers from None". If `medical_grounds` is ticked and the answer is None, the conflict goes to the user (T-611 P1); it is never drafted. The question is asked only once either way.

## (5) Custody since (R1, T-611 file)

| source of custody_since | line |
| --- | --- |
| given by the user | unchanged: `The applicant has been in {custody_kind} since {custody_since}.` |
| derived from arrest_date (R1) | `The applicant was arrested on {custody_since} and is now in {custody_kind}.` |

Reason: the arrest date starts custody, not judicial custody. "In judicial custody since <arrest date>" would be wrong after police remand. The `prolonged_custody` ground (`The applicant has been in custody since {custody_since}.`) is correct either way and stays. The brief shows the derived date as `<date> (date of arrest)` (R1).
