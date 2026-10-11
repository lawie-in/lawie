# T-239 b1 #36 child_custody_gwa_25 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink L = 2.

| Field | Value |
|---|---|
| id | `child_custody_gwa_25` |
| displayName | Petition for Guardianship or Return of a Ward (Guardians and Wards Act, section 7 or section 25) |
| category | Family and matrimonial |
| court_levels | `["district_court", "family_court"]` |
| Ink | L = 2 |
| Anushka tier | A (custody) — every sample twice: full facts, facts missing |
| averments file | `_averments/child_custody_gwa_25.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
  {
    "act": "Guardians and Wards Act, 1890",
    "sections": [
      {"number": "7", "description": "Appointment or declaration of guardian"},
      {"number": "25", "description": "Return of a ward"}
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{petitioner} ... Petitioner\nVERSUS\n{respondent} ... Respondent",
  "partyDesignations": [
    {"role": "petitioner", "label": "Petitioner"},
    {"role": "respondent", "label": "Respondent"}
  ],
  "caseNomenclature": "GUARDIANSHIP PETITION No. _____ of [YEAR]\nIn respect of the ward {ward_name_display}, aged {ward_age}\n{petition_under_title}"
}
```

## Derived text from `petition_under` (exact strings)

The form select `petition_under` has exactly two options. The lead fills `{petition_under_title}` (cause title) and `{prayer_a_line}` (prayer line a) from the table. The Drafter cites only the chosen section in the cause title, the body and the prayer, and never the other.

| petition_under | `{petition_under_title}` | `{prayer_a_line}` |
|---|---|---|
| Section 7 (appointment or declaration of guardian) | PETITION FOR APPOINTMENT OR DECLARATION OF GUARDIAN UNDER SECTION 7 OF THE GUARDIANS AND WARDS ACT, 1890 | Appoint or declare the petitioner to be the guardian of the ward {ward_name_display}, under section 7 of the Guardians and Wards Act, 1890; |
| Section 25 (return of a ward) | PETITION FOR CUSTODY AND RETURN OF THE WARD UNDER SECTION 25 OF THE GUARDIANS AND WARDS ACT, 1890 | Direct the return of the ward {ward_name_display} to the custody of the petitioner, under section 25 of the Guardians and Wards Act, 1890; |

Lawie does not advise which section suits the petitioner. The choice is the advocate's.

## mandatoryClauses

