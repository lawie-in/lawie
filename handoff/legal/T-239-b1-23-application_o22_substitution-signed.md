# T-239 b1 #23 application_o22_substitution (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. Tier A: limitation (and abatement) at stake. Rule numbers inside Order XXII are all under Verify.

| Field | Value |
|---|---|
| id | `application_o22_substitution` |
| displayName | Application to Bring Legal Representatives on Record (CPC Order XXII) |
| category | Civil: defence and interlocutory |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side", "district_judge", "high_court_appellate_civil_side"]` |
| Ink | S = 1 |
| Anushka tier | A |
| averments file | `_averments/application_o22_substitution.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "Order XXII",
        "description": "Death, marriage and insolvency of parties"
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
  "caseNomenclature": "CIVIL MISC. APPLICATION No. _____ of [YEAR]\n(In {suit_ref})\nAPPLICATION UNDER ORDER XXII OF THE CODE OF CIVIL PROCEDURE, 1908 TO BRING THE LEGAL REPRESENTATIVES OF THE DECEASED {deceased_name} ON RECORD"
}
```

## mandatoryClauses

```json
[
  {"id": "parties_and_suit", "name": "Parties and Suit", "required": true, "description": "The suit or proceeding (number, court, parties and the applicant's position in it) and the applicant's particulars, as the BRIEF gives them; blank where not given."},
  {"id": "death", "name": "Death of the Party", "required": true, "description": "The name of the deceased, the deceased's position in the suit or appeal, and the date of death, as the BRIEF gives them; blank where not given."},
  {"id": "legal_representatives", "name": "Legal Representatives", "required": true, "description": "Each person proposed to be brought on record: name, relationship to the deceased and address, exactly as the BRIEF gives them; blank where not given. No statement that these are the only or all legal representatives unless LR COMPLETENESS gives it."},
  {"id": "right_to_sue", "name": "Right to Sue or Defend", "required": true, "description": "Whether the right to sue or the cause of action survives, only as RIGHT TO SUE NOTE gives it; blank where not given."},
  {"id": "abatement", "name": "Abatement", "required": true, "description": "The position on abatement, only as ABATEMENT STATUS gives it; blank where not given. No statement that the suit has not abated."},
  {"id": "knowledge", "name": "Knowledge of the Death", "required": true, "description": "When and how the applicant learnt of the death, only as the BRIEF gives it; blank where not given."},
  {"id": "dates", "name": "Dates", "required": true, "description": "The date of death, the date the applicant learnt of it and the date of filing, as dates only."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier application or other proceeding on the same point in this matter, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Bring on record the legal representatives of the deceased {deceased_name} named in this application, and substitute them in his/her place in {suit_ref}, under Order XXII of the Code of Civil Procedure, 1908;
b) Permit the applicant to amend the cause title and the pleadings so far as this order requires;
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
  "Death certificate of the deceased, if available",
  "Proof of relationship of each proposed legal representative to the deceased (e.g. family register, legal-heir certificate, will), if relied on",
  "Affidavit of the applicant on the legal representatives, if the court requires one",
  "Amended cause title / memo of parties",
  "If abatement has taken place: an application to set aside the abatement, with an application for condonation of delay (rule: verify)",
  "Copy to the opposite party / notice as per court practice",
  "Vakalatnama of the new parties, if they are to be represented",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)",
  "Check the period of limitation against the Limitation Act, 1963 and the Act under which this is brought (verify); if late, file an application for condonation of delay."
]
```

## promptInstructions

