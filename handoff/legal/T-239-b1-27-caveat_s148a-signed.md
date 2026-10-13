# T-239 b1 #27 caveat_s148a (signed)

Status: SIGNED (see the end). Drafted 12 Oct 2026; reviewed and amended by Ajay. Drafted 11 Oct 2026 for Ajay's review. Nothing here is signed text until he signs; every item under "Verify (not in signed text)" stays out of all signed fields until checked against the bare Act. 

| Field | Value |
|---|---|
| id | `caveat_s148a` |
| displayName | Caveat (CPC Section 148A) |
| category | Civil: defence and interlocutory |
| court_levels | `["civil_judge_junior_division", "civil_judge_senior_division", "district_judge", "high_court_original_side", "high_court_appellate_civil_side"]` |
| Ink | S = 1 |
| Anushka tier | B |
| averments file | `_averments/caveat_s148a.json`, `inherits: null`, `key_map: {}` |

## relevantActs

```json
[
  {
    "act": "Code of Civil Procedure, 1908",
    "sections": [
      {
        "number": "148A",
        "description": "Right to lodge a caveat"
      }
    ]
  }
]
```

## causeTitle

```json
{
  "format": "IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\n{caseNomenclature}\n\n{caveator} ... Caveator\nVERSUS\n{expected_applicant} ... Expected Applicant",
  "partyDesignations": [
    {
      "role": "caveator",
      "label": "Caveator"
    },
    {
      "role": "expected_applicant",
      "label": "Expected Applicant"
    }
  ],
  "caseNomenclature": "CAVEAT No. _____ of [YEAR]\n(Under Section 148A of the Code of Civil Procedure, 1908)\n(In respect of {proceeding_description})"
}
```

## mandatoryClauses

```json
[
  {"id": "caveator", "name": "The Caveator", "required": true, "description": "The caveator's name, address and standing, as the BRIEF gives them."},
  {"id": "expected_applicant", "name": "The Expected Applicant", "required": true, "description": "The person by whom an application is expected or has been made, with address, as the BRIEF gives them; blank where not given."},
  {"id": "proceeding", "name": "The Suit or Proceeding", "required": true, "description": "The suit or proceeding in which the application is expected or has been made (instituted, or about to be instituted), as the BRIEF gives it; blank where not given."},
  {"id": "right_to_appear", "name": "Right to Appear", "required": true, "description": "The basis on which the caveator claims a right to appear on the hearing of such application, only as the BRIEF gives it; blank where not given."},
  {"id": "expected_application", "name": "Nature of the Expected Application", "required": true, "description": "What the application is expected to ask for, only as the BRIEF gives it; blank where not given. No inference about the expected applicant's intention."},
  {"id": "earlier_proceedings", "name": "Earlier Caveats and Proceedings", "required": true, "description": "Every earlier caveat or proceeding on the same matter, with court, date and result; or the blank where the BRIEF is silent."}
]
```

## prayerTemplate

Value: the empty string `""` (a caveat has no prayer). The block below is intentionally empty.

```

```

## verificationTemplate

Value: the empty string `""` (a caveat has no verification). The block below is intentionally empty.

```

```

## filingChecklist

```json
[
  "Caveat (original + copy for service)",
  "Notice of the caveat to the expected applicant (mode of service: verify)",
  "Proof of dispatch of the notice (e.g. postal receipt, acknowledgement due)",
  "Particulars of the suit or proceeding, if instituted",
  "Copy of the order or document that shows the caveator's right to appear, if any",
  "Vakalatnama",
  "Check whether the caveat has a fixed period and whether it can be renewed, and diarise accordingly (verify)",
  "Court fee / stamp duty as applicable: check state rules (not computed by Lawie)"
]
```

## promptInstructions

```json
[
  "Draft a caveat under Section 148A of the Code of Civil Procedure, 1908. It is not an application, a written statement or an objection. It asks only that no order be passed on an expected application without notice to, and a hearing of, the caveator.",
  "State the caveator, the expected applicant and the suit or proceeding only as the BRIEF gives them. Where the suit is not yet instituted, say so only if the BRIEF says so: \"about to be instituted\" is written only on the BRIEF's words.",
  "State the basis of the caveator's claim to appear on the hearing of the application only as the BRIEF gives it. Where not given, write [To be confirmed: the basis on which the caveator claims a right to appear]. Do not write that the caveator is entitled to notice, or that the caveator has a right to be heard, in the Drafter's own words.",
  "Do not write that the expected applicant is likely to move an ex parte application, to suppress facts or to mislead the Court. State what the BRIEF gives about the expected application and no more.",
  "State facts only as the BRIEF gives them. Where a fact the document needs is not given, write [To be confirmed: <what is missing>]. Do not add a cause, reason, motive or detail to a fact.",
  "Cite only the provisions listed in relevantActs, at the level given there. Do not add a rule, sub-section or clause number. Where a provision would normally be cited and relevantActs does not give it, write [Section — verify before filing].",
  "State every earlier or other proceeding on this matter that the BRIEF mentions, with court, case reference, date and result. Where the BRIEF mentions none, write [To be confirmed: whether any earlier or other proceeding on this matter was filed or is pending, in which court, and with what result]. Never write that none is pending, that none was filed, or that this is the first application.",
  "Do not state the period for which the caveat remains in force and do not say it is valid or in force.",
  "Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].",
  "Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system."
]
```

## form_schema keys

