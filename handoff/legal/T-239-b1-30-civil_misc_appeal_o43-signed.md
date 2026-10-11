# T-239 b1 #30 civil_misc_appeal_o43 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. Tier A: limitation at stake. Which orders are appealable is for the advocate; no list is reproduced.

| Field | Value |
|---|---|
| id | `civil_misc_appeal_o43` |
| displayName | Appeal from an Order (CPC Section 104 and Order XLIII Rule 1) |
| category | Civil: appeals, revision, review, execution |
| court_levels | `["district_judge", "high_court_appellate_civil_side"]` |
| Ink | L = 2 |
| Anushka tier | A |
| averments file | `_averments/civil_misc_appeal_o43.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "104",
        "description": "Orders from which appeal lies"
      },
      {
        "number": "Order XLIII Rule 1",
        "description": "Appeals from orders"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{appellant} ... Appellant\nVERSUS\n{respondent} ... Respondent",
  "partyDesignations": [
    {
      "role": "appellant",
      "label": "Appellant"
    },
    {
      "role": "respondent",
      "label": "Respondent"
    }
  ],
  "caseNomenclature": "MISCELLANEOUS APPEAL No. _____ of [YEAR]\n(Under Section 104 read with Order XLIII Rule 1 of the Code of Civil Procedure, 1908)\n(Against the {impugned_description} dated {order_or_decree_date} passed by {lower_court} in {lower_case_ref})"
}
```

## mandatoryClauses

```json
[
  {"id": "parties", "name": "Parties", "required": true, "description": "Appellant and respondents, with their positions in the court below, as the BRIEF gives them."},
  {"id": "impugned_order", "name": "The Order Appealed From", "required": true, "description": "The court, the case number, the date of the order and its terms, quoted exactly as the BRIEF gives them; blank where not given. Never paraphrased."},
  {"id": "provision", "name": "Provision Under Which the Appeal Lies", "required": true, "description": "The provision under which the appeal lies, only as APPEAL PROVISION gives it; blank where not given. No list of appealable orders."},
  {"id": "facts", "name": "Brief Facts", "required": true, "description": "The facts of the case and what led to the order, as the BRIEF gives them; blank where not given."},
  {"id": "dates", "name": "Dates", "required": true, "description": "The dates of the order, of the application for the certified copy, of its receipt and of filing, as dates only."},
  {"id": "grounds", "name": "Grounds of Appeal", "required": true, "description": "The grounds the BRIEF gives, each under its own number in the BRIEF's words, as submissions; no ground the BRIEF does not give."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier appeal, review, revision or other proceeding on this order, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Admit this appeal and call for the record of {lower_case_ref} from {lower_court};
b) Set aside the order dated {order_or_decree_date} passed in {lower_case_ref}, and grant the relief set out in this appeal;
c) Award the costs of this appeal;
d) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the appellant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {appellant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above memorandum of appeal are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Memorandum of appeal (original + copy for each respondent)",
  "Certified copy of the order appealed from",
  "Application for the certified copy, with the date of receipt, for the record of dates",
  "Index and list of documents",
  "Copies of the pleadings and of the application on which the order was passed, as the court requires",
  "Application for stay of the order, if sought (separate application)",
  "Application for condonation of delay, if the appeal is late",
  "Vakalatnama",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)",
  "Confirm the provision under which this order is appealable (for the advocate: verify)",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay."
]
```

## promptInstructions

