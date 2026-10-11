# T-239 b1 #14 bail_bihar_prohibition (HELD)

HELD — not for build until every section of the Bihar Prohibition and Excise Act, 2016 it needs is checked against the bare act.

Status: HELD, not signed. Drafted 12 Oct 2026; reviewed and amended by Ajay. BNSS mapping checked against `config/sections/crpc-to-bnss.json`: CrPC 436 -> 478, 437 -> 480, 439 -> 483, 484 -> 531. **No section number of the Bihar Prohibition and Excise Act, 2016 appears in any signed field.** All of them are under "Verify". State template (Bihar only).

| Field | Value |
|---|---|
| id | `bail_bihar_prohibition` |
| displayName | Bail Application under the Bihar Prohibition and Excise Act, 2016 |
| category | Criminal: bail and custody |
| court_levels | `["special_court_excise", "sessions", "high_court"]` (verify which courts try and bail these offences; see Verify) |
| state | Bihar only |
| Ink | L = 2 |
| Anushka tier | A (liberty); also a state template |
| averments file | `_averments/bail_bihar_prohibition.json`, `inherits: "bail_regular"`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "478", "description": "In what cases bail to be taken" },
      { "number": "480", "description": "When bail may be taken in case of non-bailable offence" },
      { "number": "483", "description": "Special powers of High Court or Court of Session regarding bail" },
      { "number": "531", "description": "Repeal and savings" }
    ]
  },
  {
    "act": "Bihar Prohibition and Excise Act, 2016",
    "sections": []
  }
]
```

Empty `sections` is deliberate: the Drafter may cite only the Act's sections the BRIEF gives (from the FIR). If the loader or the T-239 test rejects an empty array, drop this object instead; do not add numbers.

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant/Accused\nVERSUS\nThe State of Bihar ... Respondent",
  "partyDesignations": [
    { "role": "applicant", "label": "Applicant/Accused" },
    { "role": "respondent", "label": "Respondent (State of Bihar)" }
  ],
  "caseNomenclature": "BAIL APPLICATION No. _____ of [YEAR]\n(In {firDetails}, under the Bihar Prohibition and Excise Act, 2016)"
}
```

## mandatoryClauses

```json
[
  { "id": "fir_details", "name": "FIR / Excise Case Details", "required": true, "description": "FIR or excise case number, police station or excise station, date of registration, and the sections alleged, exactly as the brief gives them." },
  { "id": "allegation", "name": "Allegation", "required": true, "description": "What is alleged (for example possession, transport, sale, manufacture or consumption), the kind and quantity of liquor or intoxicant, and any recovery, each only as the brief gives it." },
  { "id": "custody_status", "name": "Custody Status", "required": true, "description": "Date of arrest, date custody began, and whether judicial or police custody, as the brief gives them. No count of days." },
  { "id": "grounds", "name": "Grounds for Bail", "required": true, "description": "Only the grounds the brief gives, each as the brief puts it." },
  { "id": "undertakings", "name": "Undertakings", "required": true, "description": "Undertakings by the applicant for the future, if released on bail: not to abscond, not to tamper with the evidence or influence witnesses, to appear on every date fixed, and to abide by the conditions imposed. Never a statement of fact." },
  { "id": "earlier_applications", "name": "Earlier Bail Applications", "required": true, "description": "Every earlier bail application in this matter, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say." },
  { "id": "prayer", "name": "Prayer Clause", "required": true, "description": "System part." },
  { "id": "verification", "name": "Verification", "required": true, "description": "System part." },
  { "id": "advocate_details", "name": "Advocate Details", "required": true, "description": "System part." }
]
```

## prayerTemplate

