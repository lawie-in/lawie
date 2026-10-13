# T-239 b1 #41 probate_petition_s276 (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Reviewed against Ajay's rulings. Cites only what is stated at section (or Order and Rule) level; every doubt is under Verify and left out of every signed field. No judgment named. No amount of fee or duty. Ink L = 2. Limitation block included (mandatory for #41); the Drafter says nothing on limitation and the checklist cue says verify.

| Field | Value |
|---|---|
| id | `probate_petition_s276` |
| displayName | Petition for Probate of a Will (Indian Succession Act, section 276) |
| category | Succession and probate |
| court_levels | `["district_court"]` |
| Ink | L = 2 |
| Anushka tier | A (limitation and estate at stake) — every sample twice: full facts, facts missing |
| averments file | `_averments/probate_petition_s276.json`, `inherits: null`, `key_map: {}` (the `_default.json` entries lie under it) |

## relevantActs

```json
[
  {
    "act": "Indian Succession Act, 1925",
    "sections": [
      {"number": "276", "description": "Petition for probate"}
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{petitioner} ... Petitioner",
  "partyDesignations": [
    {"role": "petitioner", "label": "Petitioner"}
  ],
  "caseNomenclature": "PROBATE CASE No. _____ of [YEAR]\nIn the matter of the will of {testator_name}, deceased\nPETITION FOR PROBATE UNDER SECTION 276 OF THE INDIAN SUCCESSION ACT, 1925"
}
```

## mandatoryClauses

