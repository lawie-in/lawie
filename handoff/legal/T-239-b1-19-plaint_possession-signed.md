# T-239 b1 #19 plaint_possession (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. 

| Field | Value |
|---|---|
| id | `plaint_possession` |
| displayName | Plaint for Possession of Immovable Property |
| category | Civil: plaints and suits |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side"]` |
| Ink | L = 2 |
| Anushka tier | B |
| averments file | `_averments/plaint_possession.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Specific Relief Act, 1963",
    "sections": [
      {
        "number": "5",
        "description": "Recovery of specific immovable property"
      },
      {
        "number": "6",
        "description": "Suit by person dispossessed of immovable property"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{plaintiff} ... Plaintiff\nVERSUS\n{defendant} ... Defendant",
  "partyDesignations": [
    {
      "role": "plaintiff",
      "label": "Plaintiff"
    },
    {
      "role": "defendant",
      "label": "Defendant"
    }
  ],
  "caseNomenclature": "CIVIL SUIT No. _____ of [YEAR]\nSUIT FOR POSSESSION OF IMMOVABLE PROPERTY"
}
```

## mandatoryClauses

```json
[
  {"id": "parties", "name": "Parties", "required": true, "description": "Plaintiff and defendant with the particulars the BRIEF gives."},
  {"id": "property", "name": "Description of the Property", "required": true, "description": "A description of the immovable property sufficient to identify it, with boundaries, area and survey or khata particulars, exactly as the BRIEF gives them; blank where not given."},
  {"id": "basis_of_claim", "name": "Basis of the Claim", "required": true, "description": "Only the basis chosen in BASIS OF CLAIM: title; prior possession; or title with prior possession in the alternative. Each is pleaded only on the facts the BRIEF gives for it."},
  {"id": "title_facts", "name": "Title", "required": true, "description": "How the plaintiff's title arose, as the BRIEF gives it (document, date, parties); blank where not given. Required where the basis includes title."},
  {"id": "possession_and_dispossession", "name": "Possession and Dispossession", "required": true, "description": "The plaintiff's possession, and how and when the defendant came into possession or the plaintiff lost it, as the BRIEF gives them; blank where not given. Required where the basis includes prior possession."},
  {"id": "defendant_claim", "name": "Defendant's Stand", "required": true, "description": "What the defendant claims over the property, as the BRIEF gives it; blank where not given."},
  {"id": "jurisdiction", "name": "Jurisdiction", "required": true, "description": "\"It is stated that ...\" with the basis of territorial jurisdiction as the form gives it."},
  {"id": "valuation", "name": "Valuation", "required": true, "description": "\"It is stated that ...\" with the value of the subject matter as the form gives it."},
  {"id": "cause_of_action", "name": "Cause of Action", "required": true, "description": "\"It is stated that the cause of action arose on <date>\" only from the form date."},
  {"id": "earlier_proceedings", "name": "Earlier and Other Proceedings", "required": true, "description": "Every earlier or other proceeding over this property, with court, date and result; or the blank where the BRIEF is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Pass a decree for possession of the immovable property described in this plaint in favour of the plaintiff and against the defendant;
b) Grant the further relief set out in this plaint, if any: {ancillary_reliefs};
c) Award the costs of the suit;
d) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the plaintiff shall ever pray.
```

## verificationTemplate

```
VERIFICATION

I, {plaintiff}, S/o / D/o / W/o {parentName}, aged about {age} years, resident of {address}, the {verifierCapacity} above named, do hereby verify that paragraphs {knowledge_paras} of the above plaint are true to my knowledge, and paragraphs {information_paras} are based on information received and believed to be true.

Verified at {place} on {date}.

{verifierCapacity}
```

## filingChecklist

```json
[
  "Plaint (original + copies for each defendant)",
  "Documents of title relied on (sale deed, gift deed, partition, inheritance record), if the basis includes title",
  "Documents of possession relied on (e.g. rent or revenue receipts, tax receipts), if any",
  "Record of rights, survey or khata extract for the property",
  "Site plan or map, if relied on",
  "List of documents",
  "Notice or correspondence with the defendant, if relied on",
  "Vakalatnama",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)",
  "Check the Specific Relief Act, 1963 section applicable to the chosen basis (verify)",
  "Check the period of limitation against the Limitation Act, 1963 and the Act under which this is brought (verify); if late, file an application for condonation of delay."
]
```

## promptInstructions