```json
[
  "Draft an application in a pending suit or appeal to bring on record the legal representatives of a deceased party under Order XXII of the Code of Civil Procedure, 1908. It is not an application to implead a stranger (Order I Rule 10), not an application to set aside abatement, and not an application for condonation of delay; where the BRIEF says abatement has taken place, add [To be confirmed: application to set aside abatement and for condonation of delay to be filed with this].",
  "State the deceased's name, position in the case and date of death only as the BRIEF gives them. Where not given write [To be confirmed: date of death of the deceased]. Do not state the cause or place of death.",
  "Name each proposed legal representative with relationship and address exactly as the BRIEF gives them. Do not write that they are the only legal representatives, all the legal representatives or the heirs, unless LR COMPLETENESS gives that; then write \"the applicant states that ...\" in its words.",
  "State whether the right to sue or the cause of action survives only as RIGHT TO SUE NOTE gives it, as a submission. Do not state it from your own knowledge.",
  "Do not write that the suit or appeal has not abated, or that abatement has taken place, in the Drafter's own words. Use ABATEMENT STATUS only: if it says an order of abatement was passed, give its date as the BRIEF gives it.",
  "Cite only Order XXII as a whole. Do not cite a rule of Order XXII or any other Order or section; where a rule would normally be cited write [Rule — verify before filing].",
  "Give the dates the BRIEF gives (of the death, of the date the applicant learnt of it, of any order of abatement, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "State facts only as the BRIEF gives them. Where a fact the document needs is not given, write [To be confirmed: <what is missing>]. Do not add a cause, reason, motive or detail to a fact.",
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
| applicant_capacity | Applicant is | select (Surviving plaintiff or appellant; Surviving defendant or respondent; A legal representative of the deceased; Other — state) | yes | particulars clause |
| deceased_name | Name of the deceased party | text | yes | cause title, prayer |
| deceased_position | Position of the deceased in the suit or appeal | select (Plaintiff; Defendant; Appellant; Respondent; Other — state) | yes | death clause |
| date_of_death | Date of death | date | no | death clause; limitation dates (listed only) |
| knowledge_of_death_date | Date the applicant learnt of the death | date | no | knowledge clause; limitation dates (listed only) |
| lr_particulars | Legal representatives proposed (name, relationship, address of each) | textarea | yes | legal representatives clause |
| lr_completeness_note | Your statement on whether these are all the legal representatives | textarea | no | averment unlock |
| right_to_sue_note | Your statement on whether the right to sue or defend survives | textarea | no | averment unlock |
| abatement_status | Abatement | select (Not stated; This application is made before any order of abatement; An order of abatement has been passed) | yes | abatement clause |
| abatement_order_date | Date of the order of abatement, if passed | date | no | abatement clause |
| filing_date | Date of filing | date | no | limitation dates (listed only) |
| earlier_proceedings | Earlier and other proceedings on the same point (court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "application_o22_substitution",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "suit_not_abated", "kind": "submission", "what": "The suit or appeal has not abated, or the application is within the time to prevent abatement", "phrases": ["the suit has not abated", "there is no abatement", "the appeal has not abated", "the suit does not abate"], "unlocked_by": null},
    {"id": "all_legal_representatives", "kind": "averment", "what": "These are all the legal representatives", "phrases": ["are the only legal representatives", "are all the legal representatives of the deceased", "no other legal representative exists", "are the sole heirs"], "unlocked_by": {"key": "lr_completeness_note", "label": "Your statement on whether these are all the legal representatives", "present": true}},
    {"id": "right_survives", "kind": "submission", "what": "The right to sue or defend survives the death", "phrases": ["the right to sue survives", "the cause of action survives the death", "the cause of action survives"], "unlocked_by": {"key": "right_to_sue_note", "label": "Your statement on survival of the right to sue", "present": true}},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "all_legal_representatives", "kind": "averment", "averment": "the applicant states, as to the legal representatives, that {{lr_completeness_note}}", "requires": {"key": "lr_completeness_note", "label": "Your statement on whether these are all the legal representatives", "present": true}},
    {"id": "right_survives", "kind": "submission", "averment": "it is submitted, as to the right to sue, that {{right_to_sue_note}}", "requires": {"key": "right_to_sue_note", "label": "Your statement on survival of the right to sue", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The rule numbers of Order XXII (understood: Rule 1 no abatement if the right to sue survives; Rule 3 death of a plaintiff; Rule 4 death of a defendant; Rule 9 effect of abatement and setting it aside; Rule 11 application to appeals). None is cited; `[Rule — verify before filing]` is the Drafter's blank.
- The time within which the legal representatives must be brought on record and the point it runs from, and the Article of the Limitation Act, 1963 (understood: Articles 120 and 121, ninety days). Not stated anywhere; the dates are listed only.
- The application to set aside abatement and its limitation (understood: Article 121 for setting aside; Section 5 availability). Not cited; checklist cue is marked verify.
- Whether the Court must be satisfied on the legal representatives' status and may proceed in the absence of some (Order XXII Rule 4 area; understood). Not stated.
- The effect on the decree where a party's death was not brought to notice. Not stated.

## Notes for Ajay

1. Risk. I banned "the suit has not abated" with no unlock because only the Court decides abatement. The advocate's `abatement_status` is shown as the BRIEF's position, never as an averment.
2. Risk. The condonation blank is drafted only where the BRIEF says abatement has taken place or the filing is late. I did not add a certified-copy key (death certificate is a different document); `knowledge_of_death_date` is the date the limitation block needs.
3. Tier A: two Anushka samples, full facts and `lr_particulars` incomplete, to check no relative is invented.

## Review changes (v2, per Ajay's rulings)

- Limitation instruction and checklist cue now name only the dates this pack collects (death, knowledge of death, abatement order, filing); no certified-copy dates.
- court_levels left as drafted per ruling 8 (it lists district_judge twice; T-240 may dedupe).
- Clean on other checks.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: defence and interlocutory. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier A |
| Ruling | Limitation block with the dates this pack collects. Rule numbers inside Order XXII stay in Verify. `court_levels` lists `district_judge` twice: the lead de-duplicates. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
