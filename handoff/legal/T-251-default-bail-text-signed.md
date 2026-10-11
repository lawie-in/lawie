# T-251: `default_bail` text (signed)

Ajay (CLO), 12 Oct 2026 IST. Base read: `default_bail.json` on `origin/develop_staging` after 00b7881. Apply **after T-245a** (same pack). This is a full replacement of the fields named below; T-245's S-text and P-text are included here so the lead applies one consistent list.

## Defects found (beyond the ticket)

| # | Defect | Fix |
|---|---|---|
| 1 | Four judgments named and cited (T-148) | Removed; `[Authority — add if relied upon]` instead |
| 2 | The Drafter tabulates days (T-136) | Removed; dates only, as the brief gives them |
| 3 | **Wrong law:** "≤10 yrs = 60 days; >10 yrs / life / death = 90 days", and `validation_rules` force 90 days for a 10-year maximum. The 90-day period is for offences punishable with death, imprisonment for life, or imprisonment for a term of not less than ten years; an offence whose punishment *may extend to* ten years is in the 60-day period. A 10-year-maximum offence drafted as a 90-day case delays a liberty claim by 30 days | The advocate states which period applies (`period_claimed`); Lawie never decides it |
| 4 | `willingness_to_furnish_bond must be Yes` treated as a fact | An undertaking for the future |
| 5 | "never IPC" | T-245 S-text |

## Replacement text (word for word)

### `prompt_context`

`Draft a Default Bail Application under the provision given as GOVERNING PROVISION in the case details. The application rests on dates the BRIEF gives: the date of arrest, the date of first remand, the period the advocate says applies (60 days, 90 days, or the period under a special Act) and whether a police report has been filed. Lawie does not work out which period applies and does not count days.`

### `promptInstructions` (replaces all entries)

1. `Draft a Default Bail Application under the provision given as GOVERNING PROVISION in the case details, and cite only that provision as the provision under which bail is sought.`
2. *(T-245 S-text, word for word)*
3. *(T-245 P-text, word for word)*
4. `State the date of arrest and the date of first remand to custody as the BRIEF gives them, and that the applicant remains in custody only if the BRIEF says so. Use a blank for any of them the BRIEF does not give.`
5. `State the period the BRIEF says applies (60 days, 90 days, or a period under a special Act) and the date on which the BRIEF says it expired. Do not work out which period applies, and do not count or tabulate days. Where the BRIEF does not give the period, write [To be confirmed: the default-bail period that applies to this offence]; where it does not give the date of expiry, write [To be confirmed: the date on which the period expired].`
6. `State whether a police report has been filed only as the BRIEF gives it, as on the date of this application. Where the BRIEF does not say, write [To be confirmed: whether a police report had been filed when this application was made]. Do not say that the investigation is incomplete unless the BRIEF says so.`
7. `Where the BRIEF says an offence is under a special Act (for example the NDPS Act, the UAPA or the PMLA), do not apply the BNSS or CrPC periods to it; write [To be confirmed: the default-bail period and any extension under <that Act>].`
8. `Submit, as "It is submitted that ...", that the period having expired without a police report, as stated above, the applicant is entitled to be released on bail. Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].`
9. `Give the applicant's undertaking for the future to furnish bail bonds and sureties as this Hon'ble Court directs. Never as a fact and never as the advocate's undertaking.`
10. `State every earlier bail application in this matter that the BRIEF mentions: the court it was made to, the date of the order and the result, or that it is still pending, each as the BRIEF gives it. Use a blank for any of these the BRIEF does not give. Where the BRIEF mentions no earlier bail application, do not say that this is the first application or that none is pending; write [To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result].`
11. `Do NOT generate the Prayer clause, Verification clause, or Advocate signature block — those are added programmatically by the system.`

### `mandatoryClauses` (replaces all)

```json
[
  {"id": "statutory_provision", "name": "Provision Invoked", "required": true, "description": "The provision under which default bail is sought, as GOVERNING PROVISION gives it."},
  {"id": "custody_dates", "name": "Arrest and First Remand", "required": true, "description": "The date of arrest and the date of first remand, as the brief gives them, or the blank."},
  {"id": "applicable_window", "name": "Period and Expiry", "required": true, "description": "The default-bail period the brief says applies and the date it expired, as the brief gives them, or the blank. Never worked out by Lawie."},
  {"id": "non_filing", "name": "Police Report", "required": true, "description": "Whether a police report had been filed when the application was made, as the brief gives it, or the blank."},
  {"id": "indefeasible_right", "name": "Entitlement to Release", "required": true, "description": "Submission that, the period having expired without a police report, the applicant is entitled to be released on bail. Naming no judgment."},
  {"id": "willingness", "name": "Undertaking to Furnish Bond", "required": true, "description": "The applicant's undertaking for the future to furnish bail bonds and sureties as directed. Never a statement of fact."},
  {"id": "earlier_applications", "name": "Earlier Bail Applications", "required": true, "description": "Every earlier bail application in this matter, with the court, the date of the order and the result, or that it is pending; or the blank where the brief does not say."},
  {"id": "prayer", "name": "Prayer", "required": true, "description": "Prayer for release on default bail"},
  {"id": "verification", "name": "Verification", "required": true, "description": "Verification on oath"}
]
```

