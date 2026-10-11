# T-239 b1 #43 consumer_appeal_s41 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink L = 2. Limitation block included (mandatory for #43). Pre-deposit amount is NOT stated anywhere; it is a checklist cue only. The proviso is not referred to in signed fields.

| Field | Value |
|---|---|
| id | `consumer_appeal_s41` |
| displayName | Appeal to the State Commission against an Order of the District Commission (Consumer Protection Act, 2019, section 41) |
| category | Consumer |
| court_levels | `["state_commission"]` |
| Ink | L = 2 |
| Anushka tier | A (appeal; limitation) — every sample twice: full facts, facts missing |
| averments file | `_averments/consumer_appeal_s41.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
  {
    "act": "Consumer Protection Act, 2019",
    "sections": [
      {"number": "41", "description": "Appeal against order of the District Commission"}
    ]
  }
]
```

## causeTitle

```json
{
  "format": "BEFORE THE {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{appellant} ... Appellant ({appellant_original_role})\nVERSUS\n{respondent} ... Respondent ({respondent_original_role})",
  "partyDesignations": [
    {"role": "appellant", "label": "Appellant"},
    {"role": "respondent", "label": "Respondent"}
  ],
  "caseNomenclature": "APPEAL No. _____ of [YEAR]\n(Against the order dated {order_date} passed by the {district_commission_name} in Consumer Complaint No. {complaint_number})\nAPPEAL UNDER SECTION 41 OF THE CONSUMER PROTECTION ACT, 2019"
}
```

## mandatoryClauses

