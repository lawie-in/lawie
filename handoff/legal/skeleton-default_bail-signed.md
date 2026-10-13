# Clause skeleton: default_bail (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. ADR-025 D1, T-374. Built from my signed texts: T-190 and T-199 (questions), T-251 (default bail), T-334 (none phrasings), T-341 (warnings), T-359 (no added facts), T-367 (BNSS 187), and the `_averments` files.

## Rules for this skeleton

- `source: fixed`: render only the signed text, with slots filled from ledger facts. A missing slot renders as `{{MISSING: label}}`.
- `source: advocate`: the advocate's own words for that key only, with grammar fixes only (renderer rule 3).
- `required: true`: a clause with no matching variant or no fact renders its MISSING form (`missing_label`). `required: false` with no fact is left out.
- `when` / `variants`: a condition on a ledger value. `none_values` means the T-334 `first_bail_application` equals list. `no_recovery.equals` means that averment's signed list.
- Roots, character, flight history, custody length and extra grounds have no clause unless the advocate gave the fact, so they cannot render (T-359).
- Grounds are rendered only from the ticked `grounds_for_bail` options, with the signed sentence per option. A ground's `requires` that fails renders its MISSING form.
- Title, prayer, verification and the advocate block stay code-assembled (ADR-021). The verification relation comes from a ledger key, or a blank (T-359 AC6).
- Any change to this JSON needs a fresh sign-off. The loader's hash test pins the SHA below.

## Re-sign, 13 Oct 2026 (supersedes 07706c2)

- Clause ids renamed to this pack's ids in ADR-025's mandatoryClauses list (40a4e6e). Order, slots and conditions unchanged. One wording change: the arrest and first-remand lines merge into the single `custody_dates` clause ("The applicant was arrested on {arrest_date} and was first remanded to custody on {remand_date}."), and both dates stay required. Old SHA `b4ce897d3bdef32f30478e38dd781c85d44eb169e1e1df1a0bc0b9785eb1da43`.
- The undertakings clause takes the pack's flight-risk / undertakings id: it is a future undertaking, not a fact, so it stays `source: fixed`.
- Grounds render as the fixed signed sentence per ticked option. This is stricter than renderer rule 3 and stays so.
- `when`, `variants` and `none_values` extend the ADR format. The loader must read them; it must not drop them.

## Skeleton JSON

```json
{
  "pack": "default_bail",
  "version": 1,
  "none_values": "first_bail_application.equals (T-334)",
  "clauses": [
    {
      "id": "statutory_provision",
      "order": 10,
      "required": true,
      "source": "fixed",
      "text": "The applicant, {applicant_name}, resident of {applicant_address}, submits this application for release on bail under Section 187(3) of the Bharatiya Nagarik Suraksha Sanhita, 2023.",
      "slots": [
        "applicant_name",
        "applicant_address"
      ]
    },
    {
      "id": "fir",
      "order": 20,
      "required": true,
      "source": "fixed",
      "text": "FIR No. {fir_number} dated {fir_date} was registered at Police Station {police_station} under {offences_alleged}.",
      "slots": [
        "fir_number",
        "fir_date",
        "police_station",
        "offences_alleged"
      ]
    },
    {
      "id": "custody_dates",
      "order": 30,
      "required": true,
      "source": "fixed",
      "text": "The applicant was arrested on {arrest_date} and was first remanded to custody on {remand_date}.",
      "slots": [
        "arrest_date",
        "remand_date"
      ]
    },
    {
      "id": "applicable_window",
      "order": 40,
      "required": true,
      "source": "fixed",
      "variants": [
        {
          "when": {
            "key": "period_claimed",
            "in": [
              "60 days",
              "90 days"
            ]
          },
          "text": "It is submitted that the default-bail period applicable to the offence charged is {period_claimed}.",
          "slots": [
            "period_claimed"
          ]
        },
        {
          "when": {
            "key": "period_claimed",
            "in": [
              "Period under a special Act"
            ]
          },
          "text": "It is submitted that the default-bail period applicable is {special_act_period}.",
          "slots": [
            "special_act_period"
          ]
        }
      ],
      "missing_label": "Default-bail period that applies",
      "t327_brief_blank_covers": true
    },
    {
      "id": "non_filing",
      "order": 50,
      "required": true,
      "source": "fixed",
      "variants": [
        {
          "when": {
            "key": "charge_sheet_status",
            "in": [
              "Not filed"
            ]
          },
          "text": "As on the date of this application, the police report (charge sheet) has not been filed."
        },
        {
          "when": {
            "key": "charge_sheet_status",
            "in": [
              "Filed but defective / incomplete"
            ]
          },
          "text": "The charge sheet was filed but is defective or incomplete."
        },
        {
          "when": {
            "key": "charge_sheet_status",
            "in": [
              "Filed after expiry of statutory period"
            ]
          },
          "text": "The charge sheet was filed after the expiry of the statutory period."
        }
      ],
      "missing_label": "Charge Sheet Status"
    },
    {
      "id": "indefeasible_right",
      "order": 60,
      "required": false,
      "source": "fixed",
      "when": {
        "all_of": [
          {
            "key": "remand_date",
            "present": true
          },
          {
            "key": "period_claimed",
            "in": [
              "60 days",
              "90 days"
            ]
          },
          {
            "key": "period_expiry_date",
            "present": true
          },
          {
            "key": "charge_sheet_status",
            "present": true
          }
        ]
      },
      "text": "It is submitted that the default-bail period of {period_claimed} from the first remand on {remand_date} expired on {period_expiry_date}, and that the applicant is therefore entitled to be released on bail.",
      "slots": [
        "period_claimed",
        "remand_date",
        "period_expiry_date"
      ]
    },
    {
      "id": "earlier_applications",
      "order": 70,
      "required": true,
      "source": "fixed",
      "variants": [
        {
          "when": {
            "key": "earlier_bail_applications",
            "in": "none_values"
          },
          "text": "No other bail application has been made by the applicant in this matter."
        },
        {
          "when": {
            "key": "earlier_bail_applications",
            "present": true
          },
          "text": "The earlier bail applications in this matter are: {earlier_bail_applications}.",
          "slots": [
            "earlier_bail_applications"
          ]
        }
      ],
      "missing_label": "Earlier bail applications in this matter"
    },
    {
      "id": "willingness",
      "order": 90,
      "required": true,
      "source": "fixed",
      "variants": [
        {
          "when": {
            "key": "willingness_to_furnish_bond",
            "in": [
              true,
              "true",
              "yes"
            ]
          },
          "text": "The applicant undertakes to furnish bail bonds and sureties as this Hon'ble Court directs."
        }
      ],
      "missing_label": "Whether the applicant will furnish bail bonds and sureties"
    }
  ]
}
```

SHA-256 of the JSON block (between the fences, final newline included): `1f0384f6c8f2feffa289622b63c9bb8c1b9c698cb5744c9159fc079032349720`