```
PRAYER

In the light of the facts and circumstances stated above, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:

a) Grant bail to the applicant {applicant} in connection with {firDetails}, under {governing_provision}, on such terms and conditions as this Hon'ble Court may deem fit and proper;
b) Direct the release of the applicant on furnishing personal bond with surety to the satisfaction of this Hon'ble Court;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

`{governing_provision}` is filled by code from `court_type` and `procedure_code` (T-245):
- Magistrate (CrPC 437 → BNSS 480): BNSS and BSA `Section 480 of the Bharatiya Nagarik Suraksha Sanhita, 2023`; CrPC and Evidence Act `Section 437 of the Code of Criminal Procedure, 1973`; no choice `[To be confirmed: Section 437 CrPC or Section 480 BNSS]`
- Special Court / Sessions / High Court (CrPC 439 → BNSS 483): BNSS and BSA `Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023`; CrPC and Evidence Act `Section 439 of the Code of Criminal Procedure, 1973`; no choice `[To be confirmed: Section 439 CrPC or Section 483 BNSS]`

The Bihar Prohibition and Excise Act, 2016 sections are cited as they are, unaffected by T-245.

The Magistrate rows stay off (court_levels excludes magistrate) until the Verify item on court competence is closed.

## verificationTemplate

Same text as #13 `bail_ndps` (applicant or pairokar; no "Deponent"). Approved (Ajay): ends "Applicant", not "Deponent" (as #7-12).

## filingChecklist

```json
[
  "Application, with copies as the court's practice requires",
  "Vakalatnama / Memo of Appearance",
  "Copy of FIR / excise case",
  "Copy of seizure list / recovery memo, if served or obtained",
  "Copy of breath-analyser or medical examination report, if any",
  "Copies of remand orders",
  "Custody certificate / proof of custody period",
  "Copies of earlier bail orders in this matter, if any",
  "Copy of charge sheet, if filed",
  "Affidavit of applicant or pairokar, if the court's practice requires",
  "Court fee / stamp as per local rules (cue only)",
  "Identity and address proof of applicant and sureties"
]
```

## promptInstructions

```json
[
  "Draft a Bail Application in a case under the Bihar Prohibition and Excise Act, 2016. Cite as the provision under which bail is sought only the provision given as GOVERNING PROVISION in the case details.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Cite a section of the Bihar Prohibition and Excise Act, 2016 only where the BRIEF gives it, exactly as written there. ACTS gives no section of that Act. Never state a section of that Act from your own knowledge. Where a provision of that Act would normally be cited and the BRIEF does not give it, write [Section — verify before filing]. Do not describe any amendment to the Act or any rule made under it.",
  "Begin PARAGRAPH 1 with the exact FIR or excise case details provided: number, date, police station or excise station, district, and the sections alleged. Use the values EXACTLY as given.",
  "State what is alleged (possession, transport, sale, manufacture, consumption or other), the kind and quantity of liquor or intoxicant, and any recovery, only as the BRIEF gives each. Do not convert quantities. Do not say the case is one of consumption only, that it is a first offence, that the offence is bailable, compoundable or punishable with fine only, or that no breath or blood test was done, unless the BRIEF says so.",
  "State the custody status as the BRIEF gives it: the date of arrest, the date from which the applicant has been in custody, and whether that custody is judicial or police. Where the BRIEF gives the date of arrest and the date custody began as two dates, keep them as two dates. Do not work out the number of days in custody.",
  "Set out the grounds for bail that the BRIEF gives, and no others. Do not assert a ground (for example no criminal history, no recovery from the applicant, recovery from a place not in the applicant's possession, parity with a co-accused, the applicant's presence only as a passenger or bystander) unless the BRIEF states it. State each ground as the BRIEF puts it: do not add a reason or a detail to it.",
  "Do not write about confiscation of a vehicle, premises or property; that is not this application.",
  "Give the standard undertakings as undertakings by the applicant for the future, never as facts and never as undertakings by the advocate: the applicant undertakes that, if released on bail, the applicant will not abscond, will not tamper with the evidence, will not make any inducement, threat or promise to any witness or other person acquainted with the facts of the case, will appear on every date fixed, and will abide by every condition this Hon'ble Court imposes.",
  "State every earlier bail application in this matter that the BRIEF mentions: the court it was made to, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions no earlier bail application, do not say that this is the first application or that none is pending; write [To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result].",
  "Do not name any judgment. Where an authority on bail would normally be cited, write [Authority — add if relied upon].",
  "Use formal, respectful legal language appropriate for Indian courts.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| `fir_number` | FIR / Excise Case Number | text | yes | Cause title, para 1 |
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | Procedure switch (T-245), `{governing_provision}` |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `police_station` | Police Station / Excise Station | text | yes | Para 1 |
| `sections_alleged` | Sections alleged (as in the FIR) | text | yes | Only source of the Act's sections |
| `allegation_type` | What is alleged | select: possession / transport / sale / manufacture / consumption / other / not instructed | yes | allegation; unlocks consumption_only |
| `liquor_quantity` | Kind and quantity of liquor (as in seizure list) | text | no | allegation; no conversion |
| `recovery_status` | Recovery from the applicant (as instructed) | text | no | bail_regular key |
| `medical_test_status` | Breath / blood test (as instructed) | select: done / not done / not known | no | Unlocks no_medical_test |
| `previous_prohibition_cases` | Earlier cases under this Act against the applicant | textarea | no | Unlocks first_offence_under_act |
| `arrest_date`, `custody_since`, `currently_in_custody` | Custody | as #13 | yes / no / yes | custody_status |
| `antecedents`, `earlier_bail_applications`, `grounds_for_bail` | as bail_regular | | | |
| `court_type`, `court_name` | Court (state fixed to Bihar) | as bail_regular | yes | `{governing_provision}`, overlay |
| applicant and verifier keys | as #13 | | | |

## _averments (`_averments/bail_bihar_prohibition.json`)

```json
{
  "pack": "bail_bihar_prohibition",
  "inherits": "bail_regular",
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "consumption_only",
      "kind": "averment",
      "what": "The allegation is of consumption only",
      "phrases": ["only a case of consumption", "alleged only to have consumed liquor", "no recovery, only consumption", "sirf sharab peene ka aarop"],
      "unlocked_by": { "key": "allegation_type", "label": "What is alleged", "equals": ["consumption"] }
    },
    {
      "id": "first_offence_under_act",
      "kind": "averment",
      "what": "First offence under the Act / no earlier case under it",
      "phrases": ["first offence under the Act", "no previous case under the Prohibition Act", "has never been booked under the Excise Act", "pehli baar pakda gaya"],
      "unlocked_by": { "key": "previous_prohibition_cases", "label": "Earlier cases under this Act against the applicant", "equals": ["none", "nil", "no", "koi nahi"] }
    },
    {
      "id": "no_medical_test",
      "kind": "averment",
      "what": "No breath-analyser or blood test was done",
      "phrases": ["no breath analyser test was conducted", "no blood test was done", "no medical examination to show consumption", "breath test nahi hua"],
      "unlocked_by": { "key": "medical_test_status", "label": "Breath / blood test", "equals": ["not done"] }
    },
    {
      "id": "liquor_quantity",
      "kind": "averment",
      "what": "The kind or quantity of liquor",
      "phrases": ["a small quantity of liquor", "for personal consumption", "only a few bottles", "thodi si sharab"],
      "unlocked_by": { "key": "liquor_quantity", "label": "Kind and quantity of liquor", "present": true }
    },
    {
      "id": "fine_only_offence",
      "kind": "submission",
      "what": "The offence is punishable with fine only, compoundable or bailable under the Act",
      "phrases": ["punishable with fine only", "the offence is compoundable", "can be released on payment of penalty", "jurmana dekar chhoot"],
      "unlocked_by": null
    },
    {
      "id": "passenger_or_bystander",
      "kind": "averment",
      "what": "The applicant was only a passenger, driver or bystander",
      "phrases": ["was merely a passenger", "was only the driver", "was only present", "sirf sawari tha"],
      "unlocked_by": null
    }
  ],
  "allowed": [
    { "id": "consumption_only", "kind": "averment", "averment": "according to the FIR, the allegation against the applicant is of consumption of liquor", "requires": { "key": "allegation_type", "label": "What is alleged", "equals": ["consumption"] } },
    { "id": "first_offence_under_act", "kind": "averment", "averment": "no earlier case under the Bihar Prohibition and Excise Act, 2016 is pending or decided against the applicant", "requires": { "key": "previous_prohibition_cases", "label": "Earlier cases under this Act against the applicant", "equals": ["none", "nil", "no", "koi nahi"] } },
    { "id": "no_medical_test", "kind": "averment", "averment": "no breath-analyser or blood test of the applicant was conducted", "requires": { "key": "medical_test_status", "label": "Breath / blood test", "equals": ["not done"] } },
    { "id": "liquor_quantity", "kind": "averment", "averment": "the liquor alleged to have been recovered is {{liquor_quantity}}", "requires": { "key": "liquor_quantity", "label": "Kind and quantity of liquor", "present": true } }
  ]
}
```

Pairing check: consumption_only, first_offence_under_act, no_medical_test, liquor_quantity each have a twin; fine_only_offence and passenger_or_bystander are null (no twin needed). As in #13, recommend overriding inherited `woman_proviso` / `under_sixteen` to null where the court is not a Magistrate.

## T-200 cue map entries

| Pack | Clause id | Cue set | Mark proposed |
|---|---|---|---|
| `bail_bihar_prohibition` | `earlier_applications` | EA-standard (T-237) | Approve |
| `bail_bihar_prohibition` | `undertakings` | undertaking cue (any `undertak`, `वचन`, `आश्वासन`) | Approve |

## Verify (not in signed text)

Every item is a provision of the Bihar Prohibition and Excise Act, 2016 (as amended, including the 2018 and 2022 amendments) or its rules, to be checked against the current bare act. No candidate numbers given on purpose.
- Section(s) making offences under the Act cognizable and non-bailable, and any bail restriction or Public Prosecutor hearing requirement that overrides the BNSS.
- Penal sections for manufacture, possession, transport, sale; for consumption; for permitting premises or vehicles to be used.
- The amendment that lets a first consumption offence end with a fine or penalty, and who decides it (Executive Magistrate or court); whether such a case ever needs this application.
- Constitution or designation of Special Courts under the Act, and whether a Judicial Magistrate has any bail role (decides court_levels and the Magistrate rows of `{governing_provision}`).
- Confiscation provisions (kept out of this template on purpose).
- Presumption / burden-of-proof provisions that a bail court weighs.
- Whether "excise case" numbering is separate from FIR numbering at Madh Nishedh police stations (form label).

## Notes for Ajay

- Blocker for sign: with no section of the Act verified, the application cannot cite the Act's bail restriction at all. Acceptable for batch 1 only if you agree the BNSS provision plus the FIR's own sections is enough. Otherwise hold #14 until the bare act is checked.
- Risk: old/new switch text same as #13 (contested reading of s.531). Same decision applies.
- Risk: the 2022 amendment area changes often; a dated bare-act check (`relevantActs` date) is needed at sign and at each release.
- Acceptable: Hindi drafts for Bihar are the main demand; English only in batch 1 per T-239.


## Ajay review and sign-off (12 Oct 2026 IST)

Amended before signing: the old/new law text is the T-245 S-text and P-text (345bd24), word for word; `{governing_provision}` and the T-245 keys `offence_date`, `fir_date`, `procedure_code` are used as T-245 gives them. Every BNSS/CrPC/IEA/BSA pair is in the signed tables (`crpc-to-bnss.json`, `iea-to-bsa.json`); the IEA to BSA table is being corrected under T-250, and any pair in this spec that T-250 changes comes back to me. The cue sets for `earlier_applications` are EA-standard (T-237, 909a49c), except EA-appeal for #15: all of [any: `bail`, `जमानत`, `ज़मानत`] and [any: `earlier`, `previous`, `prior`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `वापस`].

The "Notes" and "Verify" sections are the drafter's reasoning, kept for the record. They are not build text. Nothing under "Verify" is signed; it stays out until checked against the bare act. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| Spec as amended | HELD |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | **HELD.** Not for build until every section of the Bihar Prohibition and Excise Act, 2016 that the pack needs is checked against the bare act. Everything else is approved so that the work is not repeated when it is released. |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live (pack `_meta` rule) | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
