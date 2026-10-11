# T-239 b1 #22 application_o1_r10 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. 

| Field | Value |
|---|---|
| id | `application_o1_r10` |
| displayName | Application to Implead, Add or Strike Out a Party (CPC Order I Rule 10) |
| category | Civil: defence and interlocutory |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side"]` |
| Ink | S = 1 |
| Anushka tier | B |
| averments file | `_averments/application_o1_r10.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "Order I Rule 10",
        "description": "Suit in name of wrong plaintiff; addition, striking out and substitution of parties"
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
  "caseNomenclature": "CIVIL MISC. APPLICATION No. _____ of [YEAR]\n(In {suit_ref})\nAPPLICATION UNDER ORDER I RULE 10 OF THE CODE OF CIVIL PROCEDURE, 1908 {action_heading}"
}
```

## mandatoryClauses

```json
[
  {"id": "parties_and_suit", "name": "Parties and Suit", "required": true, "description": "The suit or proceeding (number, court, parties and the applicant's position in it) and the applicant's particulars, as the BRIEF gives them; blank where not given."},
  {"id": "proposed_party", "name": "The Party Concerned", "required": true, "description": "The party to be added, struck out or substituted: name, address and position sought, as the BRIEF gives them; blank where not given."},
  {"id": "interest", "name": "Interest in the Subject Matter", "required": true, "description": "The interest or connection of that party with the subject matter of the suit, as the BRIEF gives it; blank where not given."},
  {"id": "reasons", "name": "Reasons", "required": true, "description": "The reasons the BRIEF gives for the addition, striking out or substitution, as submissions; no reason the BRIEF does not give."},
  {"id": "stage", "name": "Stage of the Suit", "required": true, "description": "The stage of the suit, only as the BRIEF gives it; blank where not given."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier application or other proceeding on the same point in this matter, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) {action_prayer} in {suit_ref}, as set out in this application, under Order I Rule 10 of the Code of Civil Procedure, 1908;
b) Permit the applicant to amend the cause title and the pleadings so far as this order requires, if the Court so directs;
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
  "Application (original + copies for each opposite party)",
  "Documents showing the interest of the party concerned in the subject matter, if any",
  "Copy of the plaint and, if filed, the written statement",
  "Affidavit of the applicant, if the court requires one",
  "Consent of the party sought to be added, if the BRIEF gives it",
  "Amended memo of parties / cause title, if the court asks",
  "Copy to the opposite parties / notice as per court practice",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft an application in a pending suit under Order I Rule 10 of the Code of Civil Procedure, 1908, to add, strike out or substitute a party, as chosen in ACTION SOUGHT. It is not an application for substitution on death (that is under Order XXII) and not an application to amend the plaint.",
  "State the party's name, address and the position sought (plaintiff or defendant) only as the BRIEF gives them. Where not given write [To be confirmed: name and address of the party concerned].",
  "State the party's interest in the subject matter and the reasons for the change only as the BRIEF gives them, as submissions. Do not write that the party is a necessary party, a proper party, or that no effective decree can be passed without the party, unless the BRIEF gives that as a reason; then write it as a submission in the BRIEF's words.",
  "State the stage of the suit only as the BRIEF gives it. Do not write that no prejudice will be caused, that the application is bona fide, or that the suit is at an early stage.",
  "Where the action is to strike out a party, state the reason the BRIEF gives (for example that the party has no interest in the suit) only as a submission on the BRIEF's own words.",
  "State facts only as the BRIEF gives them. Where a fact the document needs is not given, write [To be confirmed: <what is missing>]. Do not add a cause, reason, motive or detail to a fact.",
  "Cite only the provisions listed in relevantActs, at the level given there. Do not add a rule, sub-section or clause number. Where a provision would normally be cited and relevantActs does not give it, write [Section — verify before filing].",
  "State every earlier or other proceeding on this matter that the BRIEF mentions, with court, case reference, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier or other proceeding on this matter was filed or is pending, in which court, and with what result]. Never write that none is pending, that none was filed, or that this is the first application.",
  "Do not state, compute or comment on any period of limitation, and do not say that the application, or any claim against the party to be added, is within time or within limitation.",
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
| action_sought | Action sought | select (Add as plaintiff; Add as defendant; Strike out a party; Substitute a party) | yes | heading, prayer; see table of code-supplied strings |
| party_name / party_address | Party concerned: name and address | text / textarea | yes | party clause |
| party_interest | Interest of that party in the subject matter | textarea | no | interest clause |
| reasons_for_change | Reasons for the addition, striking out or substitution | textarea | yes | reasons clause; averment unlock |
| consent_note | Stand of the party concerned or of the other side, if known | textarea | no | particulars clause |
| earlier_proceedings | Earlier and other proceedings on the same point (court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "application_o1_r10",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "party_required", "kind": "submission", "what": "The party is necessary or proper, or no effective decree can be passed without the party", "phrases": ["is a necessary party", "is a proper party", "no effective decree can be passed in his absence", "complete adjudication is not possible without"], "unlocked_by": {"key": "reasons_for_change", "label": "Reasons for the addition, striking out or substitution", "present": true}},
    {"id": "no_prejudice_bona_fide", "kind": "averment", "what": "No prejudice and the application is bona fide", "phrases": ["no prejudice will be caused", "the application is bona fide", "the suit is at an early stage", "the application is not intended to delay the suit"], "unlocked_by": null},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "party_required", "kind": "submission", "averment": "it is submitted that the change is sought for the following reasons: {{reasons_for_change}}", "requires": {"key": "reasons_for_change", "label": "Reasons for the addition, striking out or substitution", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Code-supplied strings: action_heading and action_prayer

Derived by the code from `action_sought`; `party_name` is the form key. No other text is produced.

| `action_sought` option | `action_heading` (cause title, after "1908 ") | `action_prayer` (prayer a, before " in {suit_ref}") |
|---|---|---|
| Add as plaintiff | FOR ADDING {party_name} AS A PLAINTIFF | Direct that {party_name} be added as a plaintiff |
| Add as defendant | FOR ADDING {party_name} AS A DEFENDANT | Direct that {party_name} be added as a defendant |
| Strike out a party | FOR STRIKING OUT THE NAME OF {party_name} FROM THE ARRAY OF PARTIES | Direct that the name of {party_name} be struck out from the array of parties |
| Substitute a party | FOR SUBSTITUTION OF {party_name} AS A PARTY | Direct that {party_name} be substituted as a party, as set out in this application |

## Verify (not in signed text)

- Order I Rule 10 sub-rule numbers (understood: 10(1) wrong plaintiff and substitution; 10(2) striking out or adding parties at any stage, on application or of the Court's own motion; 10(4) amendment of the plaint on adding a defendant). Not cited.
- The consequence of adding a defendant for the date a suit is instituted against that defendant (Limitation Act, 1963; understood: Section 21). Not stated.
- Necessary and proper party tests. No authority named; the Drafter is told not to use the labels.
- Whether Order I Rule 10 can be used for a party's own-motion addition by the Court. Not relevant to this pack.

## Notes for Ajay

1. The prayer and heading use `action_prayer` and `action_heading`, strings the code derives from `action_sought` (table above, approved by Ajay as derived-from-select values). The 'Other — state' option is removed: no table string can be derived from free text.
2. Order I Rule 10 is wider than impleading; I treated add, strike out and substitute as one id with a select, not three ids.
3. Tier B. One Anushka sample with `reasons_for_change` empty.

## Review changes (v2, per Ajay's rulings)

- Added the table of select option to action_heading / action_prayer strings; removed the 'Other — state' action option (no derivable string).
- Added a null-unlock within_limitation ban and a prompt line (limitation can matter on adding a party). Clean on other checks: relevantActs (Order I Rule 10 only), Ink S=1, tier B.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: defence and interlocutory. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier B |
| Ruling | The "Other — state" action option is removed (approved): no string can be derived from free text. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