```json
[
  {"id": "petitioner_particulars", "name": "Petitioner", "required": true, "description": "Name, parentage, age, address and occupation of the petitioner, as the brief gives them, and the capacity in which the petitioner petitions as the advocate states it."},
  {"id": "testator_death", "name": "The Testator and the Date of Death", "required": true, "description": "The name of the testator, and the date and place of death, as the brief gives them; else the blanks."},
  {"id": "will_annexed", "name": "The Will Annexed", "required": true, "description": "The will (and any codicil) annexed: its date, and the fact that the original is filed or to be produced, as the brief gives it. Whether it is the last will, only as the petitioner states it ('It is stated that ...')."},
  {"id": "execution", "name": "Execution of the Will", "required": true, "description": "The execution of the will (date, place, attesting witnesses) only as the petitioner states it and as the brief gives it; never that it was duly executed unless the form records that statement."},
  {"id": "executor", "name": "Executor Named", "required": true, "description": "Whether the petitioner is the executor named in the will, only as the form records it; else the blank."},
  {"id": "assets", "name": "Assets Likely to Come to the Petitioner's Hands", "required": true, "description": "The amount of the assets likely to come to the petitioner's hands, and the schedule of assets, only as the advocate gives them; else the blank. No fee computed."},
  {"id": "next_of_kin", "name": "Next of Kin and Persons Interested", "required": true, "description": "The next of kin and other persons interested in the estate, with relationship and residence, as the brief lists them. Not asserted to be complete unless the petitioner so states."},
  {"id": "jurisdiction", "name": "Jurisdiction", "required": true, "description": "The basis of the court's territorial jurisdiction only as the advocate states it, as 'It is stated that ...'; else the blank."},
  {"id": "dates", "name": "Dates", "required": true, "description": "The dates the brief gives: of death, of the will, and of filing. No period is stated or computed and nothing is said on limitation."},
  {"id": "earlier_proceedings", "name": "Other Proceedings", "required": true, "description": "Every other probate, letters of administration or succession certificate application, any caveat, any other will, and any other proceeding on the estate, with court, number, date and result as the brief gives them; or the blank where the brief is silent."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "System part."},
  {"id": "verification", "name": "Verification", "required": true, "description": "System part."}
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Grant probate of the will dated {will_date} of {testator_name}, deceased, annexed to this petition, to the petitioner, under section 276 of the Indian Succession Act, 1925;
b) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

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
  "Petition (original + copy)",
  "Original will (and codicil, if any), to be produced as the court directs",
  "Death certificate of the testator",
  "Schedule of the assets of the estate, as the petitioner gives them",
  "List of the next of kin and other persons interested, with addresses",
  "Affidavits of the attesting witnesses, if the court requires them: check (verify)",
  "Verification of the petition by the petitioner and a witness, as the Act requires: check (verify)",
  "Citation or notice to the persons interested and publication, as the court directs: check (verify)",
  "Steps before the Registrar, if the court so directs: check (verify)",
  "Whether a caveat has been lodged in respect of the estate: check (verify)",
  "Limitation for a probate petition: verify (not stated by Lawie)",
  "Check the period of limitation and the time spent in obtaining the certified copy (against the Limitation Act, 1963 and the Act under which this is brought: verify); if late, file an application for condonation of delay.",
  "Vakalatnama (if not already on record)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft a petition for probate of a will under section 276 of the Indian Succession Act, 1925, by a person who petitions as executor or as another person entitled, as the BRIEF gives. The petition sets out these particulars, as the form lists them: the date of the testator's death; the will annexed; its execution; the amount of the assets likely to come to the petitioner's hands; and, where the petitioner is the executor, that the petitioner is the executor named. Cite only section 276. Do not cite a sub-section or any other section of the Act.",
  "State each particular only as the BRIEF gives it. Where a particular is not given, write the blank: [To be confirmed: <the particular>]. Never assume a date, a place, a witness, an asset or a relative.",
  "Never assert that the annexed document is the last will, is genuine, or was duly executed, or that the testator was of sound mind or acted freely. Write any such matter only where the BRIEF or the form records it as the petitioner's statement, and then only as 'It is stated that ...'. Give the names of attesting witnesses only as the BRIEF gives them.",
  "Write that the petitioner is the executor named in the will only where the form records it. The amount of the assets is exactly as the BRIEF gives it; the assets are listed as the advocate gives them. Do not total, value, convert or compute any amount. State no court fee, stamp duty or any other amount of fee or duty.",
  "List the next of kin and other persons interested only as the BRIEF lists them, with relationship and residence as given. Do not write that the list is complete, that there are no other heirs, or that there is no dispute, unless the form records the petitioner's statement.",
  "Do not assert jurisdiction. Where the BRIEF gives the basis of territorial jurisdiction, write 'It is stated that this Court has jurisdiction on the basis that ...' in the BRIEF's words; otherwise [To be confirmed: the basis of the Court's territorial jurisdiction]. Do not cite a section for it.",
  "Give the dates the BRIEF gives (of the order, decree or event, of the application for the certified copy, of receipt of the certified copy, and of filing). Do not state, compute or comment on the period of limitation, and do not say that the filing is within time, within limitation or delayed. Where the BRIEF says the filing is late, add [To be confirmed: application for condonation of delay to be filed with this], and do not argue sufficient cause unless the BRIEF gives the reason.",
  "Say nothing about limitation, delay or the time for filing a petition for probate. Do not write that a time limit applies or does not apply.",
  "State every other probate, letters of administration or succession certificate application, every caveat, every other will and every other proceeding on the estate that the BRIEF mentions, with court, number, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any other will, application, caveat or proceeding on the estate exists, and where]. Never write that this is the only will, the first petition, or that none is pending.",
  "Registrar, citation and publication steps are not drafted. They are checklist cues only.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| petitioner_name / petitioner_parentage / petitioner_age / petitioner_address / petitioner_occupation | Petitioner particulars | text / text / number / textarea / text | yes | verification |
| petitioner_capacity | Petitioner petitions as (advocate states) | select (Executor named in the will; Other person entitled, specify) | yes | executor clause, averment unlock |
| testator_name | Name of the testator | text | yes | nomenclature, prayer |
| death_date / death_place | Date and place of death | date / text | yes | testator clause |
| will_date / codicil_details | Date of the will; codicil (date), if any | date / text | yes | will clause, prayer |
| will_original_position | Original will | select (Filed with the petition; To be produced as the court directs; Not stated) | no | will clause |
| last_will_statement | Petitioner's statement on the will | select (Petitioner states this is the last will of the testator; Not stated) | no | averment unlock |
| execution_statement | Petitioner's statement on execution | select (Petitioner states the will was duly executed; Not stated) | no | averment unlock |
| execution_details / witnesses_names | Execution: date, place; attesting witnesses (as given) | textarea / textarea | no | execution clause |
| assets_amount / assets_schedule | Amount of assets likely to come to the petitioner's hands; schedule of assets (as the advocate gives them) | text / list of rows | yes | assets clause |
| next_of_kin_rows | Next of kin and persons interested (one row per person: name; relationship; residence) | list of rows | yes | next of kin clause |
| jurisdiction_basis | Basis of territorial jurisdiction (as the advocate states it) | textarea | no | averment unlock |
| order_date | Date of the order, decree or event | date | no | limitation block |
| certified_copy_applied_date | Date of application for the certified copy | date | no | limitation block |
| certified_copy_received_date | Date of receipt of the certified copy | date | no | limitation block |
| filing_date | Date of filing | date | no | limitation block |
| earlier_proceedings | Other probate / administration / certificate applications, caveats, other wills (court, number, date, result) | textarea | no | disclosure |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "probate_petition_s276",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "last_will", "kind": "averment", "what": "The document is the last will of the testator", "phrases": ["is the last will and testament", "is the last will of the deceased", "this is the only will", "is the genuine will", "aakhri wasiyat hai"], "unlocked_by": {"key": "last_will_statement", "label": "Petitioner's statement on the will", "equals": ["petitioner states this is the last will of the testator"]}},
    {"id": "duly_executed", "kind": "averment", "what": "The will was duly executed", "phrases": ["was duly executed", "was validly executed", "was executed in accordance with law", "is a genuine will", "is genuine", "vidhivat nishpadit"], "unlocked_by": {"key": "execution_statement", "label": "Petitioner's statement on execution", "equals": ["petitioner states the will was duly executed"]}},
    {"id": "sound_mind_free_will", "kind": "averment", "what": "The testator was of sound mind and acted freely", "phrases": ["of sound and disposing mind", "in full senses", "without any coercion", "without undue influence", "swasth chitt"], "unlocked_by": null},
    {"id": "executor_named", "kind": "averment", "what": "The petitioner is the executor named in the will", "phrases": ["is the executor named in the will", "the petitioner is the sole executor", "appointed as executor by the testator"], "unlocked_by": {"key": "petitioner_capacity", "label": "Petitioner petitions as", "equals": ["executor named in the will"]}},
    {"id": "assets_amount_stated", "kind": "averment", "what": "The amount of assets likely to come to the petitioner's hands", "phrases": ["assets likely to come to the hands of the petitioner are valued at", "the estate is valued at", "the estate is worth", "sampatti ka mulya"], "unlocked_by": {"key": "assets_amount", "label": "Amount of assets likely to come to the petitioner's hands", "present": true}},
    {"id": "no_dispute_no_other_heirs", "kind": "averment", "what": "No dispute and no other heirs", "phrases": ["there is no dispute", "no other heirs", "no objection from any person", "the only legal heirs are"], "unlocked_by": null},
    {"id": "within_limitation", "kind": "submission", "what": "The matter is within limitation", "phrases": ["is within limitation", "filed within the period of limitation", "there is no delay", "miyaad ke andar hai"], "unlocked_by": null},
    {"id": "court_has_jurisdiction", "kind": "submission", "what": "The court has territorial jurisdiction", "phrases": ["this court has jurisdiction", "this hon'ble court has territorial jurisdiction", "the court has jurisdiction to entertain", "is within the jurisdiction of this court", "adalat ka kshetradhikar hai"], "unlocked_by": {"key": "jurisdiction_basis", "label": "Basis of territorial jurisdiction (as the advocate states it)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending (suppression risk)", "phrases": ["no other suit, petition or complaint is pending", "no similar proceedings have been filed", "has not filed any other case on the same cause of action", "this is the first application", "pehle koi case nahi kiya"], "unlocked_by": {"key": "earlier_proceedings", "label": "Other proceedings on the will, the estate or the same assets", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "last_will", "kind": "averment", "averment": "it is stated that the annexed will is the last will of the testator, as the petitioner's statement", "requires": {"key": "last_will_statement", "label": "Petitioner's statement on the will", "equals": ["petitioner states this is the last will of the testator"]}},
    {"id": "duly_executed", "kind": "averment", "averment": "it is stated that the will was duly executed, as the petitioner's statement", "requires": {"key": "execution_statement", "label": "Petitioner's statement on execution", "equals": ["petitioner states the will was duly executed"]}},
    {"id": "executor_named", "kind": "averment", "averment": "it is stated that the petitioner is the executor named in the will, as the petitioner's statement", "requires": {"key": "petitioner_capacity", "label": "Petitioner petitions as", "equals": ["executor named in the will"]}},
    {"id": "assets_amount_stated", "kind": "averment", "averment": "the petitioner states that the amount of the assets likely to come to the petitioner's hands is {{assets_amount}}", "requires": {"key": "assets_amount", "label": "Amount of assets likely to come to the petitioner's hands", "present": true}},
    {"id": "court_has_jurisdiction", "kind": "submission", "averment": "it is stated that this Court has jurisdiction on the basis that {{jurisdiction_basis}}", "requires": {"key": "jurisdiction_basis", "label": "Basis of territorial jurisdiction (as the advocate states it)", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending", "requires": {"key": "earlier_proceedings", "label": "Other proceedings on the will, the estate or the same assets", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The full list of particulars in section 276 (understood to include, where the petition is to a District Judge, the testator's fixed place of abode or property within the court's jurisdiction) and their letters and sub-sections. The pack cites only 'section 276' and lists the five particulars I am sure of.
- The verification of the petition by the petitioner and a witness to the will, and its form (understood to be in section 281 or section 276 itself). Checklist cue only.
- Whether limitation applies to a petition for probate and from when (many readings: no fixed period; the Limitation Act, 1963 article for such petitions). The Drafter says nothing, as instructed; the cue says verify.
- Citation and publication, the Registrar's role and caveat procedure (sections and rules). Checklist cues only.
- Whether the High Court's original side takes probate petitions in the named courts; court_levels is limited to the district court.
- Evidence of execution of a will (attestation and proof). Not cited; no Evidence Act or BSA citation in this civil pack.
- True-to-knowledge / true-to-information split in the verification (understood as a CPC Order VI Rule 15 practice): not cited; the verification stays in the #12 pattern.

## Notes for Ajay

1. Risk. The limitation block is used as instructed and the checklist adds a probate-specific cue. The block's condonation language is generic; if you think it reads wrongly for probate, say so and I will cut the condonation sentence for this id only (the exact text was fixed by the brief).
2. Risk. Per Ajay's ruling the Drafter never asserts the will is genuine, duly executed or the last will, except as 'It is stated that ...' from the BRIEF or the form. A will petition invites the Drafter to certify the will. The banned list stops 'duly executed', 'last will', 'sound mind', 'no other heirs' unless the form records the petitioner's statement.
3. Amount of assets is a figure the Act asks for; it is a form field, never computed, and no fee follows from it in the pack.
4. Tier A: two Anushka samples: full facts, and execution and next-of-kin rows empty (the Drafter must write blanks, not witnesses or relatives).


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Succession and probate. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | The will is never called genuine, duly executed or the last will, except as "It is stated that ..." from the petitioner's statement. The generic condonation sentence in the limitation block stays; the probate cue to check the period (verify) is added. |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
