# T-239 b1 #13 bail_ndps (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. BNSS mapping checked against `config/sections/crpc-to-bnss.json`: CrPC 439 -> BNSS 483, CrPC 484 -> BNSS 531. NDPS section numbers below are from knowledge of the bare act (not in any repo table): 19, 24, 27A, 36A, 37 as whole sections only. Every sub-section and every other NDPS section is under "Verify".

| Field | Value |
|---|---|
| id | `bail_ndps` |
| displayName | Bail Application in NDPS Case |
| category | Criminal: bail and custody |
| court_levels | `["special_court_ndps", "high_court"]` |
| Ink | L = 2 |
| Anushka tier | A (liberty) |
| averments file | `_averments/bail_ndps.json`, `inherits: "bail_regular"`, `key_map: {}` (form keys reuse bail_regular's ledger keys) |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      { "number": "483", "description": "Special powers of High Court or Court of Session regarding bail" },
      { "number": "531", "description": "Repeal and savings" }
    ]
  },
  {
    "act": "Narcotic Drugs and Psychotropic Substances Act, 1985",
    "sections": [
      { "number": "19", "description": "Punishment for embezzlement of opium by cultivator" },
      { "number": "24", "description": "Punishment for external dealings in narcotic drugs and psychotropic substances in contravention of section 12" },
      { "number": "27A", "description": "Punishment for financing illicit traffic and harbouring offenders" },
      { "number": "36A", "description": "Offences triable by Special Courts" },
      { "number": "37", "description": "Offences to be cognizable and non-bailable (limits on grant of bail)" }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant/Accused\nVERSUS\n{respondent} ... Respondent",
  "partyDesignations": [
    { "role": "applicant", "label": "Applicant/Accused" },
    { "role": "respondent", "label": "Respondent (State of {state}, or the investigating agency as the brief names it)" }
  ],
  "caseNomenclature": "BAIL APPLICATION No. _____ of [YEAR]\nUnder {governing_provision}\n(In {firDetails}, under the Narcotic Drugs and Psychotropic Substances Act, 1985)"
}
```

## mandatoryClauses

```json
[
  { "id": "fir_details", "name": "FIR / Complaint Details", "required": true, "description": "FIR or crime number, agency or police station, date of registration, and the NDPS Act sections alleged, exactly as the brief gives them." },
  { "id": "contraband_and_quantity", "name": "Contraband and Quantity", "required": true, "description": "The substance, the quantity alleged and the quantity class (small, intermediate or commercial), each only as the brief gives it; the blank where it does not. Never a statement that the quantity is not commercial." },
  { "id": "custody_status", "name": "Custody Status", "required": true, "description": "Date of arrest, date custody began, and whether judicial or police custody, as the brief gives them. No count of days." },
  { "id": "section_37", "name": "Section 37 NDPS Act", "required": true, "description": "Where the brief says commercial quantity or an offence under section 19, 24 or 27A: the twin conditions addressed as submissions on the grounds the brief gives, or the blank. Where the brief gives small or intermediate quantity and no such offence: that section 37's conditions for those cases do not apply. Where the brief is silent: the blank, and no statement either way." },
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

a) Grant regular bail to the applicant {applicant} in connection with {firDetails}, under {governing_provision}, on such terms and conditions as this Hon'ble Court may deem fit and proper;
b) Direct the release of the applicant on furnishing personal bond with surety to the satisfaction of this Hon'ble Court;
c) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.

And for this act of kindness, the applicant shall ever pray.
```

`{governing_provision}` is filled by code from `procedure_code` (T-245). Pair: Special Court / Court of Session / High Court, CrPC 439 → BNSS 483 (Magistrate, CrPC 437 → BNSS 480, is not in `court_levels`):
- BNSS and BSA: `Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023`
- CrPC and Evidence Act: `Section 439 of the Code of Criminal Procedure, 1973`
- no choice: `[To be confirmed: Section 439 CrPC or Section 483 BNSS]`

The NDPS Act sections are cited as they are, unaffected by T-245.

## verificationTemplate

Departs from bail_regular's "Deponent" line on purpose (T-136, outside item 1: applicant in custody ordinarily does not sign; the pairokar does). Approved (Ajay): ends "Applicant", not "Deponent" (as #7-12).

```
VERIFICATION

