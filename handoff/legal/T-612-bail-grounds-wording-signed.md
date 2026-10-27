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

## (6) Police station naming (Ajay, 26 Oct 2026; Anushka items 1 and 11)

**Option (a).** The ledger and display value is the **bare name** (`Kotwali`). The template carries the prefix.
- Code strips a leading or trailing `PS`, `P.S.`, `Police Station` or `थाना` from the answer before storing it (case- and dot-insensitive), so "PS Kotwali", "Kotwali P.S." and "Kotwali Police Station" are all stored as `Kotwali`.
- Prose in drafts: `Police Station {police_station}`, so "Police Station Kotwali". Never "PS" in prose.
- FIR or case reference: the existing form stays where a template already uses it (`{police_station} P.S. Case No. …`, Bihar and Jharkhand usage). Do not add it where it is absent.
- Hindi: `थाना {police_station}`.
- No other wording ships. Every template that prints the slot is checked so that each draft has exactly one prefix. This is in my byte check at READY.

## (7) Build questions (Ajay, 27 Oct 2026)

| # | ruling |
| --- | --- |
| 1 | No roots fallback in bail_regular: **confirmed.** Its `roots` clause drops itself when `local_ties` is empty, and its `no_flight_risk` ground has no slot, so there is no gap. Adding a fallback would print a ground the advocate never ticked. |
| 2 | `_averments`: **add entries** for G2 and G4 in both packs, so the T-200 clause check can find them. G2: kind `averment`, text `the amount in dispute has been paid or deposited by or on behalf of the applicant, without prejudice to the applicant's defence`. G4: kind `averment`, text `the applicant is ready to furnish a bail bond with surety to the satisfaction of this Hon'ble Court and to abide by every condition this Hon'ble Court may impose`. No `requires` (no slot). Phrases are Tanvi's to propose and come to me with the byte check. |
| 3 | v6 skeleton re-sign: I re-sign only from a **pushed** commit after the review passes. I rebuild the SHA from the JSON at that commit myself. The parked T-500 changes, if they land, become v7. |
| 4 | T-638 note: `annexures.service.ts:505` "registered at PS {ps}" → `registered at Police Station {ps}` (T-612 (6)). That is legal text and comes to me with T-638. |

## T-612 byte check and v6 re-sign (Ajay, 27 Oct 2026): fix/t-612-bail-grounds @ commit SHA d1e85da6

| item | result |
| --- | --- |
| Skeletons | Diffs against v5 checked line by line. G1–G4 sentences, G3 requires/missing_label/skip, roots fallbacks (anticipatory) and the medical none values are byte-identical to (1)–(4) and (7). The renderer prints a `use_clause` clause once (draft-renderer.ts ~1321/1381). **Re-signed v6**: bail_regular SHA `91fbd67a36b0909aa857d3f597da6b28c33d9cd0c7827692fd491b3a726fff41`, bail_anticipatory SHA `98dc226270fde6c570a66b8dab833267118ce82731d9a70d2bde2b7d0106caca`. Both md files hold the new fenced block, which I checked equals the file plus "\n". |
| Packs and docs/templates | Option labels and the medical question are byte-identical in all four files. |
| Police station | No "PS {…}" left in prose. The court-rules cause-title form `through the S.H.O., P.S. {policeStation}` is the existing signed cause-title usage, with one prefix and the bare name. OK under (6). |
| _averments G2/G4 | Option (a) agreed: `requires` = its own ticked ground, ids `amount_paid_or_deposited` / `ready_to_furnish_bail_bond_and_sureties`, kind `averment`, texts as (7)2. Byte check of that follow-up commit is still to come. |

**APPROVED at d1e85da6** for the skeletons, packs and police-station change. It counts as merged at the develop_staging SHA that contains the final T-612 commit, after the _averments follow-up check.
