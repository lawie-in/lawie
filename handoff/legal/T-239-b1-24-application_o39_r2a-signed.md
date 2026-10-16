# T-239 b1 #24 application_o39_r2a (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. Anushka tier A (Ajay's ruling: the respondent's liberty may be at stake).

| Field | Value |
|---|---|
| id | `application_o39_r2a` |
| displayName | Application for Action on Disobedience of Injunction (CPC Order XXXIX Rule 2A) |
| category | Civil: defence and interlocutory |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side"]` |
| Ink | S = 1 |
| Anushka tier | A |
| averments file | `_averments/application_o39_r2a.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "Order XXXIX Rule 2A",
        "description": "Consequence of disobedience or breach of injunction"
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
  "caseNomenclature": "CIVIL MISC. APPLICATION No. _____ of [YEAR]\n(In {suit_ref})\nAPPLICATION UNDER ORDER XXXIX RULE 2A OF THE CODE OF CIVIL PROCEDURE, 1908 FOR ACTION ON DISOBEDIENCE OF THE INJUNCTION ORDER DATED {injunction_order_date}"
}
```

## mandatoryClauses

```json
[
  {"id": "parties_and_suit", "name": "Parties and Suit", "required": true, "description": "The suit or proceeding (number, court, parties and the applicant's position in it) and the applicant's particulars, as the BRIEF gives them; blank where not given."},
  {"id": "injunction_order", "name": "The Injunction Order", "required": true, "description": "The court, the date and the terms of the injunction, quoted exactly as the BRIEF gives them; blank if not given. Never paraphrased."},
  {"id": "knowledge", "name": "Knowledge of the Order", "required": true, "description": "How the respondent came to know of the order, only as the BRIEF gives it (for example service, presence in Court); blank where not given."},
  {"id": "disobedience", "name": "Disobedience Alleged", "required": true, "description": "What the respondent did or omitted, with date and place, exactly as the BRIEF gives it; blank where not given."},
  {"id": "status_of_order", "name": "Status of the Order", "required": true, "description": "Whether the order is in force, or has been varied, vacated or stayed, only as the BRIEF gives it; blank where not given."},
  {"id": "consequence_sought", "name": "Consequence Sought", "required": true, "description": "The consequence chosen in CONSEQUENCE SOUGHT, as the advocate selects it."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier application or other proceeding on the same point in this matter, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Take action under Order XXXIX Rule 2A of the Code of Civil Procedure, 1908 against the opposite party for disobedience of the order dated {injunction_order_date} passed in {suit_ref}, by way of {consequence_sought};
b) Direct the opposite party to comply with the said order;
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
  "Certified copy of the injunction order",
  "Proof that the order was served on, or known to, the opposite party (e.g. service report, order sheet entry)",
  "Documents, photographs or other material showing the disobedience, if any",
  "Affidavit of the applicant, if the court requires one",
  "Copy to the opposite party / notice as per court practice",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application in the suit in which a temporary injunction was granted, for action under Order XXXIX Rule 2A of the Code of Civil Procedure, 1908 for its disobedience or breach. It is not an application for the injunction itself, not a petition under the Contempt of Courts Act, 1971, and not an application for a new injunction.",
  "Quote the terms of the injunction order exactly as the BRIEF gives them. Do not paraphrase, summarise or complete them. If not given, write [To be confirmed: the terms of the injunction order, as worded in the order].",
  "State the disobedience only as the BRIEF gives it: what was done or omitted, by whom, on what date. Where not given, write [To be confirmed: the act of disobedience, its date and place]. Do not write that the disobedience is wilful, deliberate, contumacious or in contempt.",
  "State how the opposite party knew of the order only as the BRIEF gives it. Where not given, write [To be confirmed: how the opposite party had notice of the order]. Do not write that the opposite party was served unless the BRIEF says so.",
  "Do not write that the order is in force and has not been varied, vacated or stayed unless the BRIEF says so; otherwise write [To be confirmed: whether the order is in force and has not been varied, vacated or stayed].",
  "Name the consequence sought only as CONSEQUENCE SOUGHT gives it. Do not state the period or limit of any detention or attachment.",
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
| injunction_order_date | Date of the injunction order | date | yes | cause title, prayer |
| injunction_order_text | Terms of the injunction (as worded in the order) | textarea | yes | quoted verbatim |
| knowledge_basis | How the opposite party knew of the order (service, present in Court, other) | textarea | no | knowledge clause; averment unlock |
| disobedience_details | The disobedience: what was done or omitted, by whom, when, where | textarea | yes | disobedience clause; averment unlock |
| disobedience_date | Date of the disobedience | date | no | disobedience clause |
| order_status_note | Present status of the order (in force, varied, vacated, stayed) | textarea | no | status clause |
| consequence_sought | Consequence sought | select (Attachment of property; Detention in civil prison; Both; As the Court directs) | yes | consequence clause, prayer |
| earlier_proceedings | Earlier and other proceedings on the same point (court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "application_o39_r2a",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "order_known", "kind": "averment", "what": "The opposite party knew of or was served with the order", "phrases": ["the opposite party had full knowledge of the order", "the order was duly served on the opposite party", "the opposite party was well aware of the injunction"], "unlocked_by": {"key": "knowledge_basis", "label": "How the opposite party knew of the order", "present": true}},
    {"id": "order_disobeyed", "kind": "averment", "what": "The opposite party disobeyed or breached the order", "phrases": ["has disobeyed the order", "has committed breach of the injunction", "has violated the order of this Court"], "unlocked_by": {"key": "disobedience_details", "label": "The disobedience", "present": true}},
    {"id": "wilful_or_contempt", "kind": "averment", "what": "The disobedience is wilful, deliberate or in contempt", "phrases": ["wilfully disobeyed", "deliberate disobedience", "is guilty of contempt", "contumacious conduct", "flouted the order"], "unlocked_by": null},
    {"id": "order_in_force", "kind": "averment", "what": "The order is in force and has not been stayed", "phrases": ["the order is still in force", "the order has not been vacated or stayed", "the order continues to operate"], "unlocked_by": {"key": "order_status_note", "label": "Present status of the order", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "order_known", "kind": "averment", "averment": "the applicant states that the opposite party had notice of the order as follows: {{knowledge_basis}}", "requires": {"key": "knowledge_basis", "label": "How the opposite party knew of the order", "present": true}},
    {"id": "order_disobeyed", "kind": "averment", "averment": "the applicant states that the opposite party acted in disobedience of the order as follows: {{disobedience_details}}", "requires": {"key": "disobedience_details", "label": "The disobedience", "present": true}},
    {"id": "order_in_force", "kind": "averment", "averment": "the applicant states, as to the present status of the order, that {{order_status_note}}", "requires": {"key": "order_status_note", "label": "Present status of the order", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Code-supplied strings: consequence_sought

Derived by the code from the `consequence_sought` select; used in prayer (a) after "by way of ". No period or limit is ever added.

| Select option | String produced |
|---|---|
| Attachment of property | attachment of the property of the opposite party |
| Detention in civil prison | detention of the opposite party in civil prison |
| Both | attachment of the property of the opposite party and detention of the opposite party in civil prison |
| As the Court directs | such consequence as this Hon'ble Court may direct under the said Rule |

## Verify (not in signed text)

- The consequences Rule 2A provides (understood: attachment of the property of the person guilty and/or detention in civil prison, each for a period fixed in the Rule, and release or restoration on the disobedience ceasing or on security). Periods are not stated; the `consequence_sought` options are the advocate's choice.
- Whether Rule 2A also applies to a person for whom an injunction order binds other than a party (understood: the Rule refers to the person guilty and to an agent). Not stated.
- The interplay with the Contempt of Courts Act, 1971 and with Order XXXIX Rule 2A(2) (property attached for a fixed period). Not cited.
- Whether an application under Rule 2A requires an affidavit. Checklist cue marked "if the court requires".

## Notes for Ajay

1. Risk. The Drafter is told never to write "wilful" or "contemptuous"; these are findings for the Court. If you want the advocate to be able to plead wilfulness on a stated fact, add a `wilfulness_facts` key and an allowed twin.
2. Risk. Detention is a liberty matter for the opposite party. The pack does not draft the detention terms.
3. Tier A (Ajay's ruling). Two Anushka samples, one with `injunction_order_text` empty.

## Review changes (v2, per Ajay's rulings)

- Anushka tier B changed to A (ruling 2); header and Note 3 updated.
- Added the table of select option to consequence_sought strings.
- Clean on other checks.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: defence and interlocutory. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier A |
| Ruling | Tier raised to A: the respondent's liberty may be at stake. The Contempt of Courts Act, 1971 is named in the prompt only. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
