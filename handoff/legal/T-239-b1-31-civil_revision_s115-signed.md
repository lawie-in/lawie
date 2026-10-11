# T-239 b1 #31 civil_revision_s115 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. Tier A: limitation at stake. The Court is the High Court; scope is stated only in neutral terms and the Act's own words are under Verify.

| Field | Value |
|---|---|
| id | `civil_revision_s115` |
| displayName | Civil Revision (CPC Section 115) |
| category | Civil: appeals, revision, review, execution |
| court_levels | `["high_court_appellate_civil_side"]` |
| Ink | L = 2 |
| Anushka tier | A |
| averments file | `_averments/civil_revision_s115.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "115",
        "description": "Revision"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE HIGH COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{petitioner} ... Petitioner\nVERSUS\n{respondent} ... Respondent",
  "partyDesignations": [
    {
      "role": "petitioner",
      "label": "Petitioner"
    },
    {
      "role": "respondent",
      "label": "Respondent (Opposite Party)"
    }
  ],
  "caseNomenclature": "CIVIL REVISION No. _____ of [YEAR]\n(Under Section 115 of the Code of Civil Procedure, 1908)\n(Against the order dated {order_or_decree_date} passed by {lower_court} in {lower_case_ref})"
}
```

## mandatoryClauses

```json
[
  {"id": "parties", "name": "Parties", "required": true, "description": "Petitioner and respondents with their positions in the court below, as the BRIEF gives them."},
  {"id": "impugned_order", "name": "The Order Challenged", "required": true, "description": "The subordinate court, the case number, the date of the order and its terms, quoted exactly as the BRIEF gives them; blank where not given. Never paraphrased."},
  {"id": "facts", "name": "Brief Facts", "required": true, "description": "The facts of the case and what led to the order, as the BRIEF gives them; blank where not given."},
  {"id": "no_appeal", "name": "No Appeal Against the Order", "required": true, "description": "Why no appeal lies against the order, only as NO APPEAL NOTE gives it; blank where not given."},
  {"id": "heads", "name": "Ground of Revision", "required": true, "description": "The head or heads chosen in REVISION HEADS and, under each, the facts the BRIEF gives for it, as submissions. No head the BRIEF does not give."},
  {"id": "effect", "name": "Effect of the Order", "required": true, "description": "The effect of the order if allowed to stand, only as EFFECT NOTE gives it; blank where not given."},
  {"id": "dates", "name": "Dates", "required": true, "description": "The dates of the order, of the application for the certified copy, of its receipt and of filing, as dates only."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier revision, appeal, review or other proceeding on this order, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Call for the record of {lower_case_ref} from {lower_court};
b) Set aside, or modify, the order dated {order_or_decree_date} passed in {lower_case_ref}, under Section 115 of the Code of Civil Procedure, 1908, as set out in this petition;
c) Award the costs of this petition;
d) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the petitioner shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {petitioner}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above civil revision petition are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Revision petition (original + copy for each respondent)",
  "Certified copy of the order challenged",
  "Application for the certified copy, with the date of receipt, for the record of dates",
  "Copies of the pleadings and of the application on which the order was passed",
  "Index and list of documents",
  "Application for stay of the order or of proceedings, if sought (separate application)",
  "Application for condonation of delay, if the petition is late",
  "Vakalatnama",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)",
  "Confirm that no appeal lies against the order and that the High Court named is the High Court to which the subordinate court is subordinate (verify)",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay."
]
```

## promptInstructions

