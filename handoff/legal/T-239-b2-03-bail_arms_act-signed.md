# T-239 b2 #03 bail_arms_act (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Copied from the signed `bail_ndps` (b1 #13) and the T-245 / T-237 / T-241 texts. BNSS mapping uses only the pairs in the signed table (CrPC 439 -> BNSS 483, 437 -> 480). Special-Act bail; the Act is named only; recovery facts only as the brief gives them.

| Field | Value |
|---|---|
| id | `bail_arms_act` |
| displayName | Bail Application in Arms Act Case |
| category | Criminal: bail and custody |
| court_levels | `["magistrate", "sessions_court", "high_court"]` |
| Ink | L = 2 |
| Anushka tier | A (liberty) |
| averments file | `_averments/bail_arms_act.json`, `inherits: "bail_regular"`, `key_map: {}` (form keys reuse bail_regular's ledger keys) |

## relevantActs

```json
[
  {
    "act": "Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023",
    "sections": [
      {
        "number": "483",
        "description": "Special powers of High Court or Court of Session regarding bail"
      },
      {
        "number": "480",
        "description": "When bail may be taken in case of non-bailable offence (Magistrate)"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\n\n{caseNomenclature}\n\nIN THE MATTER OF:\n{applicant} ... Applicant/Accused\nVERSUS\n{respondent} ... Respondent",
  "partyDesignations": [
    {
      "role": "applicant",
      "label": "Applicant/Accused"
    },
    {
      "role": "respondent",
      "label": "Respondent (State of {state}, or the investigating agency as the brief names it)"
    }
  ],
  "caseNomenclature": "BAIL APPLICATION No. _____ of [YEAR]\nUnder {governing_provision}\n(In {firDetails}, under the Arms Act, 1959)"
}
```

## mandatoryClauses

```json
[
  {
    "id": "fir_details",
    "name": "FIR Details",
    "required": true,
    "description": "FIR or crime number, police station, date of registration, and the sections alleged (the Arms Act, 1959 and any IPC or BNS sections), exactly as the brief gives them."
  },
  {
    "id": "recovery_facts",
    "name": "Recovery / Possession as Alleged",
    "required": true,
    "description": "The recovery or possession alleged by the prosecution, only as the brief gives it (the article, when and from where, by whom, the memo), as the prosecution's case. The blank where the brief gives none. No statement that the weapon was or was not recovered from the applicant except as the brief gives it."
  },
  {
    "id": "custody_status",
    "name": "Custody Status",
    "required": true,
    "description": "Date of arrest, date custody began, and whether judicial or police custody, as the brief gives them. No count of days."
  },
  {
    "id": "grounds",
    "name": "Grounds for Bail",
    "required": true,
    "description": "Only the grounds the brief gives, each as the brief puts it."
  },
  {
    "id": "undertakings",
    "name": "Undertakings",
    "required": true,
    "description": "Undertakings by the applicant for the future, if released on bail: not to abscond, not to tamper with the evidence or influence witnesses, to appear on every date fixed, and to abide by the conditions imposed. Never a statement of fact."
  },
  {
    "id": "earlier_applications",
    "name": "Earlier Bail Applications",
    "required": true,
    "description": "Every earlier bail application in this matter, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."
  },
  {
    "id": "prayer",
    "name": "Prayer Clause",
    "required": true,
    "description": "System part."
  },
  {
    "id": "verification",
    "name": "Verification",
    "required": true,
    "description": "System part."
  },
  {
    "id": "advocate_details",
    "name": "Advocate Details",
    "required": true,
    "description": "System part."
  }
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

`{governing_provision}` is filled by code from `procedure_code` (T-245) and follows the court level chosen in the form (Ajay rulings 2 and 5): High Court, Court of Session or a Special Court under the Act -> CrPC 439 / BNSS 483; Magistrate -> CrPC 437 / BNSS 480. Lawie does not advise whether a Special Court is a Court of Session.
- BNSS and BSA: `Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023` (Court of Session, High Court) or `Section 480 of the Bharatiya Nagarik Suraksha Sanhita, 2023` (Magistrate)
- CrPC and Evidence Act: `Section 439 of the Code of Criminal Procedure, 1973` (Court of Session, High Court) or `Section 437 of the Code of Criminal Procedure, 1973` (Magistrate)
- no choice: `[To be confirmed: Section 439 CrPC or Section 483 BNSS]` (Court of Session, High Court) or `[To be confirmed: Section 437 CrPC or Section 480 BNSS]` (Magistrate)

The Arms Act is cited by name only, unaffected by T-245. No section of it is cited in any signed field, and it is not listed in `relevantActs` (no section is certain).

## verificationTemplate

As in `bail_ndps`: ends "{verifierCapacity}", not "Deponent" (T-136; Ajay approved the pattern for #7-13).

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
  "Copy of licence and renewal records, if the applicant relies on a licence (as obtained)",
  "Copy of ballistic / forensic report, if received",
  "Custody certificate / proof of custody period",
  "Copies of remand orders",
  "Copies of earlier bail orders in this matter, if any",
  "Copy of charge sheet or complaint, if filed",
  "Copy of application served on the Public Prosecutor, as the court's practice requires",
  "Affidavit of applicant or pairokar, if the court's practice requires",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)",
  "Identity and address proof of applicant and sureties"
]
```

## promptInstructions

```json
[
  "Draft a Regular Bail Application in a case under the Arms Act, 1959, before the Magistrate, the Court of Session or the High Court. Cite only the provision given as GOVERNING PROVISION in the case details as the provision under which bail is sought, in the heading, the opening paragraph and the prayer.",
  "Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].",
  "Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].",
  "Cite the Arms Act, 1959 by name only; a section of it may appear only in the FIR details in paragraph 1, exactly as the BRIEF gives them, and nowhere else. Do not say what any section punishes.",
  "Begin PARAGRAPH 1 with the exact FIR or crime details provided: number, date, police station, district, and the sections alleged. Use the values EXACTLY as given.",
  "State the recovery or possession alleged only as the BRIEF gives it, as the prosecution's case: 'according to the prosecution, ...'. Do not describe the weapon, its type, make, bore or condition, or the manner of recovery, beyond what the BRIEF gives. Where the BRIEF does not give the recovery details, write [To be confirmed: the article alleged to have been recovered, when, where and from whom, as in the recovery memo].",
  "Do not state that the weapon was defunct, imitation or not in working condition, that a ballistic or forensic report is awaited, absent or favourable, or that the weapon was never used or caused no harm, even if the BRIEF says so: the advocate adds these by hand. Do not state that the applicant held a licence, that there was no independent witness to the recovery, that the weapon was not recovered from the applicant, or that the recovery was planted, unless the BRIEF states it; then state it as the BRIEF puts it, as the applicant's case.",
  "State the custody status as the BRIEF gives it: the date of arrest, the date from which the applicant has been in custody, and whether that custody is judicial or police. Where the BRIEF gives the date of arrest and the date custody began as two dates, keep them as two dates. Do not work out the number of days in custody.",
  "Set out the grounds for bail that the BRIEF gives, and no others. Do not assert a ground (for example no criminal history, no recovery from the applicant, false implication, delay in the investigation, parity with a co-accused) unless the BRIEF states it. State each ground as the BRIEF puts it: do not add a reason or a detail to it. Cite a section of any Act other than those in ACTS only if the BRIEF gives it.",
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
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | Procedure switch (T-245), `{governing_provision}` |
| `procedure_code` | This application is under | select: BNSS and BSA / CrPC and Evidence Act | yes when shown | shown only when `fir_date` is before 1 July 2024 or empty; when on or after, set to BNSS and BSA and not shown (T-245) |
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Offence law switch (T-245 S-text) |
| `fir_number` | FIR / Crime Number | text | yes | Cause title, para 1 |
| `agency` | Police Station / Agency | text | yes | Para 1, respondent name |
| `arms_sections` | Arms Act sections alleged (as in FIR) | text | yes | Para 1; only source of Arms Act section numbers |
| `other_sections` | Other sections alleged (IPC / BNS, as in FIR) | text | no | Para 1; no conversion |
| `recovery_alleged` | Recovery / possession alleged (as in recovery memo) | textarea | no | recovery_facts; no description added |
| `recovery_status` | Recovery from the applicant (as instructed) | text | no | bail_regular ledger key |
| `licence_held` | Does the applicant say the weapon was held under a licence? | select: yes / no / not instructed | no | Unlocks licence_held |
| `recovery_witness_note` | Independent witnesses to the recovery (as instructed) | textarea | no | Unlocks recovery_witness_note |
| `arrest_date` | Date of arrest | date | yes | custody_status |
| `custody_since` | In custody since | date | no | custody_status |
| `currently_in_custody` | Custody type | select (bail_regular options) | yes | custody_status |
| `investigation_status` | Investigation / charge sheet status (as instructed) | text | no | grounds; bail_regular key |
| `antecedents` | Criminal antecedents | textarea | no | bail_regular key |
| `earlier_bail_applications` | Earlier bail applications in this matter | textarea | no | earlier_applications; bail_regular key |
| `grounds_for_bail` | Grounds for bail | textarea | yes | grounds |
| `state`, `court_type`, `court_name` | Court | as bail_regular | yes | Cause title, court-rules overlay |
| `applicant_name`, `father_name`, `applicant_age`, `address`, `applicant_occupation` | Applicant | as bail_regular | name, parentage, address yes | Cause title, verification |
| `verifier_capacity` | Who verifies | select: applicant / pairokar | yes | verificationTemplate |
| `pairokar_name`, `pairokar_relation` | Pairokar | text | if pairokar | verificationTemplate |

## _averments (`_averments/bail_arms_act.json`)

```json
{
  "pack": "bail_arms_act",
  "inherits": "bail_regular",
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "licence_held",
      "kind": "averment",
      "what": "The weapon was held under a licence",
      "phrases": [
        "held under a valid licence",
        "licensed weapon",
        "valid arms licence",
        "licence was valid",
        "licence ke tahat"
      ],
      "unlocked_by": {
        "key": "licence_held",
        "label": "Does the applicant say the weapon was held under a licence",
        "equals": [
          "yes"
        ]
      }
    },
    {
      "id": "recovery_witness_note",
      "kind": "averment",
      "what": "Independent witnesses to the recovery were or were not present",
      "phrases": [
        "no independent witness",
        "recovery was not made in the presence of independent witnesses",
        "independent witnesses were not joined",
        "koi swatantra gawah nahi"
      ],
      "unlocked_by": {
        "key": "recovery_witness_note",
        "label": "Independent witnesses to the recovery (as instructed)",
        "present": true
      }
    },
    {
      "id": "weapon_condition",
      "kind": "averment",
      "what": "The weapon's type, condition or working order",
      "phrases": [
        "not in working condition",
        "country-made",
        "defunct weapon",
        "toy pistol",
        "imitation firearm",
        "live cartridges were not found"
      ],
      "unlocked_by": null
    },
    {
      "id": "forensic_report_status",
      "kind": "averment",
      "what": "The ballistic / forensic report is awaited, absent or favourable",
      "phrases": [
        "ballistic report is awaited",
        "forensic report has not been received",
        "ballistic report is in favour of the applicant",
        "no ballistic report"
      ],
      "unlocked_by": null
    },
    {
      "id": "no_use_of_weapon",
      "kind": "averment",
      "what": "The weapon was not used, or no harm was caused",
      "phrases": [
        "the weapon was never used",
        "no one was injured",
        "no misuse of the weapon",
        "hathiyar ka istemal nahi"
      ],
      "unlocked_by": null
    }
  ],
  "allowed": [
    {
      "id": "recovery_facts",
      "kind": "averment",
      "averment": "according to the prosecution, the recovery alleged is as follows: {{recovery_alleged}}",
      "requires": {
        "key": "recovery_alleged",
        "label": "Recovery / possession alleged",
        "present": true
      }
    },
    {
      "id": "licence_held",
      "kind": "averment",
      "averment": "it is the applicant's case that the weapon was held under a licence",
      "requires": {
        "key": "licence_held",
        "label": "Does the applicant say the weapon was held under a licence",
        "equals": [
          "yes"
        ]
      }
    },
    {
      "id": "recovery_witness_note",
      "kind": "submission",
      "averment": "it is submitted, as instructed, that {{recovery_witness_note}}",
      "requires": {
        "key": "recovery_witness_note",
        "label": "Independent witnesses to the recovery (as instructed)",
        "present": true
      }
    }
  ]
}
```

Pairing check: every banned entry with non-null `unlocked_by` has an allowed twin with the same id (see the ids in the allowed list). Inherited bail_regular entries (earlier_bail_applications, no_recovery, recovery_planted ...) stay as signed there. `woman_proviso` and `under_sixteen` twins are BNSS 480 provisos: as in #13, propose overriding both here with `unlocked_by: null` and no twin (Ajay to decide; not written into the JSON above).

## T-200 cue map entries

| Pack | Clause id | Cue set | Mark proposed |
|---|---|---|---|
| `bail_arms_act` | `earlier_applications` | EA-standard (T-237) | Approve |
| `bail_arms_act` | `undertakings` | undertaking cue (any `undertak`, `वचन`, `आश्वासन`) | Approve |

## Verify (not in signed text)

- Every section of the Arms Act, 1959 (licensing, possession, use, punishment, any bail provision): not stated. Sections appear only through the `arms_sections` form key, in the FIR details.
- BNSS 480 provisos (offences punishable with death or life; woman, under sixteen, sick or infirm) as they apply to Magistrate bail: not stated.
- Whether the Act's sanction or notification requirements bear on bail: not stated.

## Rulings applied (Ajay, 11 Oct 2026)

- `court_levels` ids are the lead's to map to T-240; left as drafted.
- The Magistrate level belongs in this pack; `{governing_provision}` is BNSS 480 / CrPC 437 for a Magistrate and BNSS 483 / CrPC 439 for the Court of Session, a Special Court under the Act or the High Court, chosen by code from the court level. Lawie does not advise whether a Special Court is a Court of Session.
- The recovery-point bans (`weapon_condition`, `forensic_report_status`, `no_use_of_weapon`, `unlocked_by: null`) are approved as stricter than required; the advocate adds such points by hand.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. The old/new law text is the T-245 S-text and P-text (345bd24), word for word, with the keys `offence_date`, `fir_date` and `procedure_code`. Pairs: CrPC 437 to BNSS 480, CrPC 439 to BNSS 483 (signed table, T-255). Special Acts are cited as the ruling below says. The cue set for `earlier_applications` is EA-standard (T-237). Anything under "Verify" is not signed. Category (T-240): Criminal: bail and custody. `court_levels` ids are the lead's to map to the T-240 list. Which section the application cites follows the court level chosen in the form; Lawie does not advise whether a Special Court is a Court of Session.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | L (2 Ink); Anushka tier A (every template, twice) |
| Ruling | Magistrate, Court of Session or High Court: the provision follows the court level (Magistrate: CrPC 437 / BNSS 480; Court of Session, High Court: CrPC 439 / BNSS 483). Recovery only as the brief or the recovery-memo field gives it, introduced by "the prosecution alleges". Weapon condition, forensic report and non-use are not stated by the Drafter (null bans, approved as stricter than required). The lead tests that quoted prosecution text containing a banned weapon word is not blocked; if it is, the weapon-type words leave the ban list and the assertion verbs stay. |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.
