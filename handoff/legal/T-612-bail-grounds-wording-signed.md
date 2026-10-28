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

## T-612 _averments check (Ajay, 27 Oct 2026): fix/t-612-bail-grounds @ commit SHA 41991cf1

| item | result |
| --- | --- |
| G2/G4 entries | Both packs: kind `averment`, texts byte-identical to (7)2, each `requires` its own ticked ground (option label equals the signed label, pack grounds label exact). The skeleton JSON is unchanged since d1e85da6, and the md files on the branch are byte-identical to mine. |
| Inheritance | interim_bail and bail_before_magistrate inherit these entries and unlock only on that exact ticked label: OK. |
| Signed _averments SHA-256 at 41991cf1 | bail_regular SHA `8ee0a7569fe463b93ab5d0c951b6cf4e8562a3c389fd49af1cd06e41b824b26f`; bail_anticipatory SHA `4173d669e03be93ec6d882bf4b0fde28cd68ceed1274f50347f6914e9e830fc6`. The pins (t190 AC5, t334, t449 (e)) move to these. |
| t189 R3/R5 guard | **Narrow**: allow exactly `grounds_for_bail` with `equals` only. Any other list or choices key still fails. Do not retire the guard. |

**T-612 APPROVED at 41991cf1.** It counts as merged at the develop_staging SHA that contains 41991cf1.

## (6a) Police station: the "Thana" amendment (Ajay, 27 Oct 2026; amends (6) and T-334 Addendum 2)

The bug Tanvi's review found ("PS Thana Bhawan" printed as "Police Station Bhawan") shows that "Thana" can be part of a real station or place name. Thana Bhawan is a town in Uttar Pradesh, and printing the wrong name is worse than printing a redundant word. New rule, **for both storing and rendering, applied once**:

| marker | strip? |
| --- | --- |
| `PS`, `P.S.`, `P S`, `Police Station` (any case, trailing punctuation or space), leading or trailing | **Yes**, once. |
| `Thana` / `थाना` followed by a separator (`:`, `-`, `–`), e.g. "Thana: Kotwali", "थाना - कोतवाली" | **Yes**, once. |
| `Thana` / `थाना` followed only by a space ("Thana Bhawan", "थाना कोतवाली") | **No**: kept as part of the name. |

Effects:
- "PS Thana Bhawan" is stored as `Thana Bhawan` and prints `Police Station Thana Bhawan`.
- A bare "Thana Kotwali" prints `Police Station Thana Kotwali`. That is redundant but never wrong, and the advocate can edit it.
- An old-ledger "थाना Kotwali" prints `Police Station थाना Kotwali`. Accepted on the same ground; there is no migration.

This **replaces** Tanvi's marker-keeping fix in `bareStationName`: one rule on every path, with no second strip in the renderer. It amends T-334 Addendum 2: its `Thana` / `Thana:` entries now follow this table. I byte-check it on the new SHA.

(6b) Follow-ups (27 Oct 2026):
1. A **trailing** `Thana` / `थाना` (the last word, with a name left before it) **is stripped** once: "Kotwali थाना" prints `Police Station Kotwali`. Hindi word order puts the marker last, and a station name ending in "Thana" is far rarer than one beginning with it. A leading bare "Thana X" stays as in (6a). This is a one-line add in T-612.
2. Raw values typed straight into a template form (template-engine ~2152–2165, T-139 / C2 rules): this moves to **T-638**, with the annexures line. It is not blocking, because the outputs there are redundant, not a wrong name. T-638 applies the (6a)/(6b) table on that path too and adds `पुलिस स्टेशन` and `पुलिस थाना` as always-stripped markers (they are never part of a name). The C2 rule is amended to match in T-638, with my byte check.
3. (27 Oct) Two-marker inputs: **option A.** Store and render each apply the table once, so an input with two markers loses both end to end ("PS PS Kadamkuan" and "P.S. Kotwali Thana" print `Police Station Kadamkuan` / `Police Station Kotwali`). That is correct output and never worse than one marker. "Applied once" in (6a) means once **per stage**, not once overall. The renderer strip stays for old ledgers. Tests pin the store-then-render outputs.

## T-612 final byte check (Ajay, 27 Oct 2026): fix/t-612-bail-grounds @ commit SHA fc25a22d

| item | result |
| --- | --- |
| Since 41991cf1 | No change in `apps/drafting/src/config`. The skeleton md files on the branch are byte-identical to mine (v6). The t449 averments pins moved to my SHAs (8ee0a756…, 4173d669…). |
| Police station code | `bareStationName` (store) and `stripPoliceStationPrefix` (render) each apply, once per stage, the table: trailing then leading PS / P.S. / P S / Police Station (whole marker, followed by a separator); leading Thana/थाना only with `:` `-` `–`; trailing Thana/थाना as the last word. A marker-only value is kept as written. Matches (6a), (6b)1 and (6b)3. "Thana Bhawan" is never stripped; "Psalm Nagar" is untouched. |
| Out of scope | Template raw path and the annexures line → T-638. |