| key | label | type | required | why |
|---|---|---|---|---|
| caveator_name | Caveator name | text | yes | cause title, verification |
| caveator_parentage / caveator_age / caveator_address | Caveator particulars | text / number / textarea | yes | verification |
| expected_applicant_name / expected_applicant_address | Expected applicant | text / textarea | yes | cause title, service |
| court_designation / court_place / state | Court | text / text / select | yes | cause title |
| proceeding_status | The application is | select (Expected in a suit or proceeding already instituted; Expected in a suit or proceeding about to be instituted; Already made) | yes | proceeding clause |
| proceeding_description | The suit or proceeding (number and year, parties, nature) | textarea | yes | cause title |
| claimed_right_basis | Why the caveator claims a right to appear on the hearing | textarea | yes | right-to-appear clause; averment unlock |
| expected_application_nature | What the application is expected to ask for | textarea | no | expected application clause |
| earlier_proceedings | Earlier caveats and proceedings on the same matter (court, date, result) | textarea | no | disclosure clause; averment unlock |
| advocate_name / advocate_enrollment | Advocate details | text | yes | signature block |

## _averments

```json
{
  "pack": "caveat_s148a",
  "inherits": null,
  "key_map": {},
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {"id": "caveator_right_to_appear", "kind": "averment", "what": "The caveator has a right to be heard or to notice", "phrases": ["the caveator has a right to be heard", "the caveator is entitled to notice", "the caveator is entitled to be heard before any order is passed"], "unlocked_by": {"key": "claimed_right_basis", "label": "Why the caveator claims a right to appear", "present": true}},
    {"id": "expected_applicant_motive", "kind": "averment", "what": "The expected applicant will seek an ex parte order or suppress facts", "phrases": ["is likely to move an ex parte application", "will try to obtain an ex parte order", "is bound to apply for an interim order", "will suppress facts"], "unlocked_by": null},
    {"id": "caveat_in_force", "kind": "averment", "what": "The caveat is valid or in force", "phrases": ["the caveat is valid", "the caveat is in force", "the caveat remains in force"], "unlocked_by": null},
    {"id": "no_other_proceedings", "kind": "averment", "what": "No other proceeding on the same matter was filed or is pending", "phrases": ["no other suit, petition or application is pending", "no similar proceedings have been filed", "this is the first application", "no other proceeding is pending between the parties on this matter"], "unlocked_by": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ],
  "allowed": [
    {"id": "caveator_right_to_appear", "kind": "averment", "averment": "the caveator claims a right to appear on the hearing of the application on the following basis: {{claimed_right_basis}}", "requires": {"key": "claimed_right_basis", "label": "Why the caveator claims a right to appear", "present": true}},
    {"id": "no_other_proceedings", "kind": "averment", "averment": "no other proceeding on this matter has been filed or is pending, as the advocate states", "requires": {"key": "earlier_proceedings", "label": "Earlier and other proceedings on the same matter", "equals": ["none", "nil", "no", "not any", "koi nahi", "kuch nahi"]}}
  ]
}
```

## Verify (not in signed text)

- The sub-sections of Section 148A (understood: (1) the right to lodge; (2) notice to the person by whom the application has been or is expected to be made, by registered post, acknowledgement due; (3) the applicant to furnish a copy of the application and of paper books; (5) the caveat ceases after a fixed period (understood: ninety days) unless renewed). None is cited; the period and the mode of service are checklist cues marked verify.
- Whether a caveat may be lodged before a High Court and before an appellate court (understood: yes). `court_levels` includes both; check.
- Whether the caveator must file an affidavit (not understood to be required). Not in the checklist.
- Section 148A and its relation to Section 94 and Order XXXIX (interim orders without notice). Not cited.

## Notes for Ajay

1. A caveat has no prayer or verification: both templates are the empty string "" and their clause entries are removed (Ajay's ruling 1).
2. Risk. `proceeding_status` "about to be instituted" is the advocate's statement only; the Drafter must not infer it.
3. Tier B. One Anushka sample with `claimed_right_basis` empty.

## Review changes (v2, per Ajay's rulings)

- prayerTemplate and verificationTemplate set to "" (ruling 1); prayer and verification clause entries removed.
- Checklist: removed two paraphrases of what the section requires (notice mode, lapse period); now neutral verify cues.
- Clean on other checks.


## Ajay review and sign-off (12 Oct 2026 IST)

Reviewed by me after an independent review pass; the corrections are in this file. Every section or rule cited is at the level my approved list allows; anything under "Verify" is not signed and stays out until checked against the bare Act. "Notes" and "Review changes" sections are the drafters' reasoning, not build text. Category (T-240): Civil: defence and interlocutory. `court_levels` values are the lead's to map to the T-240 list. No limitation period is stated, computed or argued anywhere in this pack.

| Item | Mark |
|---|---|
| Spec as amended | Approved |
| Size and sampling | S (1 Ink); Anushka tier B |
| Ruling | No prayer and no verification (empty strings, intentional). |
| `displayName` carries no section number of one code only | Condition |
| Lead builds `form_schema` from this spec; I sign that diff | Condition |
| Moved golden snapshots are listed for me before merge | Condition |
| A practising advocate checks the pack before it goes live | Condition |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

13 Oct 2026, T-382: the field key `advocate_enrolment` is renamed to `advocate_enrollment`. This changes the key only; the wording and labels are unchanged (Ajay).
