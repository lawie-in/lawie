# T-239 b1 #25 application_o26_r9 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. 

| Field | Value |
|---|---|
| id | `application_o26_r9` |
| displayName | Application for Appointment of Local Commissioner (CPC Order XXVI Rule 9) |
| category | Civil: defence and interlocutory |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side"]` |
| Ink | S = 1 |
| Anushka tier | B |
| averments file | `_averments/application_o26_r9.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "Order XXVI Rule 9",
        "description": "Commissions to make local investigations"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant ({applicant_role_in_suit})\nVERSUS\n{opposite_party} ... Opposite Party ({opposite_role_in_suit})",
  "partyDesignations": [
    {
      "role": "applicant",
      "label": "Applicant"
    },
    {
      "role": "opposite_party",
      "label": "Opposite Party"
    }
  ],
  "caseNomenclature": "CIVIL MISC. APPLICATION No. _____ of [YEAR]\n(In {suit_ref})\nAPPLICATION UNDER ORDER XXVI RULE 9 OF THE CODE OF CIVIL PROCEDURE, 1908 FOR APPOINTMENT OF A LOCAL COMMISSIONER"
}
```

## mandatoryClauses

```json
[
  {"id": "parties_and_suit", "name": "Parties and Suit", "required": true, "description": "The suit or proceeding (number, court, parties and the applicant's position in it) and the applicant's particulars, as the BRIEF gives them; blank where not given."},
  {"id": "property_or_matter", "name": "The Property or Matter to be Investigated", "required": true, "description": "The property or matter the commissioner is to inspect, and the matter in dispute it relates to, exactly as the BRIEF gives them; blank where not given."},
  {"id": "purpose", "name": "Purpose of the Investigation", "required": true, "description": "The purpose chosen in PURPOSE, with the points on which the commissioner is to report, as the BRIEF gives them."},
  {"id": "reasons", "name": "Why a Local Investigation is Sought", "required": true, "description": "The reasons the BRIEF gives, as submissions; no reason the BRIEF does not give."},
  {"id": "proposed_commissioner", "name": "Proposed Commissioner", "required": true, "description": "The person proposed, only if the BRIEF names one; otherwise \"as the Court may appoint\"."},
  {"id": "expenses", "name": "Expenses", "required": true, "description": "An undertaking by the applicant for the future to pay the commissioner's remuneration and expenses as the Court directs, only where EXPENSES = Yes; otherwise the blank [To be confirmed: whether the applicant will bear the commissioner's remuneration and expenses]."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier application or other proceeding on the same point in this matter, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Appoint a Local Commissioner under Order XXVI Rule 9 of the Code of Civil Procedure, 1908 to visit and inspect {property_short} and to report on the points set out in this application;
b) Direct the Local Commissioner to file the report within the time fixed by this Hon'ble Court, after notice to the parties;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Application (original + copy for the opposite party)",
  "Site plan, map or description of the property, if any",
  "Photographs or other documents showing the condition to be investigated, if relied on",
  "Plaint and written statement, or the pleadings that show the matter in dispute",
  "Affidavit of the applicant, if the court requires one",
  "Copy to the opposite party / notice as per court practice",
  "Vakalatnama (if not already on record)",
  "Commissioner's fee and process: as the court directs (not computed by Lawie)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application in a pending suit asking the Court to appoint a Local Commissioner to make a local investigation under Order XXVI Rule 9 of the Code of Civil Procedure, 1908. It is not an application for a commission to examine a witness, to take accounts or to partition property.",
  "State the property or matter and the points to be investigated exactly as the BRIEF gives them. Where not given write [To be confirmed: the property or matter to be inspected and the points on which the commissioner is to report].",
  "State the purpose only as chosen in PURPOSE. Do not say that the investigation is necessary, requisite or the only way to decide the dispute, unless the BRIEF gives that as a reason; then write it as a submission on that reason only.",
  "Do not say that the commissioner is to collect evidence for the applicant, to decide any question, or to make a finding. Ask only that the commissioner inspect and report on the points given.",
  "Name a commissioner only if the BRIEF names one. Give the expenses undertaking only as in clause expenses, as an undertaking for the future by the applicant, never as the advocate's undertaking and never with an amount.",
  "State facts only as the BRIEF gives them. Where a fact the document needs is not given, write [To be confirmed: <what is missing>]. Do not add a cause, reason, motive or detail to a fact.",
  "Cite only the provisions listed in relevantActs, at the level given there. Do not add a rule, sub-section or clause number. Where a provision would normally be cited and relevantActs does not give it, write [Section — verify before filing].",
  "State every earlier or other proceeding on this matter that the BRIEF mentions, with court, case reference, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier or other proceeding on this matter was filed or is pending, in which court, and with what result]. Never write that none is pending, that none was filed, or that this is the first application.",
  "Write reasons and grounds as submissions (\"It is submitted that ...\"), and only the reasons the BRIEF gives.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| applicant_name | Applicant name | text | yes | cause title, verification |
| applicant_parentage / applicant_age / applicant_address | Applicant particulars | text / number / textarea | yes | verification |
| applicant_role_in_suit | Applicant is the | select (Plaintiff; Defendant; Other party — state) | yes | cause title |
| opposite_party_name / opposite_role_in_suit | Opposite party and position in the suit | text / select | yes | cause title |
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| suit_ref | Suit or proceeding number and year | text | yes | nomenclature |
| stage_of_suit | Present stage of the suit (as you state it) | text | no | particulars clause |
| property_short | Property or matter (short description for the prayer) | text | yes | prayer |
| property_description | Property or matter (full description, boundaries, location) | textarea | yes | property clause |
| purpose | Purpose of the investigation | select (Elucidating a matter in dispute; Ascertaining the market value of property; Ascertaining mesne profits, damages or annual net profits; Other — state) | yes | purpose clause |
| points_to_report | Points on which the commissioner is to report | textarea | yes | purpose clause |
| why_needed | Why a local investigation is sought | textarea | yes | reasons clause; averment unlock |
| proposed_commissioner | Proposed commissioner (name and enrolment), if any | text | no | commissioner clause |
| bear_expenses | Will the applicant bear the commissioner's remuneration and expenses? | select (Yes; No; Not stated) | yes | expenses clause |
| earlier_proceedings | Earlier and other proceedings on the same point (court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "application_o26_r9",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "investigation_necessary", "kind": "submission", "what": "A local investigation is requisite or necessary", "phrases": ["a local investigation is necessary", "the dispute cannot be resolved without a local inspection", "a local investigation is requisite", "it is just and proper to appoint a commissioner"], "unlocked_by": {"key": "why_needed", "label": "Why a local investigation is sought", "present": true}},
    {"id": "commission_collects_evidence", "kind": "averment", "what": "The commissioner is to collect evidence or make a finding", "phrases": ["to collect evidence for the applicant", "to fill gaps in the applicant's evidence", "to decide the dispute on the spot"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "investigation_necessary", "kind": "submission", "averment": "it is submitted that a local investigation is sought for the following reason: {{why_needed}}", "requires": {"key": "why_needed", "label": "Why a local investigation is sought", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The statutory words of Order XXVI Rule 9 for the purposes of a local investigation (understood: elucidating any matter in dispute; ascertaining the market value of any property; ascertaining the amount of any mesne profits, damages or annual net profits). The `purpose` options paraphrase them; check against the bare Act.
- CPC s.75 (power to issue commissions; understood clause (b) for local investigation) was in the draft relevantActs; removed from signed fields (outside the approved set), to be checked against the bare Act.
- Rules on the commissioner's report and fees (Order XXVI Rules 10 and 17-18 area). Not cited.
- The principle that a commission is not to collect evidence. Stated as a drafting caution only; no authority named.

## Notes for Ajay

1. Risk. The undertaking on expenses is limited to the case where the advocate answers Yes; otherwise a blank. I did not draft any deposit amount.
2. Risk. `property_short` feeds the prayer so the system-built prayer does not paraphrase a long description.
3. Tier B. One Anushka sample with `points_to_report` thin, to check the Drafter does not widen the commissioner's task.

## Review changes (v2, per Ajay's rulings)

- relevantActs: CPC s.75 dropped (outside the approved set), moved to Verify.
- Clean on other checks.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: defence and interlocutory. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier B |
| Ruling | CPC section 75 stays out of the signed fields (Verify). |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
