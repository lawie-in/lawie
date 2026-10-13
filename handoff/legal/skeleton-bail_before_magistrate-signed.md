# Clause skeleton: bail_before_magistrate (signed)

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

- Clause ids renamed to this pack's ids in ADR-025's mandatoryClauses list (40a4e6e). Wording, order, slots and conditions unchanged. Old SHA `99eda4f26f7ac146d463b8e096c122a6be24924151d96378b412799ac1ac93b7`.
- The undertakings clause takes the pack's flight-risk / undertakings id: it is a future undertaking, not a fact, so it stays `source: fixed`.
- Grounds render as the fixed signed sentence per ticked option. This is stricter than renderer rule 3 and stays so.
- `when`, `variants` and `none_values` extend the ADR format. The loader must read them; it must not drop them.

## Version 2, 13 Oct 2026 (supersedes v1 at 0204a7e, SHA `728374339fa5a0f3f8354608cab5a226979bc9ba4b9e8cc33123571652ad320e`)

- The pack's `grounds_for_bail` is free text, so `grounds` is now `source: advocate`: the advocate's own words with grammar fixes only, after the signed intro. The option list is removed, and with it prolonged_custody and its `custody_since` slot.
- Slots that are ledger keys, not pack fields, are valid. The ledger is the source under D1. `false_implication_reason`, `civil_dispute_particulars` and `police_action` come from the `_averments` files (anticipatory and Magistrate inherit bail_regular). `facts_narrative` and `additional_context` must be put into the ledger by the brief for every bail pack. If a key is absent, a required clause renders its MISSING form and an optional clause is left out. Nothing is ever invented to fill it.

## Version 3, 13 Oct 2026 (supersedes v2 at b61aaf9, SHA `f610ebdd928c48f22affcd1325a7280168b64fa51af8f53b7167cd18714e5423`)

- `grounds` gets `list: true` (Arjun's ruling 4). Each ground the ledger holds renders as its own item in the advocate's words, with grammar fixes only, under the signed intro.
- `medical` loses `skip_if_rendered`, because free-text grounds have no `medical_grounds` item to point at. If the advocate gives a medical condition, it prints once in the `medical` clause.

## Version 4, 13 Oct 2026 (supersedes SHA `683616eb289f1bc08b9a6ee533d447871d5f6940e9899d5262fcf00d930206fe`)

- The `antecedents` none variant now matches its own list, `antecedents_none_values`, instead of the T-334 earlier-application list. That list was for earlier bail applications, so "first bail application" would have counted as no antecedents, and "No criminal record" did not match. Matching is on the whole answer, after the T-334 folding (case, spaces and punctuation). Any other answer prints in the "are: {antecedents}" variant.
- Left out on purpose: "no other case" and "no case pending", because they speak to pending cases, not past record.
- The loader resolves a `when.in` string by looking up the top-level key it names.

## Skeleton JSON

```json
{
  "pack": "bail_before_magistrate",
  "version": 4,
  "none_values": "first_bail_application.equals (T-334)",
  "antecedents_none_values": [
    "none",
    "nil",
    "no",
    "not applicable",
    "no criminal record",
    "no criminal antecedents",
    "no antecedents",
    "no previous record",
    "no past record",
    "no prior record",
    "no previous criminal record",
    "no criminal history",
    "clean record",
    "koi record nahi",
    "koi criminal record nahi",
    "koi aapradhik record nahi",
    "कोई नहीं",
    "कोई आपराधिक रिकॉर्ड नहीं"
  ],
  "clauses": [
    {
      "id": "offence_classification",
      "order": 10,
      "required": true,
      "source": "fixed",
      "variants": [
        {
          "when": {
            "key": "offence_classification",
            "in": [
              "Bailable"
            ]
          },
          "text": "The applicant, {applicant_name}, aged {applicant_age} years, resident of {applicant_address}, submits this application for bail under Section 478 of the Bharatiya Nagarik Suraksha Sanhita, 2023, the offence alleged being bailable.",
          "slots": [
            "applicant_name",
            "applicant_age",
            "applicant_address"
          ]
        },
        {
          "when": {
            "key": "offence_classification",
            "in": [
              "Non-bailable (within Magistrate's powers)"
            ]
          },
          "text": "The applicant, {applicant_name}, aged {applicant_age} years, resident of {applicant_address}, submits this application for bail under Section 480 of the Bharatiya Nagarik Suraksha Sanhita, 2023.",
          "slots": [
            "applicant_name",
            "applicant_age",
            "applicant_address"
          ]
        }
      ],
      "missing_label": "Offence Classification"
    },
    {
      "id": "fir_particulars",
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
      "id": "custody",
      "order": 30,
      "required": false,
      "source": "fixed",
      "text": "The applicant is lodged in {jail}.",
      "slots": [
        "jail"
      ]
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
      "id": "days_in_custody",
      "order": 32,
      "required": false,
      "source": "fixed",
      "text": "The applicant has been in custody for {days_in_custody} days.",
      "slots": [
        "days_in_custody"
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
            "in": "antecedents_none_values"
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
      "source": "advocate",
      "list": true,
      "slot": "grounds_for_bail",
      "intro": "The applicant seeks bail on the following grounds:"
    },
    {
      "id": "woman_proviso",
      "order": 72,
      "required": false,
      "source": "fixed",
      "when": {
        "all_of": [
          {
            "key": "applicant_sex",
            "in": [
              "female"
            ]
          },
          {
            "key": "offence_classification",
            "in": [
              "Non-bailable (within Magistrate's powers)"
            ]
          }
        ]
      },
      "text": "It is submitted that the applicant is a woman, and under the first proviso to Section 480(1) of the BNSS this Hon'ble Court may release her on bail even where the offence falls within clause (i) or (ii) of that sub-section."
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
      "id": "triple_test",
      "order": 89,
      "required": false,
      "source": "fixed",
      "text": "The applicant resides at {applicant_address} and has roots in society: {local_ties}.",
      "slots": [
        "applicant_address",
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
      ]
    },
    {
      "id": "sureties",
      "order": 92,
      "required": false,
      "source": "fixed",
      "when": {
        "key": "sureties_available",
        "in": [
          "Yes"
        ]
      },
      "text": "Sureties are available."
    },
    {
      "id": "undertakings",
      "order": 95,
      "required": true,
      "source": "fixed",
      "text": "If released on bail, the applicant undertakes not to abscond, not to tamper with the evidence or influence any witness, to appear before the Court on every date fixed, and to abide by every condition the Court may impose."
    }
  ]
}
```

SHA-256 of the JSON block (between the fences, final newline included): `0404960987deb50cc19d24ef70535298185aa0c882db8ddc0afa39fbe9794f23`