```json
[
  "Draft a plaint for possession of immovable property. Plead only the basis in BASIS OF CLAIM. It is not a suit for declaration, partition, injunction or eviction of a tenant; do not add those reliefs unless ANCILLARY RELIEFS gives them.",
  "Where the basis is title, plead the title facts the BRIEF gives and nothing about possession beyond what the BRIEF gives. Where the basis is prior possession (suit on dispossession), plead the plaintiff's possession and the dispossession as the BRIEF gives them and do not plead title unless the BRIEF gives it. Where the basis is title with prior possession in the alternative, keep the two in separate paragraphs and write the second \"in the alternative\".",
  "Do not call the plaintiff the owner, the lawful owner or the absolute owner, do not describe possession as peaceful, settled or continuous, and do not call the defendant a trespasser or an unauthorised occupant, unless the BRIEF gives that fact; then state the fact the BRIEF gives, not the label.",
  "Describe the property exactly as the BRIEF gives it. Do not complete boundaries, area or survey numbers. Where not given, write [To be confirmed: description of the property, boundaries and area].",
  "Jurisdiction and value come only from the form. Write \"It is stated that ...\" with the basis of territorial jurisdiction as the BRIEF gives it, and the value of the subject matter as the BRIEF gives it. Never write that the Court has jurisdiction or that the value is within its pecuniary limits. Where either is not given, write [To be confirmed: basis of territorial jurisdiction] or [To be confirmed: value of the subject matter]. State the date the cause of action arose only if the BRIEF gives it, as \"It is stated that the cause of action arose on <date>\"; otherwise [To be confirmed: date the cause of action arose].",
  "Do not state a court fee, stamp duty or other fee or duty.",
  "State facts only as the BRIEF gives them. Where a fact the document needs is not given, write [To be confirmed: <what is missing>]. Do not add a cause, reason, motive or detail to a fact.",
  "Cite only the provisions listed in relevantActs, at the level given there. Do not add a rule, sub-section or clause number. Where a provision would normally be cited and relevantActs does not give it, write [Section — verify before filing].",
  "State every earlier or other proceeding on this matter that the BRIEF mentions, with court, case reference, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier or other proceeding on this matter was filed or is pending, in which court, and with what result]. Never write that none is pending, that none was filed, or that this is the first application.",
  "For this suit give the date of dispossession and the date the plaintiff's title arose, if the BRIEF gives them, as dates only.",
  "Give the dates the BRIEF gives (of the dispossession, if the BRIEF gives one, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| plaintiff_name | Plaintiff name | text | yes | cause title, verification |
| plaintiff_parentage / plaintiff_age / plaintiff_address | Plaintiff particulars | text / number / textarea | yes | verification |
| defendant_name / defendant_address | Defendant name and address | text / textarea | yes | cause title, service |
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| plaintiff_occupation | Plaintiff occupation | text | no | party clause |
| property_description | Property (description, boundaries, area, survey or khata particulars) | textarea | yes | property clause, schedule |
| basis_of_claim | Basis of the claim | select (Title; Prior possession — suit on dispossession; Title, with prior possession in the alternative) | yes | picks the pleaded basis and the heading |
| title_details | How the plaintiff's title arose (document, date, parties) | textarea | no | title clause; averment unlock |
| possession_history | The plaintiff's possession (since when, in what manner) | textarea | no | possession clause; averment unlock |
| dispossession_date | Date of dispossession | date | no | possession clause; limitation dates (listed only) |
| dispossession_details | How the defendant came into possession or the plaintiff lost it | textarea | no | possession clause; averment unlock |
| defendant_claim | What the defendant claims over the property | textarea | no | defendant's stand clause |
| ancillary_reliefs | Further reliefs claimed, if any (e.g. mesne profits, injunction) | textarea | no | prayer |
| territorial_basis | Basis of territorial jurisdiction (as you state it) | textarea | yes | jurisdiction clause; averment unlock |
| subject_value | Value of the subject matter (as you state it) | text | yes | valuation clause; averment unlock |
| cause_of_action_date | Date the cause of action arose | date | no | cause-of-action clause; averment unlock |
| earlier_proceedings | Earlier and other proceedings on the same matter (court, date, result) | textarea | no | disclosure clause; averment unlock |
| filing_date | Date of filing | date | no | limitation dates (listed only) |
| advocate_name / advocate_enrolment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "plaint_possession",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "title_conclusion", "kind": "averment", "what": "The plaintiff is the owner with good title", "phrases": ["is the absolute owner", "is the lawful owner", "is the rightful owner", "has a clear and marketable title"], "unlocked_by": {"key": "title_details", "label": "How the plaintiff's title arose", "present": true}},
    {"id": "possession_conclusion", "kind": "averment", "what": "The plaintiff was in peaceful or settled possession", "phrases": ["was in peaceful possession", "was in settled possession", "has been in continuous possession", "was in lawful possession"], "unlocked_by": {"key": "possession_history", "label": "The plaintiff's possession", "present": true}},
    {"id": "dispossession_conclusion", "kind": "averment", "what": "The plaintiff was forcibly or illegally dispossessed or the defendant is a trespasser", "phrases": ["was forcibly dispossessed", "was illegally dispossessed", "the defendant is a trespasser", "illegal occupation of the defendant", "unauthorised occupant"], "unlocked_by": {"key": "dispossession_details", "label": "How the defendant came into possession or the plaintiff lost it", "present": true}},
    {"id": "dispossessed_within_six_months", "kind": "submission", "what": "The suit is brought within the period allowed after dispossession", "phrases": ["dispossessed within six months", "the suit is filed within six months of dispossession", "the suit is in time under the Specific Relief Act"], "unlocked_by": null},
    {"id": "court_has_jurisdiction", "kind": "averment", "what": "The Court has territorial jurisdiction", "phrases": ["this Hon'ble Court has territorial jurisdiction", "this Court has jurisdiction to try the suit", "the suit is properly instituted in this Court"], "unlocked_by": {"key": "territorial_basis", "label": "Basis of territorial jurisdiction (as stated by the advocate)", "present": true}},
    {"id": "value_within_limits", "kind": "averment", "what": "The value is within the pecuniary limits of the Court", "phrases": ["the suit is within the pecuniary jurisdiction of this Court", "the value of the suit is within the pecuniary limits", "the suit is properly valued"], "unlocked_by": {"key": "subject_value", "label": "Value of the subject matter (as stated by the advocate)", "present": true}},
    {"id": "cause_of_action_arose", "kind": "averment", "what": "The cause of action arose on a date", "phrases": ["the cause of action arose on", "the cause of action first arose on", "the cause of action is continuing"], "unlocked_by": {"key": "cause_of_action_date", "label": "Date the cause of action arose (as stated by the advocate)", "present": true}},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "title_conclusion", "kind": "averment", "averment": "it is stated that the plaintiff's title arose as follows: {{title_details}}", "requires": {"key": "title_details", "label": "How the plaintiff's title arose", "present": true}},
    {"id": "possession_conclusion", "kind": "averment", "averment": "it is stated that the plaintiff's possession was as follows: {{possession_history}}", "requires": {"key": "possession_history", "label": "The plaintiff's possession", "present": true}},
    {"id": "dispossession_conclusion", "kind": "averment", "averment": "it is stated that the defendant came into possession, or the plaintiff lost possession, as follows: {{dispossession_details}}", "requires": {"key": "dispossession_details", "label": "How the defendant came into possession or the plaintiff lost it", "present": true}},
    {"id": "court_has_jurisdiction", "kind": "averment", "averment": "it is stated that the basis of territorial jurisdiction is {{territorial_basis}}", "requires": {"key": "territorial_basis", "label": "Basis of territorial jurisdiction (as stated by the advocate)", "present": true}},
    {"id": "value_within_limits", "kind": "averment", "averment": "it is stated that the value of the subject matter of the suit is {{subject_value}}", "requires": {"key": "subject_value", "label": "Value of the subject matter (as stated by the advocate)", "present": true}},
    {"id": "cause_of_action_arose", "kind": "averment", "averment": "it is stated that the cause of action arose on {{cause_of_action_date}}", "requires": {"key": "cause_of_action_date", "label": "Date the cause of action arose (as stated by the advocate)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- Specific Relief Act, 1963 s.5 and s.6: cited by heading only. Not stated in signed text: that s.6 gives a time limit after dispossession (understood: six months), that a s.6 suit need not prove title, that no appeal or review lies against a s.6 decree, that a s.6 suit cannot be brought against the Government. Check each against the bare Act before any is used.
- Limitation for a suit on title and for a suit on prior possession (Limitation Act, 1963; understood: Articles 64 and 65, twelve years). Not stated.
- Order VII rule numbers for the contents of a plaint and for the description of immovable property. Not cited. CPC s.20 and s.26 and bare Order VII were in the draft relevantActs; removed from signed fields (outside the approved set), to be checked against the bare Act.
- Specific Relief Act, 1963 s.5 and s.6: the numbers and headings are kept in relevantActs as understood-certain (approved set allows them only if the draft marks them certain; the draft did not say so explicitly, so Ajay to confirm).
- Order VI Rule 15 (verification): used in the verification template per Ajay's ruling; paragraph ranges are code-supplied.
- The statutory words of s.6 on how the dispossession must have happened (understood: without consent and otherwise than in due course of law). Not used; the form option reads "Prior possession — suit on dispossession".
- Whether a suit for possession on title by a co-owner, or against a tenant after notice, needs a separate pack. Not covered.

## Notes for Ajay

1. Risk. Both bases can be pleaded in one suit. I made the alternative explicit so the Drafter does not blend title facts into a prior-possession plea.
2. Limitation block: only `dispossession_date` (the event date) and `filing_date` are keys; approved by Ajay. Verification is the two-limb form (Order VI Rule 15); `{knowledge_paras}` and `{information_paras}` are code-supplied.
3. Tier B. One Anushka sample with `title_details` empty and basis = Title, to check the Drafter does not call the plaintiff owner.

## Review changes (v2, per Ajay's rulings)

- relevantActs: CPC Order VII, s.20, s.26 dropped (outside the approved set); Specific Relief Act s.5 and s.6 kept, flagged for Ajay.
- Verification replaced by the two-limb Order VI Rule 15 form, closing with {verifierCapacity}.
- Limitation instruction and checklist cue cut to dispossession date and filing date.
- Anushka tier B, Ink L=2, category and court_levels unchanged.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: plaints and suits. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier B |
| Ruling | Specific Relief Act, 1963 sections 5 and 6 stay at section level (approved). The six-month time for section 6 is never stated. Verification is the two-limb Order VI Rule 15 form. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