```json
[
  "Draft a civil revision petition to the High Court under Section 115 of the Code of Civil Procedure, 1908 against an order of a court subordinate to it. It is not an appeal, a writ petition or a review; do not draft those. The Court is the High Court; the BRIEF names which.",
  "Quote the terms of the order challenged exactly as the BRIEF gives them. Do not paraphrase, summarise or complete them. If not given, write [To be confirmed: the terms of the order challenged, as worded in the order].",
  "State why no appeal lies only as NO APPEAL NOTE gives it, as \"The petitioner states that ...\". Do not write that no appeal lies, or that revision is the only remedy, in your own words. Where not given, write [To be confirmed: why no appeal lies against the order].",
  "Plead only the head or heads chosen in REVISION HEADS, each with the facts the BRIEF gives for it, as submissions. Do not state the scope of the High Court's revisional power in your own words and do not quote Section 115; refer to the head by its label in the form. Do not add a head.",
  "State the effect of the order if allowed to stand only as EFFECT NOTE gives it, as a submission. Do not write that the order finally disposes of the suit, causes irreparable injury, or occasions a failure of justice unless EFFECT NOTE says so.",
  "Do not write that the subordinate court acted illegally, with material irregularity, or without jurisdiction in your own words; write only what the BRIEF's ground says, as a submission.",
  "Cite only Section 115. Do not cite a proviso, an explanation or any other provision; where one would normally be cited write [Section — verify before filing].",
  "Give the dates the BRIEF gives (of the order, decree or event, of the application for the certified copy, of receipt of the certified copy, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "State facts only as the BRIEF gives them. Where a fact the document needs is not given, write [To be confirmed: <what is missing>]. Do not add a cause, reason, motive or detail to a fact.",
  "State every earlier or other proceeding on this matter that the BRIEF mentions, with court, case reference, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier or other proceeding on this matter was filed or is pending, in which court, and with what result]. Never write that none is pending, that none was filed, or that this is the first application.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| petitioner_name | Petitioner name | text | yes | cause title, verification |
| petitioner_parentage / petitioner_age / petitioner_address | Petitioner particulars | text / number / textarea | yes | verification |
| petitioner_role_below | Petitioner was the | select (Plaintiff; Defendant; Other party — state) | yes | particulars clause |
| respondent_names / respondent_addresses | Respondents (name and address of each) | textarea | yes | cause title, service |
| court_designation / court_place / state | High Court and bench | text / text / select | yes | cause title |
| lower_court / lower_case_ref | Subordinate court and its case number and year | text | yes | cause title, prayer |
| order_text | Terms of the order challenged (as worded in the order) | textarea | yes | quoted verbatim |
| facts_of_case | Facts and what led to the order | textarea | yes | facts clause |
| no_appeal_note | Why no appeal lies against the order (as you state it) | textarea | no | no-appeal clause; averment unlock |
| revision_heads | Ground of revision | multi-select (Jurisdiction exercised that is not vested in the subordinate court; Jurisdiction vested in the subordinate court not exercised; Jurisdiction exercised illegally or with material irregularity) | yes | heads clause |
| heads_facts | Facts relied on for each head | textarea | yes | heads clause; averment unlock |
| effect_note | Effect of the order if allowed to stand (as you state it) | textarea | no | effect clause; averment unlock |
| order_or_decree_date | Date of the order, decree or event | date | no | limitation dates (listed only; no period is stated or computed) |
| certified_copy_applied_date | Date of application for the certified copy | date | no | limitation dates (listed only) |
| certified_copy_received_date | Date of receipt of the certified copy | date | no | limitation dates (listed only) |
| filing_date | Date of filing | date | no | limitation dates (listed only) |
| earlier_proceedings | Earlier and other proceedings on the same matter (cross-appeal, earlier appeal, review, other court; court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "civil_revision_s115",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "no_appeal_lies", "kind": "averment", "what": "No appeal lies, or revision is the only remedy", "phrases": ["no appeal lies against the impugned order", "the impugned order is not appealable", "the only remedy is revision", "the petitioner has no other remedy"], "unlocked_by": {"key": "no_appeal_note", "label": "Why no appeal lies against the order", "present": true}},
    {"id": "subordinate_court_erred", "kind": "submission", "what": "The subordinate court acted illegally, without jurisdiction or with material irregularity", "phrases": ["acted without jurisdiction", "acted illegally", "acted with material irregularity", "exercised a jurisdiction not vested in it", "failed to exercise a jurisdiction vested in it"], "unlocked_by": {"key": "heads_facts", "label": "Facts relied on for each head", "present": true}},
    {"id": "order_effect", "kind": "submission", "what": "The order finally disposes of the suit or causes irreparable injury", "phrases": ["will finally dispose of the suit", "will cause irreparable injury", "will occasion a failure of justice", "the order, if allowed to stand"], "unlocked_by": {"key": "effect_note", "label": "Effect of the order if allowed to stand", "present": true}},
    {"id": "revision_maintainable", "kind": "submission", "what": "The revision is maintainable", "phrases": ["this revision is maintainable", "this Hon'ble Court has jurisdiction in revision", "the revision lies to this Court"], "unlocked_by": null},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "no_appeal_lies", "kind": "averment", "averment": "the petitioner states that no appeal lies against the order, for the following reason: {{no_appeal_note}}", "requires": {"key": "no_appeal_note", "label": "Why no appeal lies against the order", "present": true}},
    {"id": "subordinate_court_erred", "kind": "submission", "averment": "it is submitted, on the head(s) of revision chosen, that {{heads_facts}}", "requires": {"key": "heads_facts", "label": "Facts relied on for each head", "present": true}},
    {"id": "order_effect", "kind": "submission", "averment": "it is submitted, as to the effect of the order, that {{effect_note}}", "requires": {"key": "effect_note", "label": "Effect of the order if allowed to stand", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The words of Section 115 as amended (understood: the High Court may call for the record of a case decided by a subordinate court in which no appeal lies, and may make such order as it thinks fit if the subordinate court appears (a) to have exercised a jurisdiction not vested in it by law, (b) to have failed to exercise a jurisdiction so vested, or (c) to have acted in the exercise of its jurisdiction illegally or with material irregularity). The `revision_heads` options paraphrase these; they are not quotations. Check wording and sub-section numbering.
- The proviso added by the Code of Civil Procedure (Amendment) Acts of 1999 and 2002 (understood: no variation or reversal of an order made in the course of a suit unless it would have finally disposed of the suit or the proceeding, or would occasion a failure of justice or cause irreparable injury) and the explanation on "case decided". Not quoted or cited; `effect_note` is the advocate's text.
- State amendments of Section 115 (understood: some States have their own). Not covered; `court_levels` carries only the High Court appellate civil side.
- The period of limitation for revision (understood: Limitation Act, 1963, Article 131 for certain revisions; or no specific article, so the residuary article). Not stated anywhere.
- Which High Court has jurisdiction (the High Court to which the subordinate court is subordinate). The BRIEF supplies it; the checklist cue is marked verify.
- Interaction with a writ under Article 227 of the Constitution. Not covered; a separate pack.

## Notes for Ajay

1. Risk. I did not quote Section 115 at all. The form's three head labels are neutral paraphrases; if you want the Act's words in the form, send them and they go in.
2. Risk. `no_appeal_lies` is the advocate's statement, unlocked by the form field. If left blank the petition carries a blank at the maintainability point, which is intended.
3. Tier A: two Anushka samples, full facts and `order_text` empty. Limitation block used as written.

## Review changes (v2, per Ajay's rulings)

- Checklist wording fixed. Section 115 heads and proviso are not quoted anywhere in signed fields; the three revision_heads options stay as Ajay-approved neutral paraphrases (ruling 6), exact wording in Verify.
- Clean on other checks.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: appeals, revision, review, execution. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | Limitation block mandatory. The three revision-head options are neutral paraphrases; the section's exact heads and proviso stay in Verify. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