```json
[
  {"id": "petitioner_particulars", "name": "Petitioner and Respondent", "required": true, "description": "The parties, their relationship to the ward and to each other, as the brief gives them."},
  {"id": "ward_particulars", "name": "The Ward", "required": true, "description": "The ward's name (or initials, as the form gives) and age, as the brief gives them; no other data about the ward."},
  {"id": "petitioner_status", "name": "Petitioner's Status as Guardian", "required": true, "description": "How the petitioner stands to the ward (the capacity the advocate records) and any order appointing the petitioner as guardian, with court, number and date, as the brief gives them; else the blank. No statement of the petitioner's legal status beyond that."},
  {"id": "custody_history", "name": "Custody of the Ward", "required": true, "description": "When and how the ward was in the petitioner's custody and, where the brief says so, when and how the ward left or was removed from it, only as the brief gives it, with dates as given."},
  {"id": "present_custody", "name": "Present Custody", "required": true, "description": "Where the ward is now and with whom, only as the brief gives it; else the blank."},
  {"id": "welfare", "name": "Welfare of the Ward", "required": true, "description": "Submissions only (never findings) on the welfare of the ward, on the reasons the brief gives only. No reason the brief does not give."},
  {"id": "earlier_proceedings", "name": "Other Proceedings", "required": true, "description": "Every other proceeding on custody, guardianship, maintenance or the marriage between the parties, with court, number, date and result as the brief gives them; or the blank where the brief is silent."},
  {"id": "undertakings", "name": "Undertakings", "required": false, "description": "Only if the brief gives one: an undertaking by the petitioner for the future, such as to abide by the Court's directions on the ward's care or access. Never a statement of fact."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) {prayer_a_line}
b) Pass such further order(s) regarding the custody and welfare of the ward as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the petitioner shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {applicant}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above petition are true and correct to my knowledge and belief, and that nothing material has been concealed therein.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Petition (original + copy for the respondent)",
  "Check that the section chosen (section 7 or section 25) suits the petitioner's capacity: the advocate's decision, not Lawie's (verify)",
  "Affidavit of the petitioner in support, if the court requires one",
  "Proof of the ward's age (birth certificate / school record)",
  "Proof of the petitioner's relationship to the ward",
  "Order appointing the petitioner as guardian, if any",
  "Documents on the ward's custody history and present whereabouts, as the petitioner relies on them",
  "Copies of orders in any other proceeding on custody or guardianship, if any",
  "Notice / service on the respondent as per court practice",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft a petition under the section of the Guardians and Wards Act, 1890 given as petition_under in the case details: section 7 (appointment or declaration of guardian) or section 25 (return of a ward). Cite only that section, in the cause title, the body and the prayer; never cite the other. Lawie does not advise which section suits the petitioner; do not comment on the choice. Where petition_under is not given, write [To be confirmed: whether the petition is under section 7 or section 25 of the Guardians and Wards Act, 1890]. This is not a habeas corpus petition and not a petition under any other Act.",
  "Call the child 'the ward'. Give the ward's name (or initials, exactly as the form gives them; never expand initials) and age exactly as the BRIEF gives them; add no other data about the ward (school, health, address, preferences). Do not write that the ward is a minor or a child of any age; state the age as given.",
  "State the petitioner's status (parent, guardian appointed by a court, or other) only as the BRIEF gives it. Do not write that the petitioner is the natural guardian or the guardian unless the BRIEF says so; otherwise [To be confirmed: the capacity in which the petitioner claims custody of the ward].",
  "State that the ward left or was removed from the petitioner's custody only where the BRIEF says so, as the BRIEF gives it, with the dates it gives. Under section 7 do not state any removal the BRIEF does not give. Do not characterise the removal as illegal, forcible or wrongful unless the BRIEF gives that. Do not write that the respondent is unfit, has ill-treated the ward or neglected the ward, and do not state the ward's wishes, unless the BRIEF gives them, and then only as the petitioner's statement.",
  "Write the welfare of the ward as a submission only ('It is submitted that the welfare of the ward requires ...'), on the reasons the BRIEF gives and no others, never as a finding or a fact. Do not name any case. Do not write that the petitioner is fit, capable or has sufficient means unless the BRIEF gives it.",
  "Do not assert jurisdiction. Where the BRIEF gives the basis of territorial jurisdiction, write 'It is stated that this Court has jurisdiction on the basis that ...' in the BRIEF's words; otherwise [To be confirmed: the basis of the Court's territorial jurisdiction]. Do not cite a section for it.",
  "State every other proceeding on custody, guardianship, maintenance or the marriage that the BRIEF mentions, with court, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any other proceeding on the custody or guardianship of the ward, or on the marriage, is pending or was decided, and where]. Never write that this is the first petition or that none is pending.",
  "Give any undertaking only as an undertaking by the petitioner for the future, and only if the BRIEF gives it.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| petition_under | Petition is under | select (Section 7 (appointment or declaration of guardian); Section 25 (return of a ward)) | yes | cause title, body, prayer |
| petitioner_name / petitioner_parentage / petitioner_age / petitioner_address | Petitioner particulars | text / text / number / textarea | yes | verification |
| respondent_name / respondent_address | Respondent particulars | text / textarea | yes | cause title |
| relationship_of_parties | Relationship of the parties to each other | text | no | parties clause |
| ward_name_display / ward_age | Ward's name (or initials) and age, as given | text / text | yes | nomenclature, prayer |
| petitioner_capacity | Petitioner's capacity (as the advocate states it) | select (Father; Mother; Guardian appointed by a court; Other, specify) | yes | status clause |
| guardian_order_details | Order appointing the petitioner as guardian (court, number, date) | text | no | status clause |
| custody_how_lost | The ward | select (Was removed from the petitioner's custody; Left the petitioner's custody; Not stated) | yes if Section 25 | averment unlock |
| custody_history | Custody history with dates (as the petitioner gives it) | textarea | yes | custody clause |
| present_custody | Where the ward is now and with whom | textarea | no | present custody clause |
| welfare_grounds | Reasons the welfare of the ward requires the order (as the petitioner gives them) | textarea | no | welfare submission unlock |
| jurisdiction_basis | Basis of territorial jurisdiction (as the advocate states it) | textarea | no | averment unlock |
| undertaking_text | Undertaking by the petitioner for the future, if any | textarea | no | undertakings clause |
| earlier_proceedings | Other proceedings on custody, guardianship or the marriage (court, number, date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "child_custody_gwa_25",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "ward_removed", "kind": "averment", "what": "The ward was removed from, or left, the petitioner's custody", "phrases": ["was removed from the custody of the petitioner", "was taken away from the petitioner", "the respondent took the ward away", "left the custody of the petitioner", "bachche ko le gaya"], "unlocked_by": {"key": "custody_how_lost", "label": "The ward", "equals": ["was removed from the petitioner's custody", "left the petitioner's custody"]}},
    {"id": "welfare_requires", "kind": "submission", "what": "The welfare of the ward requires the order", "phrases": ["the welfare of the ward requires", "it is in the best interest of the ward", "for the welfare of the child", "bachche ke hit mein"], "unlocked_by": {"key": "welfare_grounds", "label": "Reasons the welfare of the ward requires the order", "present": true}},
    {"id": "respondent_unfit", "kind": "averment", "what": "The respondent is unfit, neglects or ill-treats the ward", "phrases": ["the respondent is unfit", "ill-treats the ward", "neglects the ward", "is not capable of looking after", "cruelty to the child"], "unlocked_by": null},
    {"id": "petitioner_fit", "kind": "averment", "what": "The petitioner is fit, capable or has the means", "phrases": ["the petitioner is fit", "the petitioner is capable of looking after", "has sufficient means to maintain the ward", "better placed to look after"], "unlocked_by": null},
    {"id": "ward_wishes", "kind": "averment", "what": "The ward's wishes or state of mind", "phrases": ["the ward wishes to", "the ward is happy", "the ward is afraid", "the ward wants to live with"], "unlocked_by": null},
    {"id": "court_has_jurisdiction", "kind": "submission", "what": "The court has territorial jurisdiction", "phrases": ["this court has jurisdiction", "this hon'ble court has territorial jurisdiction", "the court has jurisdiction to entertain", "is within the jurisdiction of this court", "adalat ka kshetradhikar hai"], "unlocked_by": {"key": "jurisdiction_basis", "label": "Basis of territorial jurisdiction (as the advocate states it)", "present": true}},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Other proceedings on custody, guardianship or the marriage", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "ward_removed", "kind": "averment", "averment": "the ward {{custody_how_lost}}, as stated by the petitioner", "requires": {"key": "custody_how_lost", "label": "The ward", "equals": ["was removed from the petitioner's custody", "left the petitioner's custody"]}},
    {"id": "welfare_requires", "kind": "submission", "averment": "it is submitted that the welfare of the ward requires the order sought because {{welfare_grounds}}", "requires": {"key": "welfare_grounds", "label": "Reasons the welfare of the ward requires the order", "present": true}},
    {"id": "court_has_jurisdiction", "kind": "submission", "averment": "it is stated that this Court has jurisdiction on the basis that {{jurisdiction_basis}}", "requires": {"key": "jurisdiction_basis", "label": "Basis of territorial jurisdiction (as the advocate states it)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Other proceedings on custody, guardianship or the marriage", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- Ajay's ruling: section 25 is for a guardian of the person; a parent who is not a court-appointed guardian may need section 7. The pack carries both through the `petition_under` select, takes the capacity from the form and takes no position. Lawie does not advise.
- The court with jurisdiction under the Act (understood as the court where the minor ordinarily resides; section 9) and the overlap with the Family Courts Act. Not cited; jurisdiction is a form field.
- Who may apply (section 8) and the matters the court considers in appointing a guardian (section 17). Not cited.
- The Hindu Minority and Guardianship Act, 1956 and personal-law guardianship rules. Not cited.
- Any rule on interim custody or access pending the petition (understood to be sought by a separate application). Not in this pack.
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. Risk. Custody cases are the most contested filing in the batch. The Drafter is told to say nothing about the ward beyond name and age, and nothing about the respondent's fitness. If the advocate's brief is thin the petition will be thin, by design.
2. Privacy and child data: initials or age only as given. A minor's name in a public cause title: the form key is ward_name_display so the advocate may enter initials; I have not made initials the default.
3. Welfare of the child is a submission only, with no case name; the Drafter writes [Authority — add if relied upon] if the advocate wants an authority.
4. Tier A: one Anushka sample with custody_history and welfare_grounds empty, to check that no history and no reason is invented.
5. No limitation block: a petition under section 25 is not an appeal or revision; the default within_limitation ban stays.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Family and matrimonial. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | `petition_under` select (section 7 or section 25), derived cause title and prayer strings as in the spec: approved. The checklist cue to check that the chosen section suits the petitioner's capacity is approved (it is not advice). Welfare of the child is a submission only; initials only. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
