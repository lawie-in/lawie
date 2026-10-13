# Clause skeleton: bail_anticipatory (signed)

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

- Clause ids renamed to this pack's ids in ADR-025's mandatoryClauses list (40a4e6e). Wording, order, slots and conditions unchanged. Old SHA `cee62d78d6c6423d6ba22add12c570665fa2e76c89efcce0141b574474ca1451`.
- The undertakings clause takes the pack's flight-risk / undertakings id: it is a future undertaking, not a fact, so it stays `source: fixed`.
- Grounds render as the fixed signed sentence per ticked option. This is stricter than renderer rule 3 and stays so.
- `when`, `variants` and `none_values` extend the ADR format. The loader must read them; it must not drop them.

## Version 2, 13 Oct 2026 (supersedes v1 at 0204a7e, SHA `812f10760b0d18edf554b06df764a22058aee4a86baad00516eeef8b728932d5`)

- Grounds `items` now match the pack's ten `grounds_for_bail` options. Removed: cooperation, investigation_complete, willing_mediation, youth_first_time and no_flight_risk, which are not anticipatory options. New signed sentences: business_dispute_civil_in_nature, cooperation_with_investigation, deep_roots_in_community, abuse_of_process, complainant_motive and professional_reputation. deep_roots_in_community needs `local_ties`: with no fact it renders its MISSING blank, and when it renders the `roots` clause is skipped.
- Slots that are ledger keys, not pack fields, are valid. The ledger is the source under D1. `false_implication_reason`, `civil_dispute_particulars` and `police_action` come from the `_averments` files (anticipatory and Magistrate inherit bail_regular). `facts_narrative` and `additional_context` must be put into the ledger by the brief for every bail pack. If a key is absent, a required clause renders its MISSING form and an optional clause is left out. Nothing is ever invented to fill it.

## Version 3, 13 Oct 2026 (supersedes SHA `2a7dbd0d2ad5030ccc85d12df763f0ac3cb437318de58ba0487e36508093efda`)

- The `antecedents` none variant now matches its own list, `antecedents_none_values`, instead of the T-334 earlier-application list. That list was for earlier bail applications, so "first bail application" would have counted as no antecedents, and "No criminal record" did not match. Matching is on the whole answer, after the T-334 folding (case, spaces and punctuation). Any other answer prints in the "are: {antecedents}" variant.
- Left out on purpose: "no other case" and "no case pending", because they speak to pending cases, not past record.
- The loader resolves a `when.in` string by looking up the top-level key it names.

## Skeleton JSON

```json
{
  "pack": "bail_anticipatory",
  "version": 3,
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
      "id": "opening",
      "order": 10,
      "required": true,
      "source": "fixed",
      "text": "The applicant, {applicant_name}, aged {applicant_age} years, resident of {address}, submits this application for anticipatory bail under Section 482 of the Bharatiya Nagarik Suraksha Sanhita, 2023.",
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
      "id": "apprehension",
      "order": 40,
      "required": true,
      "source": "advocate",
      "slot": "facts_narrative",
      "intro": "The applicant apprehends arrest in connection with the above FIR. The brief facts and the reasons for that apprehension are as follows:"
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
      "source": "fixed",
      "list": true,
      "intro": "The applicant seeks anticipatory bail on the following grounds:",
      "from": "grounds_for_bail",
      "items": {
        "false_implication": {
          "text": "The applicant has been falsely implicated in this case."
        },
        "business_dispute_civil_in_nature": {
          "text": "The dispute between the parties is essentially civil in nature."
        },
        "no_criminal_antecedent": {
          "use_clause": "antecedents"
        },
        "cooperation_with_investigation": {
          "text": "The applicant will cooperate with the investigation and the trial."
        },
        "deep_roots_in_community": {
          "text": "The applicant has roots in society: {local_ties}.",
          "slots": [
            "local_ties"
          ]
        },
        "no_evidence_tampering": {
          "text": "There is no likelihood of the applicant tampering with the evidence or influencing any witness."
        },
        "abuse_of_process": {
          "text": "The criminal process is being used as a means of recovering money in a civil dispute."
        },
        "complainant_motive": {
          "text": "The complaint has been made with an ulterior motive."
        },
        "medical_grounds": {
          "text": "The applicant seeks bail on medical grounds, the applicant suffering from {medical_condition}.",
          "slots": [
            "medical_condition"
          ]
        },
        "professional_reputation": {
          "text": "The applicant's arrest would cause irreparable harm to the applicant's professional reputation."
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
      "id": "civil_dispute",
      "order": 77,
      "required": false,
      "source": "advocate",
      "slot": "civil_dispute_particulars",
      "intro": "It is submitted that the dispute is civil in nature:"
    },
    {
      "id": "police_action",
      "order": 78,
      "required": false,
      "source": "advocate",
      "slot": "police_action",
      "intro": "As to the action taken by the police so far:"
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
      "render_if_any_slot": "local_ties",
      "skip_if_rendered": "grounds.deep_roots_in_community"
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
      "text": "If granted anticipatory bail, the applicant undertakes to make himself or herself available for interrogation by a police officer as and when required, not to make any inducement, threat or promise to any person acquainted with the facts of the case, not to leave India without the previous permission of the Court, and to abide by every other condition the Court may impose."
    }
  ]
}
```

SHA-256 of the JSON block (between the fences, final newline included): `50b7dd20bcaccdbc10c6bd35094ac754e8605ba8c03dfa5855c372d9eed04d1e`