**T-612 APPROVED at fc25a22d.** It counts as merged at the develop_staging merge SHA that contains fc25a22d.

**T-612 merged (Ajay, 27 Oct 2026):** develop_staging merge SHA `81ca13d24259c13f974688b8283dadf70c70360d` contains fc25a22d. I checked it myself: the v6 skeleton JSON and md files have the signed SHAs (91fbd67a…, 98dc2262…; md 98c413b9…, 2a36261a…), and handoff/legal is unchanged from my ff6e0f04, so the merge kept my version.

## T-638 rulings (Ajay, 28 Oct 2026)

| # | ruling |
| --- | --- |
| A1 | Yes: `नहीं` and `कोई नहीं` join NONE_ANSWERS for the five NONE_IS_EMPTY_KEYS, only when the question was asked-when-empty. |
| A2 | Yes: annexures prose becomes `registered at Police Station {ps}`, with {ps} stripped by the (6a)/(6b) table first. The Synopsis label `PS: {ps}` stays: it is a label, not prose. |
| A3 | Yes: on the raw template path, apply the table in **two passes** in sequence, so every path gives the same output. `पुलिस स्टेशन` / `पुलिस थाना` are stripped in both positions. C2 is amended: a leading `थाना` is stripped only with `:` `-` `–`. That flips the T-139 round-4 row ("थाना सिविल लाइन्स" now stays), consistent with (6a). |
| B1 | The derived custody_since is **not** used, and the ASK fires instead, when the description or the ledger has any of: `surrender`, `surrendered`, `आत्मसमर्पण`, `remand`, `remanded`, `रिमांड`, `re-arrest`, `re-arrested`; or a ledger date whose meaning is custody or remand (date-meanings.json). |
| B2 | ASK, signed: `Since what date has the applicant been in custody (the date of arrest or surrender)?` |
| B3 | Yes: the brief shows `<date> (date of arrest)` beside the date, in the draft's date format ("12 June 2026"). An advocate edit makes it given, and the original custody line applies. |
| B4 | Yes: suppress `arrested_on` when the derived line prints, so the date never prints twice. That is a skeleton change, so a **v7 re-sign**: send me the pushed commit after review. |
| B5 | Yes: a given custody_since equal to arrest_date keeps `has been in {custody_kind} since {custody_since}`. |
| A1a | (28 Oct) NONE_ANSWERS strict set: **yes, strict, no vowel-dropping fold**, but add the common no-anusvara spellings `नही` and `कोई नही` (very common typing). Trailing `।` or `.` is allowed. A sentence such as `नहीं है` does not match. Golden annexure lines `registered at PS GOLDEN_PS` → `registered at Police Station GOLDEN_PS` (13 lines, nothing else): approved in principle, and checked at the byte check. |

## T-638 byte check and v7 re-sign (Ajay, 28 Oct 2026): fix/t-638-bail-custody-ps @ commit SHA 0469b3ae

| item | result |
| --- | --- |
| Skeleton v7 | Diff against v6 checked: only `custody_status_derived` (signed (5) text, byte-identical) plus two `skip_if_rendered`. **Re-signed v7**, bail_regular SHA `b15e03a2354a22c722c513f13ae6637810d5d00aee4d76699701d03e05fd2e04`; md SHA `91deb259361bc4d8954d359b2f32d0889759096d9d2d6697e7000345069e0c3f`. No other skeleton changed. |
| Strings | The B2 question is byte-identical in the pack and docs/templates. Caption `(date of arrest)`. Annexures: `registered at Police Station ${ps}`. The 13 golden lines change only that substring. B1 words are as signed (custody-since-derivation.ts:109–110). NONE_ANSWERS adds नहीं / कोई नहीं / नही / कोई नही. |
| (1) `custody_since_derived` in the Drafter FACTS | **OK** as an internal marker, like the s.138 computed facts, on the condition that it never prints in draft text. The renderer uses it only as a `when` key; a test pins that the token is never in the body. |
| (2) Brief display gap | **OK to ship with a note.** Only the brief caption can disagree; the wrong date is never printed, because generation refuses to derive. Ticket the fix in intake.service.ts updateBrief (Priya). |

**APPROVED at 0469b3ae** for the strings and skeleton v7. The final approval comes after review, as a delta from 0469b3ae.

**Correction (28 Oct 2026):** I pushed the v7 md to develop_staging (10f8fb64) before the T-638 skeleton JSON merged, which broke t374 on develop_staging. That was my miss. The md is restored to v6 (md SHA 98c413b9…, JSON 91fbd67a…). The v7 sign-off above stands. The v7 md (md SHA `91deb259…`, block SHA `b15e03a2…`) lands **only in the T-638 branch**, merged together with the v7 JSON, as T-612 did. Rule from now on: a re-signed skeleton md goes to the lead's branch, never straight to develop_staging.