I, {verifierName}, {verifierRelation} {verifierParentName}, aged about {verifierAge} years, resident of {verifierAddress}, {verifierCapacity}, do hereby verify that the contents of paragraphs 1 to {lastParagraph} of the above application are true and correct to the best of my knowledge and belief and on the basis of {knowledgeSource}. No part of it is false and nothing material has been concealed therein.

Verified at {place} on this {date}.

(Signature)
{verifierName}
{verifierCapacity}
```

`{verifierCapacity}`: "the applicant" or "pairokar of the applicant, who is in custody". `{knowledgeSource}`: "personal knowledge" or "the instructions of the applicant and the case record".

## filingChecklist

```json
[
  "Application, with copies as the court's practice requires",
  "Vakalatnama / Memo of Appearance",
  "Copy of FIR or complaint",
  "Copy of seizure / recovery memo (as served or obtained)",
  "Copy of FSL / chemical examiner's report, if received",
  "Copies of remand orders",
  "Custody certificate / proof of custody period",
  "Copies of earlier bail orders in this matter, if any",
  "Copy of charge sheet or complaint, if filed",
  "Copy of application served on the Public Prosecutor (Section 37 hearing), as the court's practice requires",
  "Affidavit of applicant or pairokar, if the court's practice requires",
  "Court fee / stamp as per local rules (cue only)",
  "Identity and address proof of applicant and sureties"
]
```

## promptInstructions

```json
[
  "Draft a Regular Bail Application in a case under the Narcotic Drugs and Psychotropic Substances Act, 1985, before the Special Court or the High Court. Cite only the provision given as GOVERNING PROVISION in the case details as the provision under which bail is sought, in the heading, the opening paragraph and the prayer.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Where the BRIEF says the application is before a Special Court, cite the bail provision as GOVERNING PROVISION gives it, and NDPS section 36A as the BRIEF gives the court.",
  "Begin PARAGRAPH 1 with the exact FIR or crime details provided: number, date, police station or agency, district, and the NDPS Act sections alleged. Use the values EXACTLY as given.",
  "State the substance, the quantity alleged and the quantity class (small, intermediate or commercial) only as the BRIEF gives each, as the prosecution's case: 'according to the prosecution, the quantity alleged is <class> quantity'. Do not work out the class from the weight. Never write that the quantity is not commercial, below commercial or less than commercial. Where the BRIEF does not give the class, write [To be confirmed: quantity class alleged (small, intermediate or commercial) and its source in the record].",
  "Section 37: where the BRIEF says the quantity alleged is commercial, or that an offence under Section 19, 24 or 27A is alleged, address both conditions as submissions: that there are reasonable grounds for believing that the applicant is not guilty of such offence, and that the applicant is not likely to commit any offence while on bail. Base each only on grounds the BRIEF gives; where it gives none, write [To be confirmed: grounds for the satisfaction required by Section 37 NDPS Act]. Where the BRIEF says the quantity is small or intermediate and that no offence under Section 19, 24 or 27A is alleged, you may submit that the conditions of Section 37 for those cases do not apply, and nothing more. Where the BRIEF says neither, do not say whether Section 37 applies.",
  "State the custody status as the BRIEF gives it: the date of arrest, the date from which the applicant has been in custody, and whether that custody is judicial or police. Where the BRIEF gives the date of arrest and the date custody began as two dates, keep them as two dates. Do not work out the number of days in custody.",
  "Set out the grounds for bail that the BRIEF gives, and no others. Do not assert a ground (for example no criminal history, no recovery from the applicant, absence of conscious possession, a departure from the procedure for search, seizure or sampling, delay in the chemical examiner's report, parity with a co-accused) unless the BRIEF states it. State each ground as the BRIEF puts it: do not add a reason or a detail to it. Cite a section of the NDPS Act only if it is in ACTS or the BRIEF.",
  "Give the standard undertakings as undertakings by the applicant for the future, never as facts and never as undertakings by the advocate: the applicant undertakes that, if released on bail, the applicant will not abscond, will not tamper with the evidence, will not make any inducement, threat or promise to any witness or other person acquainted with the facts of the case, will appear on every date fixed, and will abide by every condition this Hon'ble Court imposes.",
  "State every earlier bail application in this matter that the BRIEF mentions: the court it was made to, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions no earlier bail application, do not say that this is the first application or that none is pending; write [To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result].",
  "This is not a default bail application. Where the BRIEF seeks release because the investigation was not completed in time, write [To be confirmed: whether a default bail application is intended instead] and do not state any period of detention allowed by law.",
  "Do not name any judgment. Where an authority on bail would normally be cited, write [Authority — add if relied upon].",
  "Use formal, respectful legal language appropriate for Indian courts.",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| `fir_number` | FIR / Crime Number | text | yes | Cause title, para 1 |
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | Procedure switch (T-245), `{governing_provision}` |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `agency` | Police Station / Agency | text | yes | Para 1, respondent name |
| `ndps_sections` | NDPS Act sections alleged (as in FIR) | text | yes | Para 1; only source of NDPS offence sections |
| `substance` | Substance alleged | text | yes | contraband_and_quantity |
| `quantity_alleged` | Quantity alleged (as in seizure memo) | text | no | contraband_and_quantity; no conversion |
| `quantity_class` | Quantity class alleged | select: small / intermediate / commercial / not stated in record | yes | Section 37 branch; never inferred |
| `s19_24_27a_alleged` | Is an offence under s.19, 24 or 27A alleged? | select: yes / no / not known | yes | Section 37 branch |
| `recovery_status` | Recovery from the applicant (as instructed) | text | no | bail_regular ledger key |
| `arrest_date` | Date of arrest | date | yes | custody_status |
| `custody_since` | In custody since | date | no | custody_status |
| `currently_in_custody` | Custody type | select (bail_regular options) | yes | custody_status |
| `investigation_status` | Investigation / charge sheet status (as instructed) | text | no | grounds; rule 8 |
| `s37_grounds` | Grounds for the s.37 satisfaction (as instructed) | textarea | no | Unlocks s37_twin_conditions_met |
| `possession_denied` | Does the applicant deny conscious possession? | select: yes / no / not instructed | no | Unlocks conscious_possession_denied |
| `search_seizure_defects` | Departures from search/seizure/sampling procedure (as instructed) | textarea | no | Unlocks search_seizure_defects |
| `antecedents` | Criminal antecedents | textarea | no | bail_regular key |
| `earlier_bail_applications` | Earlier bail applications in this matter | textarea | no | earlier_applications; bail_regular key |
| `grounds_for_bail` | Grounds for bail | textarea | yes | grounds |
| `state`, `court_type`, `court_name` | Court | as bail_regular | yes | Cause title, court-rules overlay |
| `applicant_name`, `father_name`, `applicant_age`, `address`, `applicant_occupation` | Applicant | as bail_regular | name, parentage, address yes | Cause title, verification |
| `verifier_capacity` | Who verifies | select: applicant / pairokar | yes | verificationTemplate |
| `pairokar_name`, `pairokar_relation` | Pairokar | text | if pairokar | verificationTemplate |

## _averments (`_averments/bail_ndps.json`)

```json
{
  "pack": "bail_ndps",
  "inherits": "bail_regular",
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "not_commercial_quantity",
      "kind": "averment",
      "what": "The quantity is not commercial (negative form; never written)",
      "phrases": ["not a commercial quantity", "does not fall within commercial quantity", "less than commercial quantity", "below commercial quantity", "falls short of commercial quantity", "commercial quantity nahi hai"],
      "unlocked_by": null
    },
    {
      "id": "quantity_class",
      "kind": "averment",
      "what": "The quantity class of the contraband",
      "phrases": ["small quantity", "intermediate quantity", "commercial quantity", "chhoti matra", "vyavsayik matra"],
      "unlocked_by": { "key": "quantity_class", "label": "Quantity class alleged", "not_in": ["not stated in record", "not stated", "not known", "unknown"] }
    },
    {
      "id": "s37_not_attracted",
      "kind": "submission",
      "what": "Section 37 does not apply",
      "phrases": ["rigours of section 37 are not attracted", "bar of section 37 does not apply", "twin conditions do not apply", "section 37 is not applicable", "dhara 37 lagu nahi"],
      "unlocked_by": { "all_of": [
        { "key": "quantity_class", "label": "Quantity class alleged", "equals": ["small", "intermediate"] },
        { "key": "s19_24_27a_alleged", "label": "Offence under s.19, 24 or 27A alleged", "equals": ["no"] }
      ] }
    },
    {
      "id": "s37_twin_conditions_met",
      "kind": "submission",
      "what": "There are reasonable grounds for believing the applicant is not guilty and not likely to offend on bail",
      "phrases": ["reasonable grounds for believing that the applicant is not guilty", "not likely to commit any offence while on bail", "twin conditions are satisfied"],
      "unlocked_by": { "key": "s37_grounds", "label": "Grounds for the s.37 satisfaction", "present": true }
    },
    {
      "id": "conscious_possession_denied",
      "kind": "averment",
      "what": "The applicant was not in conscious possession",
      "phrases": ["not in conscious possession", "no conscious possession", "had no knowledge of the contraband", "maal ki jaankari nahi thi"],
      "unlocked_by": { "key": "possession_denied", "label": "Does the applicant deny conscious possession", "equals": ["yes"] }
    },
    {
      "id": "search_seizure_defects",
      "kind": "averment",
      "what": "The search, seizure or sampling departed from the statutory procedure",
      "phrases": ["mandatory provisions were not complied with", "no option of search before a gazetted officer or magistrate", "samples were not drawn in the presence of a magistrate", "violation of section 50", "violation of section 52A"],
      "unlocked_by": { "key": "search_seizure_defects", "label": "Departures from search/seizure/sampling procedure", "present": true }
    },
    {
      "id": "fsl_report_delayed",
      "kind": "averment",
      "what": "The chemical examiner's report is awaited or delayed",
      "phrases": ["FSL report has not been received", "FSL report is awaited", "chemical examiner's report is delayed"],
      "unlocked_by": null
    }
  ],
  "allowed": [
    { "id": "quantity_class", "kind": "averment", "averment": "according to the prosecution, the quantity alleged is {{quantity_class}} quantity", "requires": { "key": "quantity_class", "label": "Quantity class alleged", "not_in": ["not stated in record", "not stated", "not known", "unknown"] } },
    { "id": "quantity_alleged", "kind": "averment", "averment": "the quantity alleged in the seizure memo is {{quantity_alleged}}", "requires": { "key": "quantity_alleged", "label": "Quantity alleged", "present": true } },
    { "id": "s37_not_attracted", "kind": "submission", "averment": "it is submitted that the quantity alleged being {{quantity_class}} quantity, and no offence under Section 19, 24 or 27A being alleged, the conditions of Section 37 of the NDPS Act for such cases do not apply", "requires": { "all_of": [
      { "key": "quantity_class", "label": "Quantity class alleged", "equals": ["small", "intermediate"] },
      { "key": "s19_24_27a_alleged", "label": "Offence under s.19, 24 or 27A alleged", "equals": ["no"] }
    ] } },
    { "id": "s37_twin_conditions_met", "kind": "submission", "averment": "it is submitted, on the grounds that {{s37_grounds}}, that there are reasonable grounds for believing that the applicant is not guilty of such offence and that the applicant is not likely to commit any offence while on bail", "requires": { "key": "s37_grounds", "label": "Grounds for the s.37 satisfaction", "present": true } },
    { "id": "conscious_possession_denied", "kind": "averment", "averment": "the applicant denies being in conscious possession of the contraband alleged", "requires": { "key": "possession_denied", "label": "Does the applicant deny conscious possession", "equals": ["yes"] } },
    { "id": "search_seizure_defects", "kind": "submission", "averment": "it is submitted that the following departures from the procedure for search, seizure or sampling appear from the record: {{search_seizure_defects}}", "requires": { "key": "search_seizure_defects", "label": "Departures from search/seizure/sampling procedure", "present": true } }
  ]
}
```

Pairing check: every banned entry with non-null `unlocked_by` (quantity_class, s37_not_attracted, s37_twin_conditions_met, conscious_possession_denied, search_seizure_defects) has an allowed twin. Inherited bail_regular entries (earlier_bail_applications, no_recovery, recovery_planted, under_sixteen, woman_proviso ...) stay as signed there. Note: bail_regular's `woman_proviso` / `under_sixteen` twins are BNSS 480 provisos and do not belong in a s.483 NDPS application: propose overriding both here with `unlocked_by: null` and no twin (Ajay to decide; not written into the JSON above).

## T-200 cue map entries

| Pack | Clause id | Cue set | Mark proposed |
|---|---|---|---|
| `bail_ndps` | `earlier_applications` | EA-standard (T-237) | Approve |
| `bail_ndps` | `undertakings` | undertaking cue (any `undertak`, `वचन`, `आश्वासन`) | Approve |

## Verify (not in signed text)

- NDPS s.37(1)(b)(i)-(ii): exact clause numbering of the Public Prosecutor hearing and the twin satisfaction (the signed text cites "Section 37" only).
- NDPS s.36A sub-sections: Special Court's bail powers and the High Court's powers (36A(3)); extended detention periods (36A(4)).
- NDPS s.36C: Special Court deemed a Court of Session (the reason BNSS 483 is the provision). Confirm before sign; if it fails, the provision cited changes.
- NDPS s.2 clauses defining "commercial quantity" and "small quantity", and the current Central Government notification of quantities.
- NDPS s.42, s.50, s.52A (search, personal search, sampling): candidate grounds; not cited in the pack.
- How NDPS references to the CrPC read after 1 July 2024 (General Clauses Act / BNSS s.531).
- Whether a Magistrate has any bail role in NDPS cases (court_levels excludes it for now).

## Notes for Ajay

- Risk: old/new switch. Your brief says "before 1 July 2024 the draft cites IPC/CrPC per s.531". s.531 saves pending proceedings, not offence dates; whether a bail application filed after 1 July 2024 in a pre-July FIR is under CrPC or BNSS is contested. So the instruction cites BNSS with CrPC in brackets plus a To-be-confirmed blank, instead of choosing. Same text used in #14. Please confirm or replace.
- Risk: `s37_not_attracted` unlock relies on two advocate inputs. If you prefer the Drafter never to state it, set `unlocked_by: null` and drop the twin and the instruction's middle sentence.
- Risk: `quantity_class` select includes "not stated in record" so the form never forces a guess.
- Acceptable: no averment file override needed for bail_regular cue `before` issue (T-237 #3); this pack uses EA-standard.
- Found while reading, outside scope: `default_bail.json` `prompt_context` names four judgments with citations and asks for a "precise day-count" — conflicts with T-136 rules 3 and 7. For Priya to ticket.


## Ajay review and sign-off (12 Oct 2026 IST)

Amended before signing: the old/new law text is the T-245 S-text and P-text (345bd24), word for word; `{governing_provision}` and the T-245 keys `offence_date`, `fir_date`, `procedure_code` are used as T-245 gives them. Every BNSS/CrPC/IEA/BSA pair is in the signed tables (`crpc-to-bnss.json`, `iea-to-bsa.json`); the IEA to BSA table is being corrected under T-250, and any pair in this spec that T-250 changes comes back to me. The cue sets for `earlier_applications` are EA-standard (T-237, 909a49c), except EA-appeal for #15: all of [any: `bail`, `जमानत`, `ज़मानत`] and [any: `earlier`, `previous`, `prior`, `withdrawn`, `to be confirmed: whether any earlier`, `पूर्व`, `पहले`, `वापस`].

The "Notes" and "Verify" sections are the drafter's reasoning, kept for the record. They are not build text. Nothing under "Verify" is signed; it stays out until checked against the bare act. Where a note offers a choice, my ruling is in the table below.

| Item | Mark |
|---|---|
| `displayName` carries no section number (the Drafter sees it); the section appears in the cause title through `{governing_provision}` | Amended |
| Cause title carries `Under {governing_provision}` (amended by Ajay with batch 2) | Amended |
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A |
| Ruling | Approved. Special Court / High Court bail under the provision given as GOVERNING PROVISION (CrPC 439 to BNSS 483). NDPS section 37 conditions are written only as submissions on facts the brief gives; the quantity class only as the brief gives it. Verification closing line `{verifierCapacity}` is approved. |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live (pack `_meta` rule) | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
