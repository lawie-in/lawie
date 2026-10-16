# Skeleton missing labels, pending (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Asked for by Vishal (T-373): required advocate clauses had no `missing_label`, so a gap showed the raw key in the checks panel.

**Landing rule.** `t374-skeletons.test.ts` pins the signed md files. So each JSON below goes into BOTH `handoff/legal/skeleton-<pack>-signed.md` (JSON block and SHA line, with a version-history note) AND `_skeletons/<pack>.json`, in one commit, by the lead who holds `_skeletons/`. Until then nothing changes and CI stays green.

| Pack | Clause | `missing_label` | New version | New SHA-256 |
|---|---|---|---|---|
| bail_regular | facts | `Brief facts of the case` | v3 | `4eec8dfb4ea8f7fac728675df30c032e8f8555b75cdfeaf1f59b5f7acc7c843b` |
| bail_anticipatory | apprehension | `Brief facts and reasons for apprehending arrest` | v4 | `bd20c4a0cae5347b49a7999dd9bafd93cfd0baeccefd271635103bc1759bf858` |
| bail_before_magistrate | facts | `Brief facts of the case` | v5 | `c52210817dd3a14e6c7f663dc678944334245cc6b4359a1f0eac719bfeba81cd` |
| bail_before_magistrate | grounds | `Grounds for bail` | v5 | `c52210817dd3a14e6c7f663dc678944334245cc6b4359a1f0eac719bfeba81cd` |

Nothing else changes in any clause.

## bail_regular v3

```json
{
  "pack": "bail_regular",
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

## bail_anticipatory v4

```json
{
  "pack": "bail_anticipatory",
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
      "intro": "The applicant apprehends arrest in connection with the above FIR. The brief facts and the reasons for that apprehension are as follows:",
      "missing_label": "Brief facts and reasons for apprehending arrest"
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

## bail_before_magistrate v5

```json
{
  "pack": "bail_before_magistrate",
  "version": 5,
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
      "source": "advocate",
      "list": true,
      "slot": "grounds_for_bail",
      "intro": "The applicant seeks bail on the following grounds:",
      "missing_label": "Grounds for bail"
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

## Closed (13 Oct 2026)

Landed with T-373 (merged 3e031ac). I checked on develop_staging: `_skeletons/bail_regular.json`, `bail_anticipatory.json` and `bail_before_magistrate.json` hash to the SHAs above (4eec8dfb…, bd20c4a0…, c5221081…), and the signed md files carry the same SHAs. Nothing in this file is still open.