Cue map (T-200): `default_bail` / `earlier_applications` → EA-standard (T-237). Other clauses R2b.

### `causeTitle.caseNomenclature` and `prayerTemplate`

Every "Section 187(3) BNSS, 2023" / "Section 187(3) of BNSS, 2023" becomes `{governing_provision}` (T-245 pair 167(2) CrPC → 187(3) BNSS). The prayer's opening words "and as the statutory period under Section 187(3) BNSS, 2023 has expired without the police report being filed," are **deleted** (the body states it, from the brief).

### `validation_rules` (replaces all)

```json
[
  "remand_date, if given, must not be before arrest_date",
  "application_date, if given, must not be before remand_date",
  "period_claimed must be given; if empty, the draft carries the blank"
]
```

### Form keys

| Change | Key | Label | Type |
|---|---|---|---|
| Remove | `offence_punishment_max_years`, `elapsed_days` | | |
| Add | `period_claimed` | Default-bail period that applies | select: 60 days / 90 days / Period under a special Act |
| Add | `period_expiry_date` | Date the period expired | date, optional |
| Add | `special_act_period` | Special Act and its period (if any) | text, optional, shown for the third option |
| Change | `willingness_to_furnish_bond` | "The applicant will furnish bail bonds and sureties as directed" | checkbox; unticked → blank `[To be confirmed: the applicant's undertaking to furnish bail bonds]` |
| Keep | `earlier_bail_applications` (add if missing) | Earlier bail applications (court, date, result) | textarea, optional |

## Conditions

| Item | Mark |
|---|---|
| Text above, word for word | Condition |
| AC2 tests: no judgment named; no day count; a 10-year-maximum offence with `period_claimed` empty → blank, never "90 days"; a special-Act offence → special-Act blank | Condition |
| Moved golden snapshots listed for me | Condition |
| Practitioner check (pack `_meta`): the 60/90-day boundary note above is from the statute's words; the advocate reviewer confirms before release | Risk, accepted |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.


## Addendum (12 Oct 2026 IST): averments file, golden fixtures, pack text

Asked through Priya after mahak found that `_averments/default_bail.json` conflicts with this text.

### 1. `_averments/default_bail.json` (replace the file; the lead runs `report:averments` and I sign the file hash)

What changed, and why:

| Entry | Change |
|---|---|
| `statutory_period_expired` | Was banned with nothing to unlock it, which forbade the entitlement submission the instruction asks for. Now unlocked by `remand_date`, `period_claimed` (60 days or 90 days), `period_expiry_date` and `charge_sheet_status`. The allowed text is a submission: `it is submitted that the default-bail period of {{period_claimed}} from the first remand on {{remand_date}} expired on {{period_expiry_date}}, and that the applicant is therefore entitled to be released on bail` |
| `applicable_window` (new) | Lawie does not decide which period applies; only the advocate's `period_claimed` unlocks it, as a submission |
| `days_elapsed`, `punishment_category` | Now banned with no unlock, and their allowed twins are deleted: Lawie neither counts days nor classifies the offence. Their keys (`elapsed_days`, `offence_punishment_max_years`) no longer exist |
| `willing_to_furnish_bond` | The allowed text is now an undertaking for the future (`the applicant undertakes to furnish bail bonds and sureties as this Hon'ble Court directs`), unlocked by the ticked box |
| `chargesheet_not_filed` allowed | Adds the date it is true on: `as on the date of this application, the police report (charge sheet) has not been filed` |
| `default_bail_citation` | Bans the short case names too, so a name alone is caught |
| `first_bail_application` | Unchanged: its key `earlier_bail_applications` now exists in the form (this text), so it is live. It lets the Drafter write "no earlier application" only when the advocate's own answer says none |

SHA-256 of the file text below (the text between the fences, with its final newline): `d853935931de12e6fa0497b0bd1c6e5156038ac47a94cb411e0d0550bdeba3c9`.

