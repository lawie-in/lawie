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

## Version 2, 13 Oct 2026 (supersedes SHA `40e2d56dd4f9f51811416d4432ae6cf0b7c00b39bb6fb174890ca4aeceda6248`)

- The `antecedents` none variant now matches its own list, `antecedents_none_values`, instead of the T-334 earlier-application list. That list was for earlier bail applications, so "first bail application" would have counted as no antecedents, and "No criminal record" did not match. Matching is on the whole answer, after the T-334 folding (case, spaces and punctuation). Any other answer prints in the "are: {antecedents}" variant.
- Left out on purpose: "no other case" and "no case pending", because they speak to pending cases, not past record.
- The loader resolves a `when.in` string by looking up the top-level key it names.

## Version 3, 13 Oct 2026 (supersedes SHA `604acbe65cd5df1b3981626bd868ceec3f1c62475b212f90d44e4a29fa5380f4`)

- v3, 13 Oct 2026: missing_label added per skeleton-missing-labels-pending-signed.md (07bd3b5), signed Ajay. `facts` gets `missing_label` "Brief facts of the case". Nothing else changes in any clause.

## Version 4, 14 Oct 2026 (supersedes SHA `4eec8dfb4ea8f7fac728675df30c032e8f8555b75cdfeaf1f59b5f7acc7c843b`)

- v4, 14 Oct 2026: T-245a, per handoff/legal/T-245-old-new-law-switch-signed.md Addenda 1, 2 and 3 (2992891, d5a3005, 8e3167e), signed Ajay. The opening clause's `Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023` becomes `{governing_provision}` (slot `governing_provision`; court-keyed 437/439 → 480/483, Addendum 1 ruling 2). The `s35_notice` clause's `Section 35 of the Bharatiya Nagarik Suraksha Sanhita, 2023` becomes `{notice_provision}` (slot `notice_provision`, Addendum 2 ruling 1): BNSS `Section 35(3) of the BNSS`; CrPC `Section 41A of the CrPC`; no choice `[To be confirmed: Section 41A of the CrPC or Section 35(3) of the BNSS]`. Nothing else changes in any clause.

## Version 5, 23 Oct 2026 (supersedes SHA `d09d7bac30fd495f9c8c4e6db3898525ee0f0977c286df3c65c909d5ebfda54d`)

- v5, 23 Oct 2026, T-577: the only change is a new top-level block, `"bodyParagraphs": { "default": 10, "cap": 25 }`, plus `"version": 5`. No clause text, slot, condition or order changes. `mandatory` is not stored; it is derived from the clauses with `required: true` whose `when` holds (AJ-577-M3/M5). Signed SHA-256 of `_skeletons/bail_regular.json` v5: `5dcb06872b948920697adf5b795251742004b2874c480c3c9ca0595f2f0e9995` (I rebuilt the file from v4 plus this diff and the hash matched). The parked T-500 changes, if they land later, become v6 with a new signature.

## Version 6, 27 Oct 2026 (supersedes SHA `5dcb06872b948920697adf5b795251742004b2874c480c3c9ca0595f2f0e9995`)

- v6, 27 Oct 2026, T-612 (Tanvi, fix/t-612-bail-grounds @ commit SHA d1e85da6). Changes, all per `T-612-bail-grounds-wording-signed.md` (72ffc479, 73e3be57, 42b0ac55): new grounds `business_dispute_civil_in_nature` (G1), `amount_paid_or_deposited` (G2), `only_earning_member` (G3, `use_clause: sole_breadwinner`, `requires: sole_earning_member = yes`, signed missing_label), `ready_to_furnish_bail_bond_and_sureties` (G4), each with my signed sentence byte for byte; `sole_breadwinner` gets `skip_if_rendered: grounds.only_earning_member`, so it never prints twice; new top-level `medical_condition_none_values` (None, none, no, नहीं, कोई नहीं, T-612 (4)), so the `medical` clause prints only when the answer is not a none value, and the `medical_grounds` ground with a none answer renders its MISSING form (the gate asks, never drafts it). No roots fallback (T-612 (7)1). No other text, slot or order change. I checked the diff against v5 line by line. Signed SHA-256 of `_skeletons/bail_regular.json` v6: `91fbd67a36b0909aa857d3f597da6b28c33d9cd0c7827692fd491b3a726fff41`. The parked T-500 changes, if they land, become v7.

## Version 7, 28 Oct 2026 (supersedes SHA `91fbd67a36b0909aa857d3f597da6b28c33d9cd0c7827692fd491b3a726fff41`)