```json
[
  "Draft a memorandum of appeal from an order under Section 104 read with Order XLIII Rule 1 of the Code of Civil Procedure, 1908. It is not an appeal from a decree, a revision, or an application for stay; do not draft those.",
  "Quote the terms of the order appealed from exactly as the BRIEF gives them. Do not paraphrase, summarise or complete them. If not given, write [To be confirmed: the terms of the order appealed from, as worded in the order].",
  "State the provision under which the appeal lies only as APPEAL PROVISION gives it, as \"The appellant states that this appeal is brought under ...\". Do not choose, list or describe the appealable orders yourself. Where not given, write [To be confirmed: the clause of Order XLIII Rule 1, or the other provision, under which the appeal lies]. Do not write that the order is appealable or that the appeal is maintainable in your own words.",
  "State the facts and what led to the order only as the BRIEF gives them. Do not state a finding or reasoning of the court below unless the BRIEF gives it.",
  "Write the grounds only from GROUNDS OF APPEAL as the BRIEF gives them, each under its own number, as submissions. Do not add a ground. Do not write that the order is perverse, illegal, arbitrary or contrary to the record unless the BRIEF's own ground says so; then write only that ground. Do not ask for interim relief in the body.",
  "Cite only Section 104 and Order XLIII Rule 1 as given in relevantActs. Do not cite any other rule; where one would normally be cited write [Rule — verify before filing].",
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
| appellant_name | Appellant name | text | yes | cause title, verification |
| appellant_parentage / appellant_age / appellant_address | Appellant particulars | text / number / textarea | yes | verification |
| appellant_role_below | Appellant was the | select (Plaintiff; Defendant; Other party — state) | yes | particulars clause |
| respondent_names / respondent_addresses | Respondents (name and address of each) | textarea | yes | cause title, service |
| court_designation / court_place / state | Appellate court | text / text / select | yes | cause title |
| lower_court / lower_case_ref | Court below and its case number and year | text | yes | cause title |
| appellate_forum | Appeal is filed in | select (District Court; High Court) | yes | court levels, cause title |
| impugned_description | Impugned order described as | text | yes | cause title (e.g. order) |
| order_text | Terms of the order (as worded in the order) | textarea | yes | quoted verbatim |
| appeal_provision | Provision under which the appeal lies (as you state it) | text | no | provision clause; averment unlock |
| facts_of_case | Facts and what led to the order | textarea | yes | facts clause |
| grounds_of_appeal | Grounds of appeal (numbered, as you want them) | textarea | yes | grounds clause; averment unlock |
| order_or_decree_date | Date of the order, decree or event | date | no | limitation dates (listed only; no period is stated or computed) |
| certified_copy_applied_date | Date of application for the certified copy | date | no | limitation dates (listed only) |
| certified_copy_received_date | Date of receipt of the certified copy | date | no | limitation dates (listed only) |
| filing_date | Date of filing | date | no | limitation dates (listed only) |
| earlier_proceedings | Earlier and other proceedings on the same matter (cross-appeal, earlier appeal, review, other court; court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "civil_misc_appeal_o43",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "order_appealable", "kind": "submission", "what": "The order is appealable or the appeal is maintainable", "phrases": ["the order is appealable", "the appeal is maintainable", "the appeal lies under", "this Hon'ble Court has jurisdiction to hear this appeal"], "unlocked_by": {"key": "appeal_provision", "label": "Provision under which the appeal lies", "present": true}},
    {"id": "order_erroneous", "kind": "submission", "what": "The order is perverse, illegal or contrary to the record", "phrases": ["the impugned order is perverse", "the impugned order is illegal and arbitrary", "contrary to the record", "suffers from manifest error", "non-application of mind"], "unlocked_by": {"key": "grounds_of_appeal", "label": "Grounds of appeal", "present": true}},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "order_appealable", "kind": "submission", "averment": "the appellant states that this appeal is brought under {{appeal_provision}}", "requires": {"key": "appeal_provision", "label": "Provision under which the appeal lies", "present": true}},
    {"id": "order_erroneous", "kind": "submission", "averment": "it is submitted that the order is open to challenge on the following grounds: {{grounds_of_appeal}}", "requires": {"key": "grounds_of_appeal", "label": "Grounds of appeal", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The list of orders in Order XLIII Rule 1 and the orders appealable under Section 104 (and the bar on other appeals from orders). Not reproduced; `appeal_provision` is the advocate's text.
- Whether Order XLI applies to appeals from orders (understood: Order XLIII Rule 2). Not cited.
- Period of limitation for an appeal from an order and the exclusion of time for copies (understood: Limitation Act, 1963, Article 116 for the High Court and 117 for other courts; Section 12). Not stated.
- Stay of the order while the appeal is pending. Separate application; not drafted.
- Whether an order refusing or granting an interim injunction, rejecting a plaint, or setting aside an ex parte decree has its own wording in Order XLIII. Not stated.

## Notes for Ajay

1. Risk. The most common failure here is picking the wrong clause of Order XLIII Rule 1. The pack puts it entirely in the advocate's hands and writes a blank otherwise.
2. Risk. Cause-title heading ("Miscellaneous Appeal") varies by State (First Appeal from Order in some High Courts). Text is mine; the lead may change it.
3. Tier A: two Anushka samples, full facts and `order_text` empty. Limitation block used as written.

## Review changes (v2, per Ajay's rulings)

- Checklist wording fixed ('Certified copy of the application' to 'Application for the certified copy').
- Clean on other checks.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: appeals, revision, review, execution. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | Limitation block mandatory. Which orders are appealable is for the advocate; no list is reproduced. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