```json
{
  "_about": "T-147c averment allowlist and banned-assertion list. Schema and rules: README.md in this folder. PROPOSED by the developer; Ajay (CLO) reviews and signs.",
  "pack": "default_bail",
  "inherits": null,
  "key_map": {},
  "_signed_by": "Ajay (CLO) writes his name and the date here when he signs this list. His signature is not release on its own: a practising advocate still checks the list before the pack goes live. Null means proposed, not signed.",
  "signed_by": null,
  "signed_on": null,
  "banned": [
    {
      "id": "chargesheet_not_filed",
      "kind": "averment",
      "what": "The charge sheet has not been filed",
      "phrases": [
        "no charge sheet has been filed",
        "charge sheet not filed till date",
        "police report under Section 193 BNSS not filed",
        "the investigation is not complete",
        "challan pesh nahi hua",
        "no police report had been filed",
        "police report not filed till date"
      ],
      "unlocked_by": {
        "key": "charge_sheet_status",
        "label": "Charge Sheet Status",
        "equals": [
          "Not filed"
        ]
      }
    },
    {
      "id": "chargesheet_incomplete",
      "kind": "averment",
      "what": "The charge sheet is defective or incomplete",
      "phrases": [
        "incomplete charge sheet",
        "defective charge sheet",
        "adhoora challan"
      ],
      "unlocked_by": {
        "key": "charge_sheet_status",
        "label": "Charge Sheet Status",
        "equals": [
          "Filed but defective / incomplete"
        ]
      }
    },
    {
      "id": "chargesheet_defect_particulars",
      "kind": "averment",
      "what": "Particulars of the defect",
      "phrases": [
        "piecemeal charge sheet",
        "charge sheet without FSL report"
      ],
      "unlocked_by": null
    },
    {
      "id": "chargesheet_late",
      "kind": "averment",
      "what": "The charge sheet was filed after the statutory period",
      "phrases": [
        "charge sheet was filed after the statutory period",
        "filed belatedly"
      ],
      "unlocked_by": {
        "key": "charge_sheet_status",
        "label": "Charge Sheet Status",
        "equals": [
          "Filed after expiry of statutory period"
        ]
      }
    },
    {
      "id": "statutory_period_expired",
      "kind": "submission",
      "what": "The default-bail period has expired and the applicant is entitled to be released",
      "phrases": [
        "the statutory period of 60 days has expired",
        "the period of 90 days has expired",
        "indefeasible right to default bail has accrued",
        "the applicant is entitled to be released on default bail",
        "right to default bail has accrued"
      ],
      "unlocked_by": {
        "all_of": [
          {
            "key": "remand_date",
            "label": "Date of First Remand to Custody",
            "present": true
          },
          {
            "key": "period_claimed",
            "label": "Default-bail period that applies",
            "equals": [
              "60 days",
              "90 days"
            ]
          },
          {
            "key": "period_expiry_date",
            "label": "Date the period expired",
            "present": true
          },
          {
            "key": "charge_sheet_status",
            "label": "Charge Sheet Status",
            "present": true
          }
        ]
      }
    },
    {
      "id": "applicable_window",
      "kind": "submission",
      "what": "Which default-bail period applies to the offence (the advocate states it)",
      "phrases": [
        "the applicable period is 60 days",
        "the applicable period is 90 days",
        "falls in the 60-day category",
        "falls in the 90-day category",
        "the offence being punishable, the period is"
      ],
      "unlocked_by": {
        "all_of": [
          {
            "key": "period_claimed",
            "label": "Default-bail period that applies",
            "equals": [
              "60 days",
              "90 days"
            ]
          }
        ]
      }
    },
    {
      "id": "days_elapsed",
      "kind": "averment",
      "what": "A length of custody or a count of days (Lawie does not count days)",
      "phrases": [
        "has been in custody for",
        "days have elapsed",
        "days have passed",
        "days in custody",
        "itne din se jail mein"
      ],
      "unlocked_by": null
    },
    {
      "id": "statutory_threshold_crossed",
      "kind": "submission",
      "what": "The 60- or 90-day period under s.187(3) BNSS has been crossed",
      "phrases": [
        "more than 60 days",
        "more than 90 days",
        "beyond the statutory period",
        "charge sheet filed beyond 60 days",
        "charge sheet filed beyond 90 days",
        "punishable with imprisonment for less than ten years",
        "punishable with imprisonment for ten years or more",
        "punishable with death or imprisonment for life"
      ],
      "unlocked_by": null
    },
    {
      "id": "arrested_on",
      "kind": "averment",
      "what": "The date of arrest",
      "phrases": [
        "was arrested on",
        "was taken into custody on",
        "giraftar kiya gaya"
      ],
      "unlocked_by": {
        "key": "arrest_date",
        "label": "Date of Arrest",
        "present": true
      }
    },
    {
      "id": "remanded_on",
      "kind": "averment",
      "what": "The date of first remand",
      "phrases": [
        "was first remanded on",
        "remanded to judicial custody on",
        "remand mili"
      ],
      "unlocked_by": {
        "key": "remand_date",
        "label": "Date of First Remand to Custody",
        "present": true
      }
    },
    {
      "id": "punishment_category",
      "kind": "averment",
      "what": "How the offence is punishable (the advocate states the period; Lawie does not classify the offence)",
      "phrases": [
        "punishable with imprisonment of up to",
        "punishable with imprisonment for life",
        "punishable with death",
        "punishable with imprisonment for a term of not less than ten years"
      ],
      "unlocked_by": null
    },
    {
      "id": "willing_to_furnish_bond",
      "kind": "averment",
      "what": "The applicant undertakes to furnish bail bonds",
      "phrases": [
        "ready and willing to furnish bail bonds",
        "prepared to furnish sureties",
        "bond bharne ko taiyaar"
      ],
      "unlocked_by": {
        "key": "willingness_to_furnish_bond",
        "label": "Undertaking to furnish bail bonds",
        "equals": [
          "Yes",
          "true",
          "yes"
        ]
      }
    },
    {
      "id": "no_extension_sought",
      "kind": "averment",
      "what": "The prosecution has not sought or obtained an extension of time",
      "phrases": [
        "no application for extension of time has been filed by the prosecution",
        "no report of the Public Prosecutor seeking extension",
        "no extension has been granted"
      ],
      "unlocked_by": null
    },
    {
      "id": "application_before_chargesheet",
      "kind": "averment",
      "what": "This application was made before the charge sheet",
      "phrases": [
        "this application is filed before the charge sheet",
        "the right was availed before the charge sheet was filed"
      ],
      "unlocked_by": null
    },
    {
      "id": "first_bail_application",
      "kind": "averment",
      "what": "No other bail application was made, is pending or was rejected (suppression risk)",
      "phrases": [
        "this is the first bail application",
        "no other bail application is pending",
        "no bail application has been rejected",
        "pehli zamanat arzi hai"
      ],
      "unlocked_by": {
        "key": "earlier_bail_applications",
        "label": "Earlier bail applications in this matter",
        "equals": [
          "none",
          "nil",
          "no",
          "not any",
          "koi nahi",
          "kuch nahi",
          "first application",
          "no earlier application",
          "no other application"
        ]
      }
    },
    {
      "id": "no_criminal_antecedents",
      "kind": "averment",
      "what": "The applicant has no criminal antecedents",
      "phrases": [
        "has no criminal antecedents",
        "no criminal history",
        "no previous criminal record",
        "first-time offender",
        "koi criminal record nahi hai"
      ],
      "unlocked_by": null
    },
    {
      "id": "default_bail_citation",
      "kind": "submission",
      "what": "A judgment on default bail that the advocate did not give",
      "phrases": [
        "Uday Mohanlal Acharya",
        "Sanjay Dutt",
        "Bikramjit Singh",
        "M. Ravindran",
        "Rakesh Kumar Paul",
        "Bikramjit Singh v. State of Punjab",
        "M. Ravindran v. Intelligence Officer",
        "Rakesh Kumar Paul v. State of Assam"
      ],
      "unlocked_by": null
    }
  ],
  "allowed": [
    {
      "id": "chargesheet_not_filed",
      "kind": "averment",
      "averment": "as on the date of this application, the police report (charge sheet) has not been filed",
      "requires": {
        "key": "charge_sheet_status",
        "label": "Charge Sheet Status",
        "equals": [
          "Not filed"
        ]
      }
    },
    {
      "id": "chargesheet_incomplete",
      "kind": "averment",
      "averment": "the charge sheet was filed but is defective or incomplete",
      "requires": {
        "key": "charge_sheet_status",
        "label": "Charge Sheet Status",
        "equals": [
          "Filed but defective / incomplete"
        ]
      }
    },
    {
      "id": "chargesheet_late",
      "kind": "averment",
      "averment": "the charge sheet was filed after the expiry of the statutory period",
      "requires": {
        "key": "charge_sheet_status",
        "label": "Charge Sheet Status",
        "equals": [
          "Filed after expiry of statutory period"
        ]
      }
    },
    {
      "id": "statutory_period_expired",
      "kind": "submission",
      "averment": "it is submitted that the default-bail period of {{period_claimed}} from the first remand on {{remand_date}} expired on {{period_expiry_date}}, and that the applicant is therefore entitled to be released on bail",
      "requires": {
        "all_of": [
          {
            "key": "remand_date",
            "label": "Date of First Remand to Custody",
            "present": true
          },
          {
            "key": "period_claimed",
            "label": "Default-bail period that applies",
            "equals": [
              "60 days",
              "90 days"
            ]
          },
          {
            "key": "period_expiry_date",
            "label": "Date the period expired",
            "present": true
          },
          {
            "key": "charge_sheet_status",
            "label": "Charge Sheet Status",
            "present": true
          }
        ]
      }
    },
    {
      "id": "applicable_window",
      "kind": "submission",
      "averment": "it is submitted that the default-bail period applicable to the offence charged is {{period_claimed}}",
      "requires": {
        "all_of": [
          {
            "key": "period_claimed",
            "label": "Default-bail period that applies",
            "equals": [
              "60 days",
              "90 days"
            ]
          }
        ]
      }
    },
    {
      "id": "arrested_on",
      "kind": "averment",
      "averment": "the applicant was arrested on {{arrest_date}}",
      "requires": {
        "key": "arrest_date",
        "label": "Date of Arrest",
        "present": true
      }
    },
    {
      "id": "remanded_on",
      "kind": "averment",
      "averment": "the applicant was first remanded to custody on {{remand_date}}",
      "requires": {
        "key": "remand_date",
        "label": "Date of First Remand to Custody",
        "present": true
      }
    },
    {
      "id": "willing_to_furnish_bond",
      "kind": "averment",
      "averment": "the applicant undertakes to furnish bail bonds and sureties as this Hon'ble Court directs",
      "requires": {
        "key": "willingness_to_furnish_bond",
        "label": "Undertaking to furnish bail bonds",
        "equals": [
          "Yes",
          "true",
          "yes"
        ]
      }
    },
    {
      "id": "first_bail_application",
      "kind": "averment",
      "averment": "no other bail application has been made by the applicant in this matter",
      "requires": {
        "key": "earlier_bail_applications",
        "label": "Earlier bail applications in this matter",
        "equals": [
          "none",
          "nil",
          "no",
          "not any",
          "koi nahi",
          "kuch nahi",
          "first application",
          "no earlier application",
          "no other application"
        ]
      }
    }
  ]
}
```