- v7, 28 Oct 2026, T-638 (Tanvi, fix/t-638-bail-custody-ps @ commit SHA 0469b3ae). Per `T-612-bail-grounds-wording-signed.md` (5) and T-638 B3–B5: a new clause `custody_status_derived` (order 29, not required), shown only when `currently_in_custody` is yes_judicial/yes_police **and** the ledger holds `custody_since_derived`, with my signed text `The applicant was arrested on {custody_since} and is now in {custody_kind}.` and the same custody_kind map. `custody_status` and `arrested_on` get `skip_if_rendered: custody_status_derived`, so neither the custody line nor the arrest date prints twice (B4). A given custody_since keeps the original line (B5). No other text, slot or order change. I checked the diff against v6 line by line. Signed SHA-256 of `_skeletons/bail_regular.json` v7: `b15e03a2354a22c722c513f13ae6637810d5d00aee4d76699701d03e05fd2e04`.

## Skeleton JSON

```json
{
  "pack": "bail_regular",
  "version": 7,
  "bodyParagraphs": { "default": 10, "cap": 25 },
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
  "medical_condition_none_values": [
    "None",
    "none",
    "no",
    "नहीं",
    "कोई नहीं"
  ],
  "clauses": [
    {
      "id": "opening",
      "order": 10,
      "required": true,
      "source": "fixed",
      "text": "The applicant, {applicant_name}, aged {applicant_age} years, resident of {address}, submits this application for regular bail under {governing_provision}.",
      "slots": [
        "applicant_name",
        "applicant_age",
        "address",
        "governing_provision"
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
      "id": "custody_status_derived",
      "order": 29,
      "required": false,
      "source": "fixed",
      "when": {
        "all_of": [
          {
            "key": "currently_in_custody",
            "in": [
              "yes_judicial",
              "yes_police"
            ]
          },
          {
            "key": "custody_since_derived",
            "present": true
          }
        ]
      },
      "text": "The applicant was arrested on {custody_since} and is now in {custody_kind}.",
      "slots": [
        "custody_since",
        "custody_kind"
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
      },
      "skip_if_rendered": "custody_status_derived"
    },
    {
      "id": "arrested_on",
      "order": 31,
      "required": false,
      "source": "fixed",
      "text": "The applicant was arrested on {arrest_date}.",
      "slots": [
        "arrest_date"
      ],
      "skip_if_rendered": "custody_status_derived"
    },
    {
      "id": "facts",
      "order": 40,
      "required": true,
      "source": "advocate",
      "slot": "facts_narrative",
      "intro": "The brief facts of the case are as follows:",
      "missing_label": "Brief facts of the case"
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
          ],
          "requires": {
            "key": "medical_condition",
            "not_in": "medical_condition_none_values"
          }
        },
        "willing_mediation": {
          "text": "The applicant is willing to take part in mediation or counselling."
        },
        "youth_first_time": {
          "text": "The applicant is aged {applicant_age} years.",
          "slots": [
            "applicant_age"
          ]
        },
        "business_dispute_civil_in_nature": {
          "text": "The dispute between the parties is essentially civil in nature."
        },
        "amount_paid_or_deposited": {
          "text": "The amount in dispute has been paid or deposited by or on behalf of the applicant, without prejudice to the applicant's defence."
        },
        "only_earning_member": {
          "use_clause": "sole_breadwinner",
          "requires": {
            "key": "sole_earning_member",
            "in": [
              "yes"
            ]
          },
          "missing_label": "Whether the applicant is the only earning member of the family"
        },
        "ready_to_furnish_bail_bond_and_sureties": {
          "text": "The applicant is ready to furnish a bail bond with surety to the satisfaction of this Hon'ble Court and to abide by every condition this Hon'ble Court may impose."
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
      "text": "No notice under {notice_provision} was served on the applicant before arrest.",
      "slots": [
        "notice_provision"
      ]
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
      "text": "The applicant is the only earning member of the family.",
      "skip_if_rendered": "grounds.only_earning_member"
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
      "variants": [
        {
          "when": {
            "key": "medical_condition",
            "not_in": "medical_condition_none_values"
          },
          "text": "The applicant suffers from {medical_condition}.",
          "slots": [
            "medical_condition"
          ]
        }
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

SHA-256 of the JSON block (between the fences, final newline included): `b15e03a2354a22c722c513f13ae6637810d5d00aee4d76699701d03e05fd2e04`
