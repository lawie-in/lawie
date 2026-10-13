# Clause skeleton: bail_regular (signed)

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

- Clause ids renamed to this pack's ids in ADR-025's mandatoryClauses list (40a4e6e). Wording, order, slots and conditions unchanged. Old SHA `03a11bd864dbf325fa1be70401473a08e96719d6cb8ab2c698c26e720eaa816a`.
- The undertakings clause takes the pack's flight-risk / undertakings id: it is a future undertaking, not a fact, so it stays `source: fixed`.
- Grounds render as the fixed signed sentence per ticked option. This is stricter than renderer rule 3 and stays so.
- `when`, `variants` and `none_values` extend the ADR format. The loader must read them; it must not drop them.

## Skeleton JSON

```json
{
  "pack": "bail_regular",
  "version": 1,
  "none_values": "first_bail_application.equals (T-334)",
  "clauses": [
    {
      "id": "opening",
      "order": 10,
      "required": true,
      "source": "fixed",
      "text": "The applicant, {applicant_name}, aged {applicant_age} years, resident of {address}, submits this application for regular bail under Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023.",
      "slots": [
        "applicant_name",
        "applicant_age",
        "address"
      ]
    },
    {
      "id": "fir_details",
      "order": 20,
      "required": true,
      "source": "fixed",
      "text": "FIR No. {fir_number} dated {fir_date} was registered at Police Station {police_station} under {sections_charged}.",
      "slots": [
        "fir_number",
        "fir_date",
        "police_station",
        "sections_charged"
      ]
    },
    {
      "id": "custody_status",
      "order": 30,
      "required": true,
      "source": "fixed",
      "when": {
        "key": "currently_in_custody",
        "in": [
          "yes_judicial",
          "yes_police"
        ]
      },
      "text": "The applicant has been in {custody_kind} since {custody_since}.",
      "slots": [
        "custody_kind",
        "custody_since"
      ],
      "derived": {
        "custody_kind": {
          "from": "currently_in_custody",
          "map": {
            "yes_judicial": "judicial custody",
            "yes_police": "police custody"
          }
        }
      }
    },
    {
      "id": "arrested_on",
      "order": 31,
      "required": false,
      "source": "fixed",
      "text": "The applicant was arrested on {arrest_date}.",
      "slots": [
        "arrest_date"
      ]
    },
    {
      "id": "facts",
      "order": 40,
      "required": true,
      "source": "advocate",
      "slot": "facts_narrative",
      "intro": "The brief facts of the case are as follows:"
    },
    {
      "id": "chargesheet_filed",
      "order": 50,
      "required": false,
      "source": "fixed",
      "when": {
        "key": "investigation_status",
        "in": [
          "charge_sheet_filed"
        ]
      },
      "text": "The charge sheet has been filed in this case."
    },
    {
      "id": "antecedents",
      "order": 60,
      "required": true,
      "source": "fixed",
      "variants": [
        {
          "when": {
            "key": "antecedents",
            "in": "none_values"
          },
          "text": "The applicant has no criminal antecedents."
        },
        {
          "when": {
            "key": "antecedents",
            "present": true
          },
          "text": "The criminal antecedents of the applicant are: {antecedents}.",
          "slots": [
            "antecedents"
          ]
        }
      ],
      "missing_label": "Criminal antecedents"
    },
    {
      "id": "earlier_applications",
      "order": 65,
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
      "id": "grounds",
      "order": 70,
      "required": true,
      "source": "fixed",
      "list": true,
      "intro": "The applicant seeks bail on the following grounds:",
      "from": "grounds_for_bail",
      "items": {
        "false_implication": {
          "text": "The applicant has been falsely implicated in this case."
        },
        "no_flight_risk": {
          "text": "There is no likelihood of the applicant fleeing from justice."
        },
        "no_criminal_antecedent": {
          "use_clause": "antecedents"
        },
        "cooperation": {
          "text": "The applicant will cooperate with the investigation and the trial."
        },
        "no_evidence_tampering": {
          "text": "There is no likelihood of the applicant tampering with the evidence or influencing any witness."
        },
        "prolonged_custody": {
          "text": "The applicant has been in custody since {custody_since}.",
          "slots": [
            "custody_since"
          ]
        },
        "investigation_complete": {
          "text": "The charge sheet has been filed, and the custodial interrogation of the applicant is not required.",
          "requires": {
            "key": "investigation_status",
            "in": [
              "charge_sheet_filed"
            ]
          },
          "missing_label": "Investigation status"
        },
        "medical_grounds": {
          "text": "The applicant seeks bail on medical grounds, the applicant suffering from {medical_condition}.",
          "slots": [
            "medical_condition"
          ]
        },
        "willing_mediation": {
          "text": "The applicant is willing to take part in mediation or counselling."
        },
        "youth_first_time": {
          "text": "The applicant is aged {applicant_age} years.",
          "slots": [
            "applicant_age"
          ]
        }
      }
    },
    {
      "id": "further_grounds",
      "order": 75,
      "required": false,
      "source": "advocate",
      "slot": "additional_context"
    },
    {
      "id": "false_implication_reason",
      "order": 76,
      "required": false,
      "source": "advocate",
      "slot": "false_implication_reason",
      "intro": "The applicant has been falsely implicated on account of"
    },
    {
      "id": "not_named_in_fir",
      "order": 80,
      "required": false,
      "source": "fixed",
      "when": {
        "key": "named_in_fir",
        "in": [
          "no"
        ]
      },
      "text": "The applicant is not named in the FIR."
    },
    {
      "id": "no_recovery",
      "order": 81,
      "required": false,
      "source": "fixed",
      "when": {
        "key": "recovery_status",
        "in": "no_recovery.equals"
      },
      "text": "Nothing has been recovered from the applicant."
    },
    {
      "id": "recovery_stated",
      "order": 82,
      "required": false,
      "source": "advocate",
      "when": {
        "key": "recovery_status",
        "not_in": "no_recovery.equals"
      },
      "slot": "recovery_status",
      "intro": "As to recovery:"
    },
    {
      "id": "cooperated",
      "order": 83,
      "required": false,
      "source": "fixed",
      "when": {
        "key": "cooperated_with_investigation",
        "in": [
          "yes"
        ]
      },
      "text": "The applicant has cooperated with the investigation."
    },
    {
      "id": "s35_notice",
      "order": 84,
      "required": false,
      "source": "fixed",
      "when": {
        "key": "s35_notice_status",
        "in": [
          "not_served"
        ]
      },
      "text": "No notice under Section 35 of the Bharatiya Nagarik Suraksha Sanhita, 2023 was served on the applicant before arrest."
    },
    {
      "id": "parity",
      "order": 85,
      "required": false,
      "source": "fixed",
      "text": "A co-accused has been granted bail by {co_accused_bail_court} by order dated {co_accused_bail_date}.",
      "slots": [
        "co_accused_bail_court",
        "co_accused_bail_date"
      ],
      "render_if_any_slot": "co_accused_bail_court"
    },
    {
      "id": "occupation",
      "order": 86,
      "required": false,
      "source": "fixed",
      "text": "The applicant's occupation is {applicant_occupation}.",
      "slots": [
        "applicant_occupation"
      ]
    },
    {
      "id": "sole_breadwinner",
      "order": 87,
      "required": false,
      "source": "fixed",
      "when": {
        "key": "sole_earning_member",
        "in": [
          "yes"
        ]
      },
      "text": "The applicant is the only earning member of the family."
    },
    {
      "id": "dependants",
      "order": 88,
      "required": false,
      "source": "fixed",
      "text": "{dependants} depend on the applicant.",
      "slots": [
        "dependants"
      ]
    },
    {
      "id": "roots",
      "order": 89,
      "required": false,
      "source": "fixed",
      "text": "The applicant resides at {address} and has roots in society: {local_ties}.",
      "slots": [
        "address",
        "local_ties"
      ],
      "render_if_any_slot": "local_ties"
    },
    {
      "id": "medical",
      "order": 90,
      "required": false,
      "source": "fixed",
      "text": "The applicant suffers from {medical_condition}.",
      "slots": [
        "medical_condition"
      ],
      "skip_if_rendered": "grounds.medical_grounds"
    },
    {
      "id": "no_flight_risk",
      "order": 95,
      "required": true,
      "source": "fixed",
      "text": "If released on bail, the applicant undertakes not to abscond, not to tamper with the evidence or influence any witness, to appear before the Court on every date fixed, and to abide by every condition the Court may impose."
    }
  ]
}
```

SHA-256 of the JSON block (between the fences, final newline included): `40e2d56dd4f9f51811416d4432ae6cf0b7c00b39bb6fb174890ca4aeceda6248`