### 2. Golden fixtures 15 to 17 (`scripts/golden-set/fixtures`)

- Replace `elapsed_days` and `offence_punishment_max_years` in the inputs with `period_claimed` = "60 days" and `period_expiry_date` (a date after `remand_date`). Fixture 17's old expected values ("65", "65 days") go; the draft must now contain the first-remand date, "60 days" and the expiry date, and **no count of days in custody**.
- An assertion that `days_elapsed` or `punishment_category` is *unlocked* flips to *banned*. An assertion that `statutory_period_expired` is banned flips to *allowed*, when the new keys are present, and stays banned when `period_expiry_date` is missing.
- Add one case: `period_claimed` empty -> the draft carries `[To be confirmed: the default-bail period that applies to this offence]`.
- List each changed expectation for me.

### 3. Text inside `default_bail.json`

| Field | New value, exact |
|---|---|
| `title` | `Default Bail Application` |
| `displayName` | `Default Bail Application` |
| `_meta.description` | `Document-rules config for default_bail: statutory bail when a police report has not been filed within the period the advocate states` |
| `_meta.validated_by` | `Ajay (CLO), T-251, 12 Oct 2026` |
| `_meta.last_updated` | `2026-10-12` |
| `_meta.change_protocol` | `All edits require CLO sign-off.` (the line about `elapsed_days` goes) |
| `_meta.note` (new) | `A practising advocate checks this pack before it goes live, in particular the default-bail periods (60 and 90 days), which the pack leaves to the advocate to state.` |
| `mandatory_clauses` (snake case) | Delete it: the reader uses `mandatoryClauses`. Its line "computation of days from first remand" is the defect this ticket removes |

Rule for every pack: a `displayName` or `title` carries no section number of one code only (the Drafter sees it). A number is allowed only as a pair, for example `(BNSS 480 / CrPC 437)`. The T-239 specs whose `displayName` shows only a new-code number are amended the same way when built.

{governing_provision} with a code default: fine. Where the code default fills a blank, the T-194 export header still counts it.

Signed: Ajay (CLO), 12 Oct 2026 IST.
