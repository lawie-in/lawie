# T-239 b1 #29 civil_first_appeal_s96 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. Tier A: limitation at stake.

| Field | Value |
|---|---|
| id | `civil_first_appeal_s96` |
| displayName | Memorandum of First Appeal (CPC Section 96 and Order XLI) |
| category | Civil: appeals, revision, review, execution |
| court_levels | `["district_judge", "high_court_appellate_civil_side"]` |
| Ink | L = 2 |
| Anushka tier | A |
| averments file | `_averments/civil_first_appeal_s96.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "96",
        "description": "Appeal from original decree"
      },
      {
        "number": "Order XLI",
        "description": "Appeals from original decrees"
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
  "caseNomenclature": "FIRST APPEAL No. _____ of [YEAR]\n(Under Section 96 read with Order XLI of the Code of Civil Procedure, 1908)\n(Against the {impugned_description} dated {order_or_decree_date} passed by {lower_court} in {lower_case_ref})"
}
```

## mandatoryClauses

```json
[
  {"id": "parties", "name": "Parties", "required": true, "description": "Appellant and respondents, with their positions in the court below, as the BRIEF gives them."},
  {"id": "impugned_decree", "name": "The Judgment and Decree Appealed From", "required": true, "description": "The court, the suit number, the date of the judgment and of the decree, and what the decree orders, exactly as the BRIEF gives them; blank where not given."},
  {"id": "facts", "name": "Brief Facts", "required": true, "description": "The facts of the case and the course of the proceedings below, as the BRIEF gives them; blank where not given. No fact, finding or evidence the BRIEF does not give."},
  {"id": "dates", "name": "Dates", "required": true, "description": "The dates of the judgment and decree, of the application for the certified copy, of its receipt and of filing, as the BRIEF gives them, as dates only."},
  {"id": "grounds", "name": "Grounds of Appeal", "required": true, "description": "The grounds the BRIEF gives, each under its own number and head in the BRIEF's words, as submissions; no ground the BRIEF does not give."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every cross-appeal, earlier appeal, review or other proceeding on this decree, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Admit this appeal and call for the record of {lower_case_ref} from {lower_court};
b) Set aside the judgment and decree dated {order_or_decree_date} passed in {lower_case_ref}, and grant the relief set out in this appeal;
c) Award the costs of this appeal and of the court below;
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
  "Certified copy of the judgment and of the decree appealed from",
  "Application for the certified copies, with the date of receipt, for the record of dates",
  "Index and list of documents",
  "Copies of the pleadings and of the documents relied on, as the court requires",
  "Application for stay of the decree, if sought (separate application)",
  "Application for condonation of delay, if the appeal is late",
  "Vakalatnama",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay."
]
```

## promptInstructions

```json
[
  "Draft a memorandum of first appeal against the judgment and decree of a court below under Section 96 read with Order XLI of the Code of Civil Procedure, 1908. It is not a second appeal, an appeal from an order, a revision, or an application for stay; do not draft those.",
  "Give the impugned judgment and decree exactly as the BRIEF gives them: court, case number, dates, and the relief decreed or refused. Where not given write [To be confirmed: court, case number and date of the judgment and decree appealed from].",
  "State the facts and the course of the proceedings only as the BRIEF gives them. Do not state a finding of the court below, an issue, or the evidence led, unless the BRIEF gives it. Do not summarise the judgment beyond the BRIEF.",
  "Write the grounds of appeal only from GROUNDS OF APPEAL as the BRIEF gives them, each under its own number and in the BRIEF's words, as submissions (\"It is submitted that ...\"). Do not add a ground. Do not write that the judgment is perverse, illegal, arbitrary, contrary to the evidence or suffers from a manifest error unless the BRIEF's own ground says so; then write only that ground.",
  "Do not write that the appeal is maintainable, that this Court has jurisdiction to hear it, or that the appeal lies to this Court. Do not state a valuation. Do not state that interim relief should be granted; that is a separate application.",
  "Cite only Section 96 and Order XLI as a whole. Do not cite a rule of Order XLI or any other provision; where a rule would normally be cited write [Rule — verify before filing].",
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
| impugned_description | Impugned decree described as | text | yes | cause title (e.g. judgment and decree) |
| decree_relief | What the decree orders (as worded in the decree) | textarea | yes | decree clause, quoted verbatim |
| judgment_date | Date of the judgment | date | yes | decree clause |
| facts_of_case | Facts and course of the proceedings below | textarea | yes | facts clause |
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
  "pack": "civil_first_appeal_s96",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "appeal_maintainable", "kind": "submission", "what": "The appeal is maintainable or lies to this Court", "phrases": ["the appeal is maintainable", "this Hon'ble Court has jurisdiction to hear this appeal", "the appeal lies to this Court"], "unlocked_by": null},
    {"id": "judgment_erroneous", "kind": "submission", "what": "The judgment is perverse, illegal or contrary to the evidence", "phrases": ["the impugned judgment is perverse", "the impugned judgment is illegal and arbitrary", "contrary to the evidence on record", "suffers from manifest error", "the trial court failed to appreciate the evidence"], "unlocked_by": {"key": "grounds_of_appeal", "label": "Grounds of appeal", "present": true}},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "judgment_erroneous", "kind": "submission", "averment": "it is submitted that the judgment and decree are open to challenge on the following grounds: {{grounds_of_appeal}}", "requires": {"key": "grounds_of_appeal", "label": "Grounds of appeal", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The contents of the memorandum under Order XLI (understood: Rule 1, grounds of objection set forth concisely, under distinct heads, numbered consecutively; copy of the judgment and decree to accompany it). Rule numbers are not cited; the grounds clause follows that shape only as a drafting form.
- The period of limitation for a first appeal and the point it runs from, and the exclusion of time for obtaining copies (understood: Limitation Act, 1963, Articles 116 and 117, and Section 12; ninety and thirty days). Not stated.
- Which court hears the appeal by value or by State rule (District Court or High Court). Not stated; `appellate_forum` is the advocate's choice.
- Stay of execution of the decree and security (Order XLI, Rule 5 area; understood). Separate application; not drafted.
- The requirement to deposit or secure the decretal amount in some State rules or special Acts. Not covered.
- Whether an appeal against an ex parte decree has its own rules. Not covered.

## Notes for Ajay

1. Risk. The grounds clause is where an AI Drafter embroiders most. The pack allows grounds only from the advocate's own numbered text and bans the usual adjectives unless they are in the advocate's ground.
2. Risk. Appeal-forum and valuation rules vary by State; the pack states none.
3. Tier A: two Anushka samples, full facts and `grounds_of_appeal` thin, to check no ground is invented. Limitation block used as written.

## Review changes (v2, per Ajay's rulings)

- Checklist: removed the paraphrase of what Order XLI requires; fixed 'Certified copy of the application' to 'Application for the certified copies'.
- Clean on other checks.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: appeals, revision, review, execution. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | Limitation block mandatory. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
