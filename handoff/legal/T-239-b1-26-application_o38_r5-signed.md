# T-239 b1 #26 application_o38_r5 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. 

| Field | Value |
|---|---|
| id | `application_o38_r5` |
| displayName | Application for Attachment Before Judgment (CPC Order XXXVIII Rule 5) |
| category | Civil: defence and interlocutory |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side"]` |
| Ink | S = 1 |
| Anushka tier | B |
| averments file | `_averments/application_o38_r5.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "Order XXXVIII Rule 5",
        "description": "Attachment before judgment"
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
  "caseNomenclature": "CIVIL MISC. APPLICATION No. _____ of [YEAR]\n(In {suit_ref})\nAPPLICATION UNDER ORDER XXXVIII RULE 5 OF THE CODE OF CIVIL PROCEDURE, 1908 FOR ATTACHMENT BEFORE JUDGMENT"
}
```

## mandatoryClauses

```json
[
  {"id": "parties_and_suit", "name": "Parties and Suit", "required": true, "description": "The suit or proceeding (number, court, parties and the applicant's position in it) and the applicant's particulars, as the BRIEF gives them; blank where not given."},
  {"id": "claim", "name": "The Claim in the Suit", "required": true, "description": "The relief the plaintiff claims in the suit and the amount, exactly as the BRIEF gives them; blank where not given."},
  {"id": "property", "name": "Property Sought to be Attached", "required": true, "description": "The property by description, location and the BRIEF's stated value if any, exactly as the BRIEF gives them; blank where not given. No value is worked out."},
  {"id": "defendant_conduct", "name": "The Defendant's Dealing with the Property", "required": true, "description": "What the defendant has done or is said to be about to do with the property, only as the BRIEF gives it, in the BRIEF's words; blank where not given."},
  {"id": "intent_statement", "name": "Applicant's Statement About Intention", "required": true, "description": "Only the applicant's own stated words about the defendant's intention, exactly as the BRIEF gives them, written as a submission (\"It is submitted, on the applicant's own statement, that ...\"). If the BRIEF gives none, the blank [To be confirmed: the facts relied on for the defendant's intention]. Never the Drafter's own assertion, and never as a fact."},
  {"id": "security", "name": "Security Sought", "required": false, "description": "The security the applicant asks the Court to require, only as SECURITY SOUGHT gives it; blank where not given."},
  {"id": "undertakings", "name": "Undertaking", "required": false, "description": "Only an undertaking that the BRIEF gives, written as a future undertaking by the applicant. If the BRIEF gives none, the blank [To be confirmed: whether any undertaking is offered]."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier application or other proceeding on the same point in this matter, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Direct the defendant, under Order XXXVIII Rule 5 of the Code of Civil Procedure, 1908, to furnish security or to show cause why the defendant should not furnish security, as set out in this application;
b) Failing compliance, attach before judgment the property described in this application;
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
  "Application (original + copy for the defendant)",
  "Affidavit of the applicant in support, if the court requires one",
  "Schedule of the property sought to be attached (description, location, title particulars if known)",
  "Documents showing the defendant's dealing with the property, if any",
  "Copy of the plaint",
  "Copy to the defendant / notice as per court practice",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application in a pending money or similar suit for attachment of the defendant's property before judgment under Order XXXVIII Rule 5 of the Code of Civil Procedure, 1908. It is not an application for arrest before judgment, for a temporary injunction or for appointment of a receiver.",
  "State the claim in the suit and the property sought to be attached exactly as the BRIEF gives them. Do not state a value, or work out one. Where not given write [To be confirmed: description and location of the property sought to be attached].",
  "State what the defendant has done or is said to be about to do with the property only as the BRIEF gives it. Do not write that the defendant is about to dispose of the property or to remove it from the jurisdiction unless the BRIEF gives that as a fact.",
  "The Drafter never asserts the defendant's intent to obstruct or delay the execution of a decree, to defeat the plaintiff, or to defraud. Where the BRIEF gives the applicant's own statement about the defendant's intention, write it only as a submission in the applicant's own words as the BRIEF gives them (\"It is submitted, on the applicant's own statement, that ...\") and add no inference, label or paraphrase. Where the BRIEF gives none, write [To be confirmed: the facts relied on for the defendant's intention].",
  "Do not write that the plaintiff has a good or strong case, is bound to succeed, or that the defendant has no other property. Do not add any undertaking (to compensate, to pay damages, to furnish security) that the BRIEF does not give. An undertaking the BRIEF gives is written as an undertaking by the applicant for the future, never as the advocate's undertaking.",
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
| claim_in_suit | Relief and amount claimed in the suit | textarea | yes | claim clause |
| property_to_attach | Property sought to be attached (description, location) | textarea | yes | property clause |
| property_value_stated | Value of the property as you state it | text | no | property clause (not computed by Lawie) |
| defendant_conduct | What the defendant has done or is said to be about to do with the property | textarea | no | conduct clause; averment unlock |
| intent_statement | Your statement about the defendant's intention, with the facts for it | textarea | no | intention clause; averment unlock |
| security_sought | Security the applicant asks the Court to require (as you state it) | text | no | security clause |
| undertaking_offered | Undertaking offered by the applicant, if any | textarea | no | undertaking clause; averment unlock |
| earlier_proceedings | Earlier and other proceedings on the same point (court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "application_o38_r5",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "defendant_dealing", "kind": "averment", "what": "The defendant is about to dispose of or remove the property", "phrases": ["the defendant is about to dispose of", "the defendant is about to remove the property from the jurisdiction", "the defendant is selling off his assets", "the defendant has been alienating"], "unlocked_by": {"key": "defendant_conduct", "label": "What the defendant has done or is said to be about to do", "present": true}},
    {"id": "intent_to_obstruct", "kind": "submission", "what": "The defendant intends to obstruct or delay execution", "phrases": ["with intent to obstruct or delay the execution", "with intent to defeat the decree", "with the intention of defrauding the plaintiff", "dishonestly", "to evade the decree"], "unlocked_by": {"key": "intent_statement", "label": "Your statement about the defendant's intention", "present": true}},
    {"id": "plaintiff_strong_case", "kind": "submission", "what": "The plaintiff has a strong case or the defendant has no other property", "phrases": ["the plaintiff has a strong prima facie case", "the plaintiff is bound to succeed", "the defendant has no other property", "the decree will be rendered infructuous"], "unlocked_by": null},
    {"id": "applicant_undertaking", "kind": "submission", "what": "The applicant undertakes to compensate or furnish security", "phrases": ["the applicant undertakes to compensate", "the applicant shall pay damages if the attachment is found wrongful", "the applicant undertakes to furnish security"], "unlocked_by": {"key": "undertaking_offered", "label": "Undertaking offered by the applicant", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "defendant_dealing", "kind": "averment", "averment": "the applicant states the following about the defendant's dealing with the property: {{defendant_conduct}}", "requires": {"key": "defendant_conduct", "label": "What the defendant has done or is said to be about to do", "present": true}},
    {"id": "intent_to_obstruct", "kind": "submission", "averment": "it is submitted, on the applicant's own statement, that {{intent_statement}}", "requires": {"key": "intent_statement", "label": "Your statement about the defendant's intention", "present": true}},
    {"id": "applicant_undertaking", "kind": "submission", "averment": "the applicant undertakes, for the future, that {{undertaking_offered}}", "requires": {"key": "undertaking_offered", "label": "Undertaking offered by the applicant", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The conditions of Rule 5 (understood: that the Court is satisfied that the defendant, with intent to obstruct or delay execution of a decree, is about to dispose of the whole or part of the property, or to remove it from the jurisdiction; direction to furnish security or show cause; conditional attachment). Sub-rule numbers and the exact words are not cited; the statutory test is not paraphrased into signed text.
- Whether the Rule requires the property to be specified and its estimated value stated (understood: yes, Rule 5(2)). Not cited; `property_value_stated` is optional and the advocate's own.
- Compensation for attachment obtained on insufficient grounds (CPC s.95; understood). Not cited; no compensation undertaking is drafted.
- Rule 1 (arrest before judgment) and Rule 6 onward (security and attachment procedure). Not covered.

## Notes for Ajay

1. Risk. Intent is the heart of Rule 5. The pack only carries the applicant's own statement; if the advocate gives none, the application will carry a blank at its centre. That is intended.
2. Risk. `defendant_dealing` is a statement of fact about the defendant's acts; it is written only as "the applicant states". The intention statement is a submission in the applicant's own words (Ajay's ruling 5).
3. Tier B. One Anushka sample with `intent_statement` empty.

## Review changes (v2, per Ajay's rulings)

- Intent: kind changed from averment to submission (banned and allowed twin); clause, prompt wording now 'It is submitted, on the applicant's own statement, that ...' in the applicant's own words.
- Checklist: removed the paraphrase of what the Order requires of the affidavit.
- Added optional clause 'security' so security_sought no longer claims to feed a prayer placeholder that does not exist.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: defence and interlocutory. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier B |
| Ruling | The defendant's intent is written only as the applicant's own words from the brief, as a submission. The undertaking for compensation for wrongful attachment is form-driven only: written only when the advocate supplies it. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