```json
[
  {"id": "appellant_particulars", "name": "Parties", "required": true, "description": "The appellant and the respondent, their addresses, and their roles in the complaint below, as the brief gives them."},
  {"id": "impugned_order", "name": "The Impugned Order", "required": true, "description": "The District Commission, the consumer complaint number, the date of the order and its operative directions, as the brief gives them. The operative directions are quoted exactly as given; else the blank."},
  {"id": "case_below", "name": "The Case Below", "required": true, "description": "The complaint and the defence below, in the facts the brief gives. Nothing added."},
  {"id": "grounds_of_appeal", "name": "Grounds of Appeal", "required": true, "description": "The grounds the advocate gives, as submissions, numbered. No ground the brief does not give."},
  {"id": "dates", "name": "Dates", "required": true, "description": "The dates the brief gives: of the order, of the application for the certified copy, of receipt of the certified copy, and of filing. No period is stated or computed."},
  {"id": "pre_deposit", "name": "Pre-deposit", "required": true, "description": "Whether the pre-deposit required for this appeal has been made, only as the appellant states it, with the proof reference the form gives (no amount stated); else the blank."},
  {"id": "stay", "name": "Stay of the Impugned Order", "required": false, "description": "Whether a stay is sought, only as the brief gives it."},
  {"id": "jurisdiction", "name": "Jurisdiction", "required": true, "description": "The basis of this Commission's jurisdiction only as the advocate states it, as 'It is stated that ...'; else the blank."},
  {"id": "earlier_proceedings", "name": "Other Proceedings", "required": true, "description": "Every other appeal, revision, execution or other proceeding on the impugned order or the complaint, with forum, number, date and result as the brief gives them; or the blank where the brief is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Commission may graciously be pleased to:

a) Allow this appeal under section 41 of the Consumer Protection Act, 2019 and {appeal_relief_sought}, in respect of the order dated {order_date} passed by the {district_commission_name} in Consumer Complaint No. {complaint_number};
b) Pass any other order(s) as this Hon'ble Commission may deem fit and proper in the interest of justice.

And for this act of kindness, the appellant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above appeal are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Memorandum of appeal (original + copies for each respondent)",
  "Certified copy of the impugned order",
  "Copy of the consumer complaint, the written version and the evidence filed below, as relied on",
  "Pre-deposit required for the appeal: check the Act and the Commission's rules (verify)",
  "Proof of the pre-deposit, if made",
  "Application for stay of the impugned order, if sought (separate)",
  "Application for condonation of delay, if the appeal is late (separate; see limitation cue)",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay.",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft a memorandum of appeal to the State Commission against an order of the District Commission, under section 41 of the Consumer Protection Act, 2019. Cite only section 41 for the appeal. Do not cite a sub-section or a proviso. Call the bodies 'the District Commission' and 'the State Commission'. This is not a complaint, a revision or an execution application.",
  "State the impugned order's Commission, complaint number, date and operative directions only as the BRIEF gives them. Quote the operative directions exactly; do not paraphrase, summarise or renumber them. Where not given, write [To be confirmed: the operative directions of the impugned order].",
  "State the case below (the complaint and the defence) only in the facts the BRIEF gives. Do not add a fact, an allegation or a finding the BRIEF does not give. Do not say what the District Commission wrongly held except as the BRIEF gives it.",
  "Write the grounds of appeal as numbered submissions ('It is submitted that ...') on the grounds the BRIEF gives and no others. Do not write that the impugned order is perverse, illegal, arbitrary or against the weight of evidence unless the BRIEF gives that ground. Do not name any case.",
  "Give the dates the BRIEF gives (of the order, decree or event, of the application for the certified copy, of receipt of the certified copy, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "Pre-deposit. Do not state any amount of pre-deposit. Write that the pre-deposit required for this appeal has been made only where the form records the appellant's statement to that effect, with the proof reference the form gives; otherwise [To be confirmed: whether the pre-deposit required for this appeal has been made, and the proof reference]. Do not write that the appeal is maintainable.",
  "Do not assert jurisdiction. Where the BRIEF gives the basis, write 'It is stated that this Commission has jurisdiction on the basis that ...' in the BRIEF's words; otherwise [To be confirmed: the basis of the Commission's jurisdiction]. Do not cite a section for it.",
  "State every other appeal, revision, execution or proceeding on the impugned order or the complaint that the BRIEF mentions, with forum, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any other appeal, revision, execution or proceeding on this order or complaint exists, and where]. Never write that this is the first appeal or that none is pending.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| appellant_name / appellant_parentage / appellant_age / appellant_address | Appellant particulars | text / text / number / textarea | yes | verification |
| appellant_original_role / respondent_original_role | Role below (Complainant / Opposite Party) | select | yes | cause title |
| respondent_name / respondent_address | Respondent particulars | text / textarea | yes | cause title |
| district_commission_name / complaint_number | District Commission and consumer complaint number | text / text | yes | nomenclature, prayer |
| impugned_order_directions | Operative directions of the impugned order (as worded in the order) | textarea | yes | quoted verbatim |
| case_below_summary | The case below (complaint and defence), as the advocate gives it | textarea | yes | case clause |
| grounds_of_appeal | Grounds of appeal (as the advocate gives them) | textarea | yes | submission unlock |
| appeal_relief_sought | Relief sought in appeal (e.g. set aside the order; modify it as stated) | textarea | yes | prayer |
| order_date | Date of the order, decree or event | date | no | limitation block |
| certified_copy_applied_date | Date of application for the certified copy | date | no | limitation block |
| certified_copy_received_date | Date of receipt of the certified copy | date | no | limitation block |
| filing_date | Date of filing | date | no | limitation block |
| pre_deposit_status | Pre-deposit required for the appeal | select (Pre-deposit made, as stated by the appellant; Not yet made; Not stated) | yes | averment unlock |
| pre_deposit_proof | Proof reference of the pre-deposit (receipt / challan number and date; no amount) | text | no | pre-deposit clause |
| stay_sought | Stay of the impugned order | select (Sought; Not sought) | no | stay clause |
| jurisdiction_basis | Basis of the Commission's jurisdiction (as the advocate states it) | textarea | no | averment unlock |
| earlier_proceedings | Other appeals, revisions, execution or proceedings on the order or complaint (forum, number, date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "consumer_appeal_s41",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "order_erroneous", "kind": "submission", "what": "The impugned order is erroneous", "phrases": ["the impugned order is perverse", "is bad in law", "is illegal and arbitrary", "is against the weight of evidence", "aadesh truti poorn hai"], "unlocked_by": {"key": "grounds_of_appeal", "label": "Grounds of appeal (as the advocate gives them)", "present": true}},
    {"id": "pre_deposit_made", "kind": "averment", "what": "The pre-deposit has been made", "phrases": ["the pre-deposit has been made", "has deposited the amount as required", "the statutory deposit has been complied with", "purv jama kar diya gaya hai"], "unlocked_by": {"key": "pre_deposit_status", "label": "Pre-deposit required for the appeal", "equals": ["pre-deposit made, as stated by the appellant"]}},
    {"id": "appeal_maintainable", "kind": "submission", "what": "The appeal is maintainable", "phrases": ["the appeal is maintainable", "this appeal lies to this commission", "the appeal is properly instituted"], "unlocked_by": null},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "court_has_jurisdiction", "kind": "submission", "what": "The Commission has jurisdiction", "phrases": ["this commission has jurisdiction", "this hon'ble commission has jurisdiction", "the commission has jurisdiction to entertain", "is within the jurisdiction of this commission", "adalat ka kshetradhikar hai"], "unlocked_by": {"key": "jurisdiction_basis", "label": "Basis of the Commission's jurisdiction (as the advocate states it)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Other proceedings on the impugned order", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "order_erroneous", "kind": "submission", "averment": "it is submitted, on the grounds the appellant gives, that {{grounds_of_appeal}}", "requires": {"key": "grounds_of_appeal", "label": "Grounds of appeal (as the advocate gives them)", "present": true}},
    {"id": "pre_deposit_made", "kind": "averment", "averment": "the appellant states that the pre-deposit required for this appeal has been made, proof reference {{pre_deposit_proof}}", "requires": {"key": "pre_deposit_status", "label": "Pre-deposit required for the appeal", "equals": ["pre-deposit made, as stated by the appellant"]}},
    {"id": "court_has_jurisdiction", "kind": "submission", "averment": "it is stated that this Commission has jurisdiction on the basis that {{jurisdiction_basis}}", "requires": {"key": "jurisdiction_basis", "label": "Basis of the Commission's jurisdiction (as the advocate states it)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Other proceedings on the impugned order", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The proviso to section 41 (kept out of every signed field): the amount (a share of the amount ordered, with a ceiling) and when it must be deposited. Not stated and not cited as a sub-section; checklist cue only, as asked.
- The period of limitation for the appeal and the Commission's power to condone delay (section 41 itself). Not stated; limitation block applied as instructed.
- Whether section 41 reaches every order of the District Commission (including interim orders) or only final orders. Not stated.
- Whether the State Commission's rules prescribe the form of the memorandum and the number of copies. Checklist cue.
- The naming of the Commission in a cause title ('State Consumer Disputes Redressal Commission'). The form takes the designation as text.
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. Risk. The pre-deposit is the commonest ground of dismissal and is not stated by Lawie. The Drafter only records the appellant's statement and the proof reference; with the form empty it writes a blank.
2. Risk. The limitation block's dates are optional fields; an appeal filed late gets the condonation blank only when the BRIEF says the filing is late.
3. The prayer line takes appeal_relief_sought from the form; the Drafter does not choose between setting aside and modifying.
4. Tier A: two Anushka samples: full facts, and impugned_order_directions and pre_deposit_status empty.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Consumer. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | Section 41 of the Consumer Protection Act, 2019. The pre-deposit is a checklist cue only ("pre-deposit required for the appeal"); no amount. Limitation block mandatory. Jurisdiction wording says "this Commission". |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
