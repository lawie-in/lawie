# T-277: corrected BNS offences table (signed)

Ajay (CLO), 12 Oct 2026 IST. Replaces `apps/drafting/src/config/bns-offences.json` (my table of 10 May 2026). Rebuilt from the Gazette (BNS headings) and the BNSS First Schedule Part I (Gazette of India Extraordinary, 25 Dec 2023, CG-DL-E-25122023-250884) and BNSS s.359. Evidence for every change: the rebuild's `diff.md`, held by me.

## What was wrong

Of 305 rows, **74 were under the wrong key or named a different offence**: abetment (50, 51), culpable homicide (104, 105), wrongful confinement (128 to 130), kidnapping for ransom (138), public servants and apprehension (200 to 269), mischief and cheating (315 to 328), documents and property marks (344 to 348), false statements (354). "Hostage-taking" (114) is not in the BNS. Each row carries its own bailable, cognizable and punishment, so **77 keys contradicted the Schedule for the same key (31 wrong on bailable, 58 on cognizable)**. The dangerous direction, where the file said bailable and the Schedule says non-bailable, included 83, 327, 75, 161, 204, 132, 276; the reverse included 137, 67, 341, 295, 283, 248.

## What changed

- 285 corrected rows plus 32 Schedule rows for sections the shifted rows displaced (104, 200, 220, 254, 262, 313 and others): **317 rows**. 20 rows removed: 6 duplicates, 1 not a Gazette offence, 3 folded into a parent section, 10 unclear (their offences are now under their own keys).
- Titles are the Gazette heading of the parent section for every row, sub-section rows included.
- `null` means the Schedule gives no single answer ("according as the offence is…", sub-sections that differ, a conditional cognizability), or the section is a definition with no Schedule line. Mixed rows carry `variants` (each sub-section's Schedule values) and a `verify` note.
- **My change to the rebuild:** the Schedule prints non-cognizable and non-bailable together on 81, 83, 230, 231, 276, 337, 342, 343, 353(1). That is an unusual combination and I could not check it against India Code (unreachable). Bailable and cognizable are `null` on those rows, with a `verify` note, until checked. Terms of 7 years or more printed as bailable (137(2), 67 and others) are kept: they match the old-law position and the Schedule.

## What the lead does (shashank)

1. Replace `apps/drafting/src/config/bns-offences.json` with the JSON block below, byte for byte. SHA-256 of the block text (between the fences, with its final newline): `5f0ac29ad09aaed919826275cf22c425766c8dc7196dd089bfd5c8dacecb07de`.
2. **Null handling is required before this file is used.** `timeline.service.ts` does `offence.max_years > maxYears`, which treats `null` as 0 and would pick the shortest BNSS s.187 default-bail period: wrong, and in the dangerous direction. A `null` `max_years` must give no period at all, with the line "Depends on the offence. Check BNSS section 187." `bail-check.service.ts` must show a `null` bailable or cognizable as "Depends. Check the First Schedule." and never as `false`.
3. **Resolving a target.** A table target resolves to its exact key if there is one (318(4), 303(2), 106(2)); otherwise to its parent row (316(2) to 316, 103(1) to 103, 106(1) to 106, 125(a) to 125, 326(a) to 326); if the parent row has `variants`, use the variant for that sub-section. A target with no row and no parent (the definitions, exceptions and general sections 1 to 46, 100 to 102, 116, 128 to 130 under the old numbers, 167, 169, 330(1), 330(2), 335, 358): bail-check says "This section does not create an offence. Check the Gazette." Do not add definition rows.
4. Tests that asserted the old titles or attributes: change an expectation only where it encoded a wrong pair or value, and list each for me. Moved golden snapshots are listed for me before merge.
5. `grep` the packs, prompts and tests for any offence title or bailability statement taken from this file; anything that disagrees goes to me.

## Marks

| Item | Mark |
|---|---|
| Table as the signed `bns-offences.json` | Approved |
| Titles | Approved: Gazette headings |
| bailable, cognizable, punishment | Approved: BNSS First Schedule Part I as enacted; I did not check for a later amendment |
| compoundable | Approved: BNSS s.359 tables |
| The 9 rows with an unusual printed combination | Acceptable with `null` until checked. Follow-up: India Code |
| Punishment text | Compared by maximum term only; a difference in a minimum term or fine is not detected. Follow-up |
| India Code check | Follow-up when it can be fetched |

## The table (signed)

```json
{
  "_meta": {
    "description": "BNS 2023 offence classification — bail, punishment, cognizability, compoundability per First Schedule",
    "source": "Bharatiya Nyaya Sanhita, 2023 (Act No. 45 of 2023), First Schedule",
    "effective_date": "2024-07-01",
    "validated_by": "Ajay (CLO) - 2026-10-12 - corrected table (T-277); keys re-aligned to the Gazette, titles are the Gazette headings, bailable, cognizable and punishment from the BNSS First Schedule Part I, compoundable from BNSS s.359",
    "last_updated": "2026-10-12",
    "owner": "Ajay (CLO)",
    "change_protocol": "All edits to this file require CLO sign-off. Vishal must not add new entries; he can only flag missing sections by opening a Jira ticket assigned to Ajay.",
    "t277_recheck": "Rebuilt 2026-10-12 by Claude (Dev crew) for CLO review: keys re-aligned to the Gazette (Act 45 of 2023), titles set to the Gazette heading of the parent section, bailable/cognizable/punishment checked against BNSS 2023 First Schedule Part I and compoundable against BNSS 2023 s.359 (Gazette of India Extraordinary, 25 Dec 2023). A null attribute means the Schedule does not give a single answer (see the verify note and variants) or no Schedule row exists. Signed by the CLO 12 Oct 2026."
  },
  "offences": {
    "47": {
      "title": "Abetment in India of offences outside India",
      "punishment": "Same as the offence abetted",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "No First Schedule row for 47. Classification attributes not available: set to null."
    },
    "48": {
      "title": "Abetment outside India for offence in India",
      "punishment": "Same as the offence abetted",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "No First Schedule row for 48. Classification attributes not available: set to null."
    },
    "49": {
      "title": "Punishment of abetment if act abetted is committed in consequence and where no express provision is made for its punishment",
      "punishment": "Same as for offence abetted.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. bailable: depends on the offence in question (Schedule: \"according as\"); cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "49": {
          "offence": "Abetment of any offence, if the act abetted is committed in consequence, and where no express provision is made for its punishment.",
          "punishment": "Same as for offence abetted.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "50": {
      "title": "Punishment of abetment if person abetted does act with different intention from that of abettor",
      "punishment": "Same as for offence abetted.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "max_years: punishment fixed by reference or fraction; not stated.; bailable null: depends on offence; cognizable null: depends on offence; compoundable null: depends on underlying offence (BNSS 359(3)).",
      "variants": {
        "50": {
          "offence": "Abetment of any offence, if the person abetted does act with different intention from that of abettor.",
          "punishment": "Same as for offence abetted.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "51": {
      "title": "Liability of abettor when one act abetted and different act done",
      "punishment": "Same as for offence intended to be abetted.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "max_years: punishment fixed by reference or fraction; not stated.; bailable null: depends on offence; cognizable null: depends on offence; compoundable null: depends on underlying offence (BNSS 359(3)).",
      "variants": {
        "51": {
          "offence": "Abetment of any offence, when one act is abetted and a different act is done; subject to the proviso.",
          "punishment": "Same as for offence intended to be abetted.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "52": {
      "title": "Abettor when liable to cumulative punishment for act abetted and for act done",
      "punishment": "Same as for offence abetted.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "max_years: punishment fixed by reference or fraction; not stated.; bailable null: depends on offence; cognizable null: depends on offence; compoundable null: depends on underlying offence (BNSS 359(3)).",
      "variants": {
        "52": {
          "offence": "Abettor when liable to cumulative punishment for act abetted and for act done.",
          "punishment": "Same as for offence abetted.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "53": {
      "title": "Liability of abettor for an effect caused by act abetted different from that intended by abettor",
      "punishment": "Same as for offence committed.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "max_years: punishment fixed by reference or fraction; not stated.; bailable null: depends on offence; cognizable null: depends on offence; compoundable null: depends on underlying offence (BNSS 359(3)).",
      "variants": {
        "53": {
          "offence": "Abetment of any offence, when an effect is caused by the act abetted different from that intended by the abettor.",
          "punishment": "Same as for offence committed.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "54": {
      "title": "Abettor present when offence is committed",
      "punishment": "Same as for offence committed.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. bailable: depends on the offence in question (Schedule: \"according as\"); cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "54": {
          "offence": "Abetment of any offence, if abettor present when offence is committed.",
          "punishment": "Same as for offence committed.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "55": {
      "title": "Abetment of offence punishable with death or imprisonment for life",
      "punishment": "Up to 7 years, and fine; if hurt caused: up to 14 years and fine",
      "max_years": 14,
      "bailable": false,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "55": {
          "offence": "Abetment of an offence, punishable with death or imprisonment for life, if the offence be not committed in consequence of the abetment. If an act which causes harm to be done in consequence of the abetment.",
          "punishment": "Imprisonment for 7 years and fine. Imprisonment for 14 years and fine.",
          "cognizable": "depends on the offence abetted/attempted/in question; depends on the offence abetted/attempted/in question",
          "bailable": "no; no",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "56": {
      "title": "Abetment of offence punishable with imprisonment",
      "punishment": "Imprisonment extending to one-fourth of the longest term provided for the offence, or fine, or both. Imprisonment extending to one-half of the longest term provided for the offence, or fine, or both.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. bailable: depends on the offence in question (Schedule: \"according as\"); cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "56": {
          "offence": "Abetment of an offence, punishable with imprisonment, if the offence be not committed in consequence of the abetment. If the abettor or the person abetted be a public servant whose duty it is to prevent the offence.",
          "punishment": "Imprisonment extending to one-fourth of the longest term provided for the offence, or fine, or both. Imprisonment extending to one-half of the longest term provided for the offence, or fine, or both.",
          "cognizable": "depends on the offence abetted/attempted/in question; depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question; depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "57": {
      "title": "Abetting commission of offence by public or by more than ten persons",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "bailable: depends on the offence in question (Schedule: \"according as\"); cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "57": {
          "offence": "Abetting commission of an offence by the public or by more than ten persons.",
          "punishment": "Imprisonment which may extend to 7 years and fine.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "58": {
      "title": "Concealing design to commit offence punishable with death or imprisonment for life",
      "punishment": "Up to 7 years and fine (if offence committed); up to 3 years and fine (if not)",
      "max_years": 7,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "bailable: differs by sub-section, see variants; cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "58(a)": {
          "offence": "Concealing design to commit offence punishable with death or imprisonment for life, if the offence be committed.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "no",
          "compoundable": "depends on the offence abetted/attempted/in question"
        },
        "58(b)": {
          "offence": "If offence be not committed.",
          "punishment": "Imprisonment for 3 years and fine.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "yes",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "59": {
      "title": "Public servant concealing design to commit offence which it is his duty to prevent",
      "punishment": "59(a): Imprisonment extending to one-half of the longest term provided for the offence, or fine, or both.; 59(b): Imprisonment for 10 years.; 59(c): Imprisonment extending to one-fourth of the longest term provided for the offence, or fine, or both.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. bailable: depends on the offence in question (Schedule: \"according as\"); cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "59(a)": {
          "offence": "A public servant concealing a design to commit an offence which it is his duty to prevent, if the offence be committed.",
          "punishment": "Imprisonment extending to one-half of the longest term provided for the offence, or fine, or both.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        },
        "59(b)": {
          "offence": "If the offence be punishable with death or imprisonment for life.",
          "punishment": "Imprisonment for 10 years.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "no",
          "compoundable": "depends on the offence abetted/attempted/in question"
        },
        "59(c)": {
          "offence": "If the offence be not committed.",
          "punishment": "Imprisonment extending to one-fourth of the longest term provided for the offence, or fine, or both.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "yes",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "60": {
      "title": "Concealing design to commit offence punishable with imprisonment",
      "punishment": "60(a): Imprisonment extending to one-fourth of the longest term provided for the offence, or fine, or both.; 60(b): Imprisonment extending to one-eighth part of the longest term provided for the offence, or fine, or both.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. bailable: depends on the offence in question (Schedule: \"according as\"); cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "60(a)": {
          "offence": "Concealing a design to commit an offence punishable with imprisonment, if offence be committed.",
          "punishment": "Imprisonment extending to one-fourth of the longest term provided for the offence, or fine, or both.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        },
        "60(b)": {
          "offence": "If the offence be not committed.",
          "punishment": "Imprisonment extending to one-eighth part of the longest term provided for the offence, or fine, or both.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "yes",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "61": {
      "title": "Criminal conspiracy",
      "punishment": "61(2)(a): Same as for abetment of the offence which is the object of the conspiracy.; 61(2)(b): Imprisonment for 6 months, or fine, or both.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. bailable: depends on the offence in question (Schedule: \"according as\"); cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "61(2)(a)": {
          "offence": "Criminal conspiracy to commit an offence punishable with death, imprisonment for life or rigorous imprisonment for a term of 2 years or upwards.",
          "punishment": "Same as for abetment of the offence which is the object of the conspiracy.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        },
        "61(2)(b)": {
          "offence": "Any other criminal conspiracy.",
          "punishment": "Imprisonment for 6 months, or fine, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "62": {
      "title": "Punishment for attempting to commit offences punishable with imprisonment for life or other imprisonment",
      "punishment": "One half of the imprisonment for life, or imprisonment not exceeding onehalf of the longest term, provided for the offence, or fine, or both.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IV — Of Abetment, Criminal Conspiracy and Attempt",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. bailable: depends on the offence in question (Schedule: \"according as\"); cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "62": {
          "offence": "Attempting to commit offence punishable with imprisonment for life, or imprisonment, and in such attempt doing any act towards the commission of the offence.",
          "punishment": "One half of the imprisonment for life, or imprisonment not exceeding onehalf of the longest term, provided for the offence, or fine, or both.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "63": {
      "title": "Rape",
      "punishment": "See section 64 for punishment",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "V — Of Offences Against Woman and Child",
      "verify": "Definition section; the punishment is in 64 onward. Classification attributes not available: set to null."
    },
    "64": {
      "title": "Punishment for rape",
      "punishment": "Rigorous imprisonment minimum 10 years, extendable to life, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "65": {
      "title": "Punishment for rape in certain cases",
      "punishment": "Rigorous minimum 20 years extendable to life (under 16); minimum 20 years to life or death (under 12), and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "66": {
      "title": "Punishment for causing death or resulting in persistent vegetative state of victim",
      "punishment": "Rigorous imprisonment minimum 20 years extendable to life, or death",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "67": {
      "title": "Sexual intercourse by husband upon his wife during separation",
      "punishment": "Imprisonment 2 to 7 years, and fine",
      "max_years": 7,
      "bailable": true,
      "cognizable": null,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child",
      "verify": "cognizable: conditional on who gives the information (Schedule text). Set to null.",
      "variants": {
        "67": {
          "offence": "Sexual intercourse by husband upon his wife during separation.",
          "punishment": "Imprisonment for not less than 2 years but which may extend to 7 years and fine.",
          "cognizable": "conditional (see Schedule text)",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "68": {
      "title": "Sexual intercourse by a person in authority",
      "punishment": "Rigorous imprisonment 5 to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "69": {
      "title": "Sexual intercourse by employing deceitful means, etc",
      "punishment": "Imprisonment up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "70": {
      "title": "Gang rape",
      "punishment": "Rigorous imprisonment minimum 20 years extendable to life, and fine; if victim under 18: life or death",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "71": {
      "title": "Punishment for repeat offenders",
      "punishment": "Imprisonment for life (remainder of natural life), or death",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "72": {
      "title": "Disclosure of identity of victim of certain offences, etc",
      "punishment": "Imprisonment up to 2 years, and fine",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "73": {
      "title": "Printing or publishing any matter relating to Court proceedings without permission",
      "punishment": "Imprisonment up to 2 years, and fine",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "74": {
      "title": "Assault or use of criminal force to woman with intent to outrage her modesty",
      "punishment": "Imprisonment 1 to 5 years, and fine",
      "max_years": 5,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "75": {
      "title": "Sexual harassment",
      "punishment": "Up to 3 years (physical contact/demand of sexual favours/showing pornography); up to 1 year (sexually coloured remarks)",
      "max_years": 3,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "76": {
      "title": "Assault or use of criminal force to woman with intent to disrobe",
      "punishment": "Imprisonment 3 to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "77": {
      "title": "Voyeurism",
      "punishment": "Imprisonment 1 to 3 years and fine (first); 3 to 7 years and fine (subsequent)",
      "max_years": 7,
      "bailable": null,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child",
      "verify": "bailable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "77": {
          "offence": "Voyeurism. Second or subsequent conviction.",
          "punishment": "Imprisonment for not less than 1 year but which may extend to 3 years and fine. Imprisonment for not less than 3 years but which may extend to 7 years and fine.",
          "cognizable": "yes; yes",
          "bailable": "yes; no",
          "compoundable": "no"
        }
      }
    },
    "78": {
      "title": "Stalking",
      "punishment": "Up to 3 years and fine (first); up to 5 years and fine (subsequent)",
      "max_years": 5,
      "bailable": null,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child",
      "verify": "bailable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "78(2)": {
          "offence": "Stalking. Second or subsequent conviction.",
          "punishment": "Imprisonment up to 3 years and fine. Imprisonment up to 5 years and fine.",
          "cognizable": "yes; yes",
          "bailable": "yes; no",
          "compoundable": "no"
        }
      }
    },
    "79": {
      "title": "Word, gesture or act intended to insult modesty of a woman",
      "punishment": "Simple imprisonment up to 3 years, and fine",
      "max_years": 3,
      "bailable": true,
      "cognizable": true,
      "compoundable": true,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "80": {
      "title": "Dowry death",
      "punishment": "Imprisonment minimum 7 years extendable to life",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "81": {
      "title": "Cohabitation caused by man deceitfully inducing belief of lawful marriage",
      "punishment": "Imprisonment up to 10 years, and fine",
      "max_years": 10,
      "bailable": null,
      "cognizable": null,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child",
      "verify": "First Schedule prints this as non-cognizable and non-bailable, an unusual combination; bailable and cognizable are left empty until checked against India Code (CLO, 12 Oct 2026)."
    },
    "82": {
      "title": "Marrying again during lifetime of husband or wife",
      "punishment": "Imprisonment up to 7 years, and fine; with concealment: up to 10 years and fine",
      "max_years": 10,
      "bailable": true,
      "cognizable": false,
      "compoundable": null,
      "chapter": "V — Of Offences Against Woman and Child",
      "verify": "compoundable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "82(1)": {
          "offence": "Marrying again during the life time of a husband or wife.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "yes (with Court permission)"
        },
        "82(2)": {
          "offence": "Same offence with concealment of the former marriage from the person with whom subsequent marriage is contracted.",
          "punishment": "Imprisonment for 10 years and fine.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "83": {
      "title": "Marriage ceremony fraudulently gone through without lawful marriage",
      "punishment": "Imprisonment up to 7 years, and fine",
      "max_years": 7,
      "bailable": null,
      "cognizable": null,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child",
      "verify": "First Schedule prints this as non-cognizable and non-bailable, an unusual combination; bailable and cognizable are left empty until checked against India Code (CLO, 12 Oct 2026)."
    },
    "84": {
      "title": "Enticing or taking away or detaining with criminal intent a married woman",
      "punishment": "Imprisonment up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "85": {
      "title": "Husband or relative of husband of a woman subjecting her to cruelty",
      "punishment": "Imprisonment up to 3 years, and fine",
      "max_years": 3,
      "bailable": false,
      "cognizable": null,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child",
      "verify": "cognizable: conditional on who gives the information (Schedule text). Set to null.",
      "variants": {
        "85": {
          "offence": "Punishment for subjecting a married woman to cruelty.",
          "punishment": "Imprisonment for 3 years and fine.",
          "cognizable": "conditional (see Schedule text)",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "87": {
      "title": "Kidnapping, abducting or inducing woman to compel her marriage, etc",
      "punishment": "Imprisonment up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "88": {
      "title": "Causing miscarriage",
      "punishment": "Imprisonment up to 3 years, or fine, or both; if woman quick with child: up to 7 years and fine",
      "max_years": 7,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "89": {
      "title": "Causing miscarriage without woman's consent",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "90": {
      "title": "Death caused by act done with intent to cause miscarriage",
      "punishment": "Imprisonment up to 10 years and fine; without consent: imprisonment for life or up to 10 years and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "91": {
      "title": "Act done with intent to prevent child being born alive or to cause to die after birth",
      "punishment": "Imprisonment up to 10 years, or fine, or both",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "92": {
      "title": "Causing death of quick unborn child by act amounting to culpable homicide",
      "punishment": "Imprisonment up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "93": {
      "title": "Exposure and abandonment of child under twelve years of age, by parent or person having care of it",
      "punishment": "Imprisonment up to 7 years, or fine, or both",
      "max_years": 7,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "94": {
      "title": "Concealment of birth by secret disposal of dead body",
      "punishment": "Imprisonment up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "95": {
      "title": "Hiring, employing or engaging a child to commit an offence",
      "punishment": "Imprisonment for not less than 3 years but which may extend to 10 years and fine. Same as for the offence committed.",
      "max_years": null,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "95": {
          "offence": "Hiring, employing or engaging a child to commit an offence. If offence be committed.",
          "punishment": "Imprisonment for not less than 3 years but which may extend to 10 years and fine. Same as for the offence committed.",
          "cognizable": "yes; yes",
          "bailable": "no; no",
          "compoundable": "no"
        }
      }
    },
    "96": {
      "title": "Procuration of child",
      "punishment": "Rigorous imprisonment up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "97": {
      "title": "Kidnapping or abducting child under ten years of age with intent to steal from its person",
      "punishment": "Imprisonment up to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "98": {
      "title": "Selling child for purposes of prostitution, etc",
      "punishment": "Imprisonment up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "99": {
      "title": "Buying child for purposes of prostitution, etc",
      "punishment": "Imprisonment for not less than 7 years but which may extend to 14 years and fine.",
      "max_years": 14,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "V — Of Offences Against Woman and Child"
    },
    "103": {
      "title": "Punishment for murder",
      "punishment": "Death or imprisonment for life, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "103(2)": {
      "title": "Punishment for murder",
      "punishment": "Death or imprisonment for life, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "104": {
      "title": "Punishment for murder by life-convict",
      "punishment": "Death or imprisonment for life, which shall mean the remainder of that person's natural life.",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "105": {
      "title": "Punishment for culpable homicide not amounting to murder",
      "punishment": "Imprisonment for life, or Imprisonment for not less than 5 years but which may extend to 10 years and fine. Imprisonment for 10 years and with fine.",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "106": {
      "title": "Causing death by negligence",
      "punishment": "Up to 5 years, and fine; if by registered medical practitioner: up to 2 years",
      "max_years": 5,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "106(2)": {
      "title": "Causing death by negligence",
      "punishment": "Up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "107": {
      "title": "Abetment of suicide of child or person of unsound mind",
      "punishment": "Death, imprisonment for life, or imprisonment up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "108": {
      "title": "Abetment of suicide",
      "punishment": "Imprisonment up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "109": {
      "title": "Attempt to murder",
      "punishment": "109(1): Imprisonment for 10 years and fine. Imprisonment for life, or as above.; 109(2): Death, or imprisonment for life which shall mean the remainder of that person's natural life.",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "110": {
      "title": "Attempt to commit culpable homicide",
      "punishment": "Up to 3 years, or fine, or both (no harm); up to 7 years and fine if hurt caused",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "111": {
      "title": "Organised crime",
      "punishment": "Death or imprisonment for life, and fine not less than 10 lakh",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "112": {
      "title": "Petty organised crime",
      "punishment": "Imprisonment 1 to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "113": {
      "title": "Terrorist act",
      "punishment": "Death or imprisonment for life, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "115": {
      "title": "Voluntarily causing hurt",
      "punishment": "Up to 1 year, or fine up to 10,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "115(1)": {
      "title": "Voluntarily causing hurt",
      "punishment": "Definition section: no punishment in this section.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "VI — Of Offences Affecting the Human Body",
      "verify": "Definition limb; the Schedule classifies the offence at 115(2). Classification attributes not available: set to null."
    },
    "115(2)": {
      "title": "Voluntarily causing hurt",
      "punishment": "Up to 1 year, or fine up to 10,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "117": {
      "title": "Voluntarily causing grievous hurt",
      "punishment": "117(2): Imprisonment for 7 years and fine.; 117(3): Rigorous imprisonment for not less than 10 years but which may extend to imprisonment for life which shall mean the remainder of that person's natural life.; 117(4): Imprisonment for 7 years and fine.",
      "max_years": 99,
      "bailable": null,
      "cognizable": true,
      "compoundable": null,
      "chapter": "VI — Of Offences Affecting the Human Body",
      "verify": "bailable: differs by sub-section, see variants; compoundable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "117(2)": {
          "offence": "Voluntarily causing grievous hurt.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "yes (with Court permission)"
        },
        "117(3)": {
          "offence": "If hurt to results in permanent disability or persistent vegetative state.",
          "punishment": "Rigorous imprisonment for not less than 10 years but which may extend to imprisonment for life which shall mean the remainder of that person's natural life.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "117(4)": {
          "offence": "Grievous hurt caused by a group of 5 or more persons.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "118": {
      "title": "Voluntarily causing hurt or grievous hurt by dangerous weapons or means",
      "punishment": "118(1): Imprisonment for 3 years, or fine of 20,000 rupees, or both.; 118(2): Imprisonment for life or imprisonment of not less than 1 year but which may extend to 10 years and fine.",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "119": {
      "title": "Voluntarily causing hurt or grievous hurt to extort property, or to constrain to an illegal act",
      "punishment": "119(1): Imprisonment for 10 years and fine.; 119(2): Imprisonment for life, or imprisonment for 10 years and fine.",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "120": {
      "title": "Voluntarily causing hurt or grievous hurt to extort confession, or to compel restoration of property",
      "punishment": "Up to 7 years and fine (hurt); up to 10 years and fine (grievous)",
      "max_years": 10,
      "bailable": null,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body",
      "verify": "bailable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "120(1)": {
          "offence": "Voluntarily causing hurt to extort confession or information, or to compel restoration of property, etc.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "120(2)": {
          "offence": "Voluntarily causing grievous hurt to extort confession or information, or to compel restoration of property, etc.",
          "punishment": "Imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "121": {
      "title": "Voluntarily causing hurt or grievous hurt to deter public servant from his duty",
      "punishment": "Up to 3 years and fine (hurt); up to 10 years and fine (grievous)",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "122": {
      "title": "Voluntarily causing hurt or grievous hurt on provocation",
      "punishment": "Up to 1 month, or fine up to 5,000, or both (hurt); up to 5 years, or fine up to 10,000, or both (grievous)",
      "max_years": 5,
      "bailable": true,
      "cognizable": null,
      "compoundable": true,
      "chapter": "VI — Of Offences Affecting the Human Body",
      "verify": "cognizable: differs by sub-section or is conditional, see variants. Set to null.",
      "variants": {
        "122(1)": {
          "offence": "Voluntarily causing hurt on grave and sudden provocation, not intending to hurt any other than the person who gave the provocation.",
          "punishment": "Imprisonment for 1 month, or fine of 5,000 rupees, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "yes"
        },
        "122(2)": {
          "offence": "Causing grievous hurt on grave and sudden provocation, not intending to hurt any other than the person who gave the provocation.",
          "punishment": "Imprisonment for 5 years, or fine of 10,000 rupees, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "yes"
        }
      }
    },
    "123": {
      "title": "Causing hurt by means of poison, etc., with intent to commit an offence",
      "punishment": "Up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "124": {
      "title": "Voluntarily causing grievous hurt by use of acid, etc",
      "punishment": "Imprisonment 10 years to life, and fine (124(1)); attempt: 5 to 7 years and fine (124(2))",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "125": {
      "title": "Act endangering life or personal safety of others",
      "punishment": "125: Imprisonment for 3 months, or fine of 2,500 rupees, or both.; 125(a): Imprisonment for 6 months, or fine of 5,000 rupees, or both.; 125(b): Imprisonment for 3 years, or fine of 10,000 rupees, or both.",
      "max_years": 3,
      "bailable": true,
      "cognizable": true,
      "compoundable": null,
      "chapter": "VI — Of Offences Affecting the Human Body",
      "verify": "compoundable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "125": {
          "offence": "Doing any act endangering human life or personal safety of others.",
          "punishment": "Imprisonment for 3 months, or fine of 2,500 rupees, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "125(a)": {
          "offence": "Where hurt is caused.",
          "punishment": "Imprisonment for 6 months, or fine of 5,000 rupees, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "yes (with Court permission)"
        },
        "125(b)": {
          "offence": "Where grievous hurt is caused.",
          "punishment": "Imprisonment for 3 years, or fine of 10,000 rupees, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "yes (with Court permission)"
        }
      }
    },
    "126": {
      "title": "Wrongful restraint",
      "punishment": "Simple imprisonment up to 1 month, or fine up to 5,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": true,
      "compoundable": true,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "127": {
      "title": "Wrongful confinement",
      "punishment": "127(2): Imprisonment for 1 year, or fine of 5,000 rupees, or both.; 127(5): Imprisonment for 2 years in addition to any term of imprisonment to under any other section and fine.; 127(6): Imprisonment for 3 years in addition to other punishment which he is liable to and fine.; 127(8): Imprisonment for 3 years and fine.",
      "max_years": 3,
      "bailable": true,
      "cognizable": true,
      "compoundable": null,
      "chapter": "VI — Of Offences Affecting the Human Body",
      "verify": "compoundable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "127(2)": {
          "offence": "Wrongfully confining any person.",
          "punishment": "Imprisonment for 1 year, or fine of 5,000 rupees, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "yes"
        },
        "127(5)": {
          "offence": "Keeping any person in wrongful confinement, knowing that a writ has been issued for his liberation.",
          "punishment": "Imprisonment for 2 years in addition to any term of imprisonment to under any other section and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "127(6)": {
          "offence": "Wrongful confinement in secret.",
          "punishment": "Imprisonment for 3 years in addition to other punishment which he is liable to and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "yes"
        },
        "127(8)": {
          "offence": "Wrongful confinement for the purpose of extorting confession or information, or for compelling restoration of property, etc.",
          "punishment": "Imprisonment for 3 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "127(3)": {
      "title": "Wrongful confinement",
      "punishment": "Imprisonment for 3 years, or fine of 10,000 rupees, or both.",
      "max_years": 3,
      "bailable": true,
      "cognizable": true,
      "compoundable": true,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "127(4)": {
      "title": "Wrongful confinement",
      "punishment": "Imprisonment for 5 years and fine of 10,000 rupees.",
      "max_years": 5,
      "bailable": false,
      "cognizable": true,
      "compoundable": true,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "127(7)": {
      "title": "Wrongful confinement",
      "punishment": "Up to 3 years, and fine",
      "max_years": 3,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "131": {
      "title": "Punishment for assault or criminal force otherwise than on grave provocation",
      "punishment": "Up to 3 months, or fine up to 1,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "132": {
      "title": "Assault or criminal force to deter public servant from discharge of his duty",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "133": {
      "title": "Assault or criminal force with intent to dishonour person, otherwise than on grave provocation",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "134": {
      "title": "Assault or criminal force in attempt to commit theft of property carried by a person",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "135": {
      "title": "Assault or criminal force in attempt to wrongfully confine a person",
      "punishment": "Up to 1 year, or fine up to 3,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": true,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "136": {
      "title": "Assault or criminal force on grave provocation",
      "punishment": "Simple imprisonment up to 1 month, or fine up to 1,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "137": {
      "title": "Kidnapping",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "139": {
      "title": "Kidnapping or maiming a child for purposes of begging",
      "punishment": "Imprisonment minimum 10 years extendable to life, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "140": {
      "title": "Kidnapping or abducting in order to murder or for ransom, etc",
      "punishment": "Imprisonment for life or rigorous up to 10 years, and fine; for ransom: death or life and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "140(2)": {
      "title": "Kidnapping or abducting in order to murder or for ransom, etc",
      "punishment": "Death, imprisonment for life, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "141": {
      "title": "Importation of girl or boy from foreign country",
      "punishment": "Imprisonment up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "142": {
      "title": "Wrongfully concealing or keeping in confinement, kidnapped or abducted person",
      "punishment": "Punishment for kidnapping or abduction.",
      "max_years": null,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "142": {
          "offence": "Wrongfully concealing or keeping in confinement, kidnapped or abducted person.",
          "punishment": "Punishment for kidnapping or abduction.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "143": {
      "title": "Trafficking of person",
      "punishment": "Rigorous 7 to 10 years and fine; aggravated forms: 10 years to life",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "144": {
      "title": "Exploitation of a trafficked person",
      "punishment": "Rigorous imprisonment 3 to 7 years and fine; if trafficked person is a child: rigorous 5 to 10 years and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "145": {
      "title": "Habitual dealing in slaves",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "146": {
      "title": "Unlawful compulsory labour",
      "punishment": "Imprisonment up to 1 year, or fine, or both, or community service",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VI — Of Offences Affecting the Human Body"
    },
    "147": {
      "title": "Waging, or attempting to wage war, or abetting waging of war, against Government of India",
      "punishment": "Death or imprisonment for life, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "148": {
      "title": "Conspiracy to commit offences punishable by section 147",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "149": {
      "title": "Collecting arms, etc., with intention of waging war against Government of India",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "150": {
      "title": "Concealing with intent to facilitate design to wage war",
      "punishment": "Imprisonment up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "151": {
      "title": "Assaulting President, Governor, etc., with intent to compel or restrain exercise of any lawful power",
      "punishment": "Imprisonment up to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "152": {
      "title": "Act endangering sovereignty, unity and integrity of India",
      "punishment": "Imprisonment for life or up to 7 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "153": {
      "title": "Waging war against Government of any foreign State at peace with Government of India",
      "punishment": "Imprisonment for life, or up to 7 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "154": {
      "title": "Committing depredation on territories of foreign State at peace with Government of India",
      "punishment": "Imprisonment up to 7 years, and fine, and forfeiture of property",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "155": {
      "title": "Receiving property taken by war or depredation mentioned in sections 153 and 154",
      "punishment": "Imprisonment up to 7 years, and fine, and forfeiture of property",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "156": {
      "title": "Public servant voluntarily allowing prisoner of State or war to escape",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "157": {
      "title": "Public servant negligently suffering such prisoner to escape",
      "punishment": "Simple imprisonment up to 3 years, and fine",
      "max_years": 3,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "158": {
      "title": "Aiding escape of, rescuing or harbouring such prisoner",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VII — Of Offences Against the State"
    },
    "159": {
      "title": "Abetting mutiny, or attempting to seduce a soldier, sailor or airman from his duty",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VIII — Of Offences Relating to the Army, Navy and Air Force"
    },
    "160": {
      "title": "Abetment of mutiny, if mutiny is committed in consequence thereof",
      "punishment": "Death, or imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VIII — Of Offences Relating to the Army, Navy and Air Force"
    },
    "161": {
      "title": "Abetment of assault by soldier, sailor or airman on his superior officer, when in execution of his office",
      "punishment": "Imprisonment up to 3 years, and fine",
      "max_years": 3,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VIII — Of Offences Relating to the Army, Navy and Air Force"
    },
    "162": {
      "title": "Abetment of such assault, if assault committed",
      "punishment": "Imprisonment up to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VIII — Of Offences Relating to the Army, Navy and Air Force"
    },
    "163": {
      "title": "Abetment of desertion of soldier, sailor or airman",
      "punishment": "Imprisonment up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VIII — Of Offences Relating to the Army, Navy and Air Force"
    },
    "164": {
      "title": "Harbouring deserter",
      "punishment": "Imprisonment up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VIII — Of Offences Relating to the Army, Navy and Air Force"
    },
    "165": {
      "title": "Deserter concealed on board merchant vessel through negligence of master",
      "punishment": "Fine up to 3,000",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "VIII — Of Offences Relating to the Army, Navy and Air Force"
    },
    "166": {
      "title": "Abetment of act of insubordination by soldier, sailor or airman",
      "punishment": "Imprisonment for 2 years, or fine, or both.",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VIII — Of Offences Relating to the Army, Navy and Air Force"
    },
    "168": {
      "title": "Wearing garb or carrying token used by soldier, sailor or airman",
      "punishment": "Imprisonment up to 3 months, or fine up to 2,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "VIII — Of Offences Relating to the Army, Navy and Air Force"
    },
    "170": {
      "title": "Bribery",
      "punishment": "See section 173 for punishment",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IX — Of Offences Relating to Elections",
      "verify": "Definition; punishment is in 173. Classification attributes not available: set to null."
    },
    "171": {
      "title": "Undue influence at elections",
      "punishment": "See section 174 for punishment",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IX — Of Offences Relating to Elections",
      "verify": "Definition; punishment is in 174. Classification attributes not available: set to null."
    },
    "172": {
      "title": "Personation at elections",
      "punishment": "See section 174 for punishment",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "IX — Of Offences Relating to Elections",
      "verify": "Definition; punishment is in 174. Classification attributes not available: set to null."
    },
    "173": {
      "title": "Punishment for bribery",
      "punishment": "Imprisonment up to 1 year, or fine, or both; treating: fine only",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "IX — Of Offences Relating to Elections"
    },
    "174": {
      "title": "Punishment for undue influence or personation at an election",
      "punishment": "Imprisonment up to 1 year, or fine, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "IX — Of Offences Relating to Elections"
    },
    "175": {
      "title": "False statement in connection with an election",
      "punishment": "Fine",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "IX — Of Offences Relating to Elections"
    },
    "176": {
      "title": "Illegal payments in connection with an election",
      "punishment": "Fine up to 10,000",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "IX — Of Offences Relating to Elections"
    },
    "177": {
      "title": "Failure to keep election accounts",
      "punishment": "Fine up to 5,000",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "IX — Of Offences Relating to Elections"
    },
    "178": {
      "title": "Counterfeiting coin, Government stamps, currency-notes or bank-notes",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "179": {
      "title": "Using as genuine, forged or counterfeit coin, Government stamp, currency-notes or bank-notes",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "180": {
      "title": "Possession of forged or counterfeit coin, Government stamp, currency-notes or bank-notes",
      "punishment": "Up to 7 years, or fine, or both",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "181": {
      "title": "Making or possessing instruments or materials for forging or counterfeiting coin, Government stamp, currency-notes or bank-notes",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "182": {
      "title": "Making or using documents resembling currency-notes or bank-notes",
      "punishment": "Fine up to 300",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "183": {
      "title": "Effacing writing from substance bearing Government stamp, or removing from document a stamp used for it, with intent to cause loss to Government",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "184": {
      "title": "Using Government stamp known to have been before used",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "185": {
      "title": "Erasure of mark denoting that stamp has been used",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "186": {
      "title": "Prohibition of fictitious stamps",
      "punishment": "Fine up to 200",
      "max_years": 0,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "187": {
      "title": "Person employed in mint causing coin to be of different weight or composition from that fixed by law",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "188": {
      "title": "Unlawfully taking coining instrument from mint",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "X — Of Offences Relating to Coin, Currency-Notes, Bank-Notes and Government Stamps"
    },
    "189": {
      "title": "Unlawful assembly",
      "punishment": "189(2): Imprisonment for 6 months, or fine, or both.; 189(3): Imprisonment for 2 years, or fine, or both.; 189(4): Imprisonment for 2 years, or fine, or both.; 189(5): Imprisonment for 6 months, or fine, or both.; 189(6): The same as for a member of such assembly, and for any offence committed by any member of such assembly.; 189(7): Imprisonment for 6 months, or fine, or both.; 189(8): Imprisonment for 6 months, or fine, or both.; 189(9): Imprisonment for 2 years, or fine, or both.",
      "max_years": null,
      "bailable": null,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XI — Of Offences Against Public Tranquillity",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. bailable: depends on the offence in question (Schedule: \"according as\"). Set to null.",
      "variants": {
        "189(2)": {
          "offence": "Being member of an unlawful assembly.",
          "punishment": "Imprisonment for 6 months, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "189(3)": {
          "offence": "Joining or continuing in an unlawful assembly, knowing that it has been commanded to disperse.",
          "punishment": "Imprisonment for 2 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "189(4)": {
          "offence": "Joining an unlawful assembly armed with any deadly weapon.",
          "punishment": "Imprisonment for 2 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "189(5)": {
          "offence": "Knowingly joining or continuing in any assembly of five or more persons after it has been commanded to disperse.",
          "punishment": "Imprisonment for 6 months, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "189(6)": {
          "offence": "Hiring, engaging or employing persons to take part in an unlawful assembly.",
          "punishment": "The same as for a member of such assembly, and for any offence committed by any member of such assembly.",
          "cognizable": "yes",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "no"
        },
        "189(7)": {
          "offence": "Harbouring persons hired for an unlawful assembly.",
          "punishment": "Imprisonment for 6 months, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "189(8)": {
          "offence": "Being hired to take part in an unlawful assembly or riot.",
          "punishment": "Imprisonment for 6 months, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "189(9)": {
          "offence": "Or to go armed.",
          "punishment": "Imprisonment for 2 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "190": {
      "title": "Every member of unlawful assembly guilty of offence committed in prosecution of common object",
      "punishment": "The same as for the offence.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "XI — Of Offences Against Public Tranquillity",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. bailable: depends on the offence in question (Schedule: \"according as\"); cognizable: depends on the offence in question (Schedule: \"according as\"); compoundable: depends on the underlying offence (BNSS s.359(3)). Set to null.",
      "variants": {
        "190": {
          "offence": "Every member of unlawful assembly guilty of offence committed in prosecution of common object.",
          "punishment": "The same as for the offence.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "depends on the offence abetted/attempted/in question"
        }
      }
    },
    "191": {
      "title": "Rioting",
      "punishment": "191(2): Imprisonment for 2 years, or fine, or both.; 191(3): Imprisonment for 5 years, or fine, or both.",
      "max_years": 5,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XI — Of Offences Against Public Tranquillity"
    },
    "192": {
      "title": "Wantonly giving provocation with intent to cause riot-if rioting be committed; if not committed",
      "punishment": "Up to 1 year, or fine, or both; if rioting committed: up to 1 year and fine",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XI — Of Offences Against Public Tranquillity"
    },
    "193": {
      "title": "Liability of owner, occupier, etc., of land on which an unlawful assembly or riot takes place",
      "punishment": "Fine up to 1,000",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XI — Of Offences Against Public Tranquillity"
    },
    "194": {
      "title": "Affray",
      "punishment": "Up to 1 month, or fine up to 1,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XI — Of Offences Against Public Tranquillity"
    },
    "195": {
      "title": "Assaulting or obstructing public servant when suppressing riot, etc",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": true,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XI — Of Offences Against Public Tranquillity",
      "verify": "cognizable: differs by sub-section or is conditional, see variants. Set to null.",
      "variants": {
        "195(1)": {
          "offence": "Assaulting or obstructing public servant when suppressing riot, etc.",
          "punishment": "Imprisonment for 3 years, or fine not less than 25,000 rupees, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "195(2)": {
          "offence": "Threatening to assault or attempting to obstruct public servant when suppressing riot, etc.",
          "punishment": "Imprisonment for 1 year, or fine, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "196": {
      "title": "Promoting enmity between different groups on grounds of religion, race, place of birth, residence, language, etc., and doing acts prejudicial to maintenance of harmony",
      "punishment": "Up to 3 years, or fine, or both; in place of worship: up to 5 years and fine",
      "max_years": 5,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XI — Of Offences Against Public Tranquillity"
    },
    "197": {
      "title": "Imputations, assertions prejudicial to national integration",
      "punishment": "197(1): Imprisonment for 3 years, or fine, or both.; 197(2): Imprisonment for 5 years and fine.",
      "max_years": 5,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XI — Of Offences Against Public Tranquillity"
    },
    "198": {
      "title": "Public servant disobeying law, with intent to cause injury to any person",
      "punishment": "Up to 1 year, or fine, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XII — Of Offences By or Relating to Public Servants"
    },
    "199": {
      "title": "Public servant disobeying direction under law",
      "punishment": "Rigorous imprisonment for not less than 6 months which may extend to 2 years and fine.",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XII — Of Offences By or Relating to Public Servants"
    },
    "200": {
      "title": "Punishment for non-treatment of victim",
      "punishment": "Imprisonment for 1 year, or fine, or both.",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XII — Of Offences By or Relating to Public Servants"
    },
    "201": {
      "title": "Public servant framing an incorrect document with intent to cause injury",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XII — Of Offences By or Relating to Public Servants"
    },
    "202": {
      "title": "Public servant unlawfully engaging in trade",
      "punishment": "Simple imprisonment up to 1 year, or fine, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XII — Of Offences By or Relating to Public Servants"
    },
    "203": {
      "title": "Public servant unlawfully buying or bidding for property",
      "punishment": "Simple imprisonment up to 2 years, or fine, or both; property forfeited",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XII — Of Offences By or Relating to Public Servants"
    },
    "204": {
      "title": "Personating a public servant",
      "punishment": "Up to 3 years, and fine",
      "max_years": 3,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XII — Of Offences By or Relating to Public Servants"
    },
    "205": {
      "title": "Wearing garb or carrying token used by public servant with fraudulent intent",
      "punishment": "Up to 3 months, or fine up to 5,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XII — Of Offences By or Relating to Public Servants"
    },
    "206": {
      "title": "Absconding to avoid service of summons or other proceeding",
      "punishment": "Simple imprisonment up to 1 month, or fine up to 5,000, or both; if proclamation: up to 6 months, or fine up to 10,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "207": {
      "title": "Preventing service of summons or other proceeding, or preventing publication thereof",
      "punishment": "Simple imprisonment up to 1 month, or fine up to 5,000, or both; if proclamation: up to 6 months, or fine up to 10,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "208": {
      "title": "Non-attendance in obedience to an order from public servant",
      "punishment": "Simple imprisonment up to 1 month, or fine up to 5,000, or both; if attendance required in person before court: up to 6 months, or fine up to 10,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "209": {
      "title": "Non-appearance in response to a proclamation under section 84 of Bharatiya Nagarik Suraksha Sanhita, 2023",
      "punishment": "Up to 3 years, or fine, or both; if declared proclaimed offender: up to 7 years and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "210": {
      "title": "Omission to produce document or electronic record to public servant by person legally bound to produce it",
      "punishment": "Simple imprisonment up to 1 month, or fine up to 5,000, or both; if to court: up to 6 months, or fine up to 10,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "211": {
      "title": "Omission to give notice or information to public servant by person legally bound to give it",
      "punishment": "Simple imprisonment up to 1 month, or fine up to 5,000, or both; in specified cases: up to 6 months, or fine up to 10,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "212": {
      "title": "Furnishing false information",
      "punishment": "Simple imprisonment up to 6 months, or fine up to 5,000, or both; in specified cases: up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "213": {
      "title": "Refusing oath or affirmation when duly required by public servant to make it",
      "punishment": "Simple imprisonment up to 6 months, or fine up to 5,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "214": {
      "title": "Refusing to answer public servant authorised to question",
      "punishment": "Simple imprisonment up to 6 months, or fine up to 5,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "215": {
      "title": "Refusing to sign statement",
      "punishment": "Simple imprisonment up to 3 months, or fine up to 3,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "216": {
      "title": "False statement on oath or affirmation to public servant or person authorised to administer an oath or affirmation",
      "punishment": "Up to 3 years, and fine",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "217": {
      "title": "False information, with intent to cause public servant to use his lawful power to injury of another person",
      "punishment": "Up to 1 year, or fine up to 10,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "218": {
      "title": "Resistance to taking of property by lawful authority of a public servant",
      "punishment": "Up to 6 months, or fine up to 3,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "219": {
      "title": "Obstructing sale of property offered for sale by authority of public servant",
      "punishment": "Up to 1 month, or fine up to 1,500, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "220": {
      "title": "Illegal purchase or bid for property offered for sale by authority of public servant",
      "punishment": "Imprisonment for 1 month, or fine of 200 rupees, or both.",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "221": {
      "title": "Obstructing public servant in discharge of public functions",
      "punishment": "Up to 3 months, or fine up to 2,500, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "222": {
      "title": "Omission to assist public servant when bound by law to give assistance",
      "punishment": "Simple imprisonment up to 1 month, or fine up to 2,500, or both; in specified cases: up to 6 months, or fine up to 5,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "223": {
      "title": "Disobedience to order duly promulgated by public servant",
      "punishment": "223(a): Simple imprisonment for 6 months, or fine of 2,500 rupees, or both.; 223(b): Imprisonment for 1 year, or fine of 5,000 rupees, or both.",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "224": {
      "title": "Threat of injury to public servant",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "225": {
      "title": "Threat of injury to induce person to refrain from applying for protection to public servant",
      "punishment": "Up to 1 year, or fine, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "226": {
      "title": "Attempt to commit suicide to compel or restrain exercise of lawful power",
      "punishment": "Simple imprisonment up to 1 year, or fine, or both, or community service",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIII — Of Contempts of the Lawful Authority of Public Servants"
    },
    "227": {
      "title": "Giving false evidence",
      "punishment": "Definition section: punishment is in section 229.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Definition; punishment is in 229. Classification attributes not available: set to null."
    },
    "228": {
      "title": "Fabricating false evidence",
      "punishment": "Definition section: punishment is in section 229.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Definition; punishment is in 229. Classification attributes not available: set to null."
    },
    "229": {
      "title": "Punishment for false evidence",
      "punishment": "Up to 7 years, and fine; in judicial proceeding: up to 7 years",
      "max_years": 7,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "230": {
      "title": "Giving or fabricating false evidence with intent to procure conviction of capital offence",
      "punishment": "Imprisonment for life, or rigorous imprisonment up to 10 years, and fine; if innocent person convicted and executed: death or life imprisonment",
      "max_years": 99,
      "bailable": null,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "First Schedule prints this as non-cognizable and non-bailable, an unusual combination; bailable and cognizable are left empty until checked against India Code (CLO, 12 Oct 2026)."
    },
    "231": {
      "title": "Giving or fabricating false evidence with intent to procure conviction of offence punishable with imprisonment for life or imprisonment",
      "punishment": "The same as for the offence.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. First Schedule prints this as non-cognizable and non-bailable, an unusual combination; bailable and cognizable are left empty until checked against India Code (CLO, 12 Oct 2026).",
      "variants": {
        "231": {
          "offence": "Giving or fabricating false evidence with intent to procure conviction of an offence punishable with imprisonment for life or with imprisonment for 7 years, or upwards.",
          "punishment": "The same as for the offence.",
          "cognizable": "no",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "232": {
      "title": "Threatening any person to give false evidence",
      "punishment": "232(1): Imprisonment for 7 years, or fine, or both.; 232(2): The same as for the offence.",
      "max_years": null,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "232(1)": {
          "offence": "Threatening any person to give false evidence.",
          "punishment": "Imprisonment for 7 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "232(2)": {
          "offence": "If innocent person is convicted and sentenced in consequence of false evidence with death, or imprisonment for more than 7 years.",
          "punishment": "The same as for the offence.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "233": {
      "title": "Using evidence known to be false",
      "punishment": "The same as for giving or fabricating false evidence.",
      "max_years": null,
      "bailable": null,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence. bailable: depends on the offence in question (Schedule: \"according as\"). Set to null.",
      "variants": {
        "233": {
          "offence": "Using in a judicial proceeding evidence known to be false or fabricated.",
          "punishment": "The same as for giving or fabricating false evidence.",
          "cognizable": "no",
          "bailable": "depends on the offence abetted/attempted/in question",
          "compoundable": "no"
        }
      }
    },
    "234": {
      "title": "Issuing or signing false certificate",
      "punishment": "The same as for giving false evidence.",
      "max_years": null,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "234": {
          "offence": "Knowingly issuing or signing a false certificate relating to any fact of which such certificate is by law admissible in evidence.",
          "punishment": "The same as for giving false evidence.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "235": {
      "title": "Using as true a certificate known to be false",
      "punishment": "The same as for giving false evidence.",
      "max_years": null,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "235": {
          "offence": "Using as a true certificate one known to be false in a material point.",
          "punishment": "The same as for giving false evidence.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "236": {
      "title": "False statement made in declaration which is by law receivable as evidence",
      "punishment": "The same as for giving false evidence.",
      "max_years": null,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "236": {
          "offence": "False statement made in any declaration which is by law receivable as evidence.",
          "punishment": "The same as for giving false evidence.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "237": {
      "title": "Using as true such declaration knowing it to be false",
      "punishment": "The same as for giving false evidence.",
      "max_years": null,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "237": {
          "offence": "Using as true any such declaration known to be false.",
          "punishment": "The same as for giving false evidence.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "238": {
      "title": "Causing disappearance of evidence of offence, or giving false information to screen offender",
      "punishment": "Imprisonment for onefourth of the longest term provided for the offence, or fine, or both.",
      "max_years": null,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "238(c)": {
          "offence": "If punishable with less than 10 years' imprisonment.",
          "punishment": "Imprisonment for onefourth of the longest term provided for the offence, or fine, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "238(a)": {
      "title": "Causing disappearance of evidence of offence, or giving false information to screen offender",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": true,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "cognizable: depends on the offence in question (Schedule: \"according as\"). Set to null.",
      "variants": {
        "238(a)": {
          "offence": "Causing disappearance of evidence of an offence committed, or giving false information touching it to screen the offender, if a capital offence.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "238(b)": {
      "title": "Causing disappearance of evidence of offence, or giving false information to screen offender",
      "punishment": "Up to 3 years, and fine",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "239": {
      "title": "Intentional omission to give information of offence by person bound to inform",
      "punishment": "Imprisonment for 6 months, or fine of 5,000 rupees, or both.",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "240": {
      "title": "Giving false information respecting an offence committed",
      "punishment": "Imprisonment for 2 years, or fine, or both.",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "241": {
      "title": "Destruction of document or electronic record to prevent its production as evidence",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "242": {
      "title": "False personation for purpose of act or proceeding in suit or prosecution",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "243": {
      "title": "Fraudulent removal or concealment of property to prevent its seizure as forfeited or in execution",
      "punishment": "Imprisonment for 3 years, or fine, of 5,000 rupees, or both.",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "244": {
      "title": "Fraudulent claim to property to prevent its seizure as forfeited or in execution",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "245": {
      "title": "Fraudulently suffering decree for sum not due",
      "punishment": "Imprisonment for 2 years, or fine, or both.",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "246": {
      "title": "Dishonestly making false claim in Court",
      "punishment": "Imprisonment for 2 years and fine.",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "247": {
      "title": "Fraudulently obtaining decree for sum not due",
      "punishment": "Imprisonment for 2 years, or fine, or both.",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "248": {
      "title": "False charge of offence made with intent to injure",
      "punishment": "Up to 5 years, or fine up to 2,00,000, or both; if charge is of capital / life imprisonment / 7+ years offence: up to 10 years and fine",
      "max_years": 10,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "249": {
      "title": "Harbouring offender",
      "punishment": "249(a): Imprisonment for 5 years and fine.; 249(b): Imprisonment for 3 years and fine.; 249(c): Imprisonment for onefourth of the longest term, and of the descriptions, provided for the offence, or fine, or both.",
      "max_years": null,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "249(a)": {
          "offence": "Harbouring an offender, if the offence is punishable with death.",
          "punishment": "Imprisonment for 5 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "249(b)": {
          "offence": "If punishable with imprisonment for life or with imprisonment for 10 years.",
          "punishment": "Imprisonment for 3 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "249(c)": {
          "offence": "If punishable with imprisonment for 1 year and not for 10 years.",
          "punishment": "Imprisonment for onefourth of the longest term, and of the descriptions, provided for the offence, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "250": {
      "title": "Taking gift, etc., to screen an offender from punishment",
      "punishment": "250(a): Imprisonment for 7 years and fine.; 250(b): Imprisonment for 3 years and fine.; 250(c): Imprisonment for onefourth of the longest term provided for the offence, or fine, or both.",
      "max_years": null,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "250(a)": {
          "offence": "Taking gift, etc., to screen an offender from punishment if the offence is punishable with death.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "250(b)": {
          "offence": "If punishable with imprisonment for life or with imprisonment for 10 years.",
          "punishment": "Imprisonment for 3 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "250(c)": {
          "offence": "If punishable with imprisonment for less than 10 years.",
          "punishment": "Imprisonment for onefourth of the longest term provided for the offence, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "251": {
      "title": "Offering gift or restoration of property in consideration of screening offender",
      "punishment": "251(a): Imprisonment for 7 years and fine.; 251(b): Imprisonment for 3 years and fine.; 251(c): Imprisonment for onefourth of the longest term, provided for the offence, or fine, or both.",
      "max_years": null,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "251(a)": {
          "offence": "Offering gift or restoration of property in consideration of screening offender if the offence is punishable with death.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        },
        "251(b)": {
          "offence": "If punishable with imprisonment for life or with imprisonment for 10 years.",
          "punishment": "Imprisonment for 3 years and fine.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        },
        "251(c)": {
          "offence": "If punishable with imprisonment for less than 10 years.",
          "punishment": "Imprisonment for onefourth of the longest term, provided for the offence, or fine, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "252": {
      "title": "Taking gift to help to recover stolen property, etc",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "253": {
      "title": "Harbouring offender who has escaped from custody or whose apprehension has been ordered",
      "punishment": "253(a): Imprisonment for 7 years and fine.; 253(b): Imprisonment for 3 years, with or without fine.; 253(c): Imprisonment for onefourth of the longest term provided for the offence, or fine, or both.",
      "max_years": null,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "max_years: punishment fixed by reference or fraction; not stated..",
      "variants": {
        "253(a)": {
          "offence": "Harbouring an offender who has escaped from custody, or whose apprehension has been ordered, if the offence is punishable with death.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "253(b)": {
          "offence": "If punishable with imprisonment for life or with imprisonment for 10 years.",
          "punishment": "Imprisonment for 3 years, with or without fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "253(c)": {
          "offence": "If punishable with imprisonment for 1 year and not for 10 years.",
          "punishment": "Imprisonment for onefourth of the longest term provided for the offence, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "254": {
      "title": "Penalty for harbouring robbers or dacoits",
      "punishment": "Rigorous imprisonment for 7 years and fine.",
      "max_years": 7,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "255": {
      "title": "Public servant disobeying direction of law with intent to save person from punishment or property from forfeiture",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "256": {
      "title": "Public servant framing incorrect record or writing with intent to save person from punishment or property from forfeiture",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "257": {
      "title": "Public servant in judicial proceeding corruptly making report, etc., contrary to law",
      "punishment": "Up to 7 years, or fine, or both",
      "max_years": 7,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "258": {
      "title": "Commitment for trial or confinement by person having authority who knows that he is acting contrary to law",
      "punishment": "Up to 7 years, or fine, or both",
      "max_years": 7,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "259": {
      "title": "Intentional omission to apprehend on part of public servant bound to apprehend",
      "punishment": "Up to 7 years (capital offence); up to 3 years (life / 10+ years); up to 2 years (other offence)",
      "max_years": 7,
      "bailable": true,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "cognizable: depends on the offence in question (Schedule: \"according as\"). Set to null.",
      "variants": {
        "259(a)": {
          "offence": "Intentional omission to apprehend on the part of a public servant bound by law to apprehend an offender, if the offence is punishable with death.",
          "punishment": "Imprisonment for 7 years, with or without fine.",
          "cognizable": "depends on the offence abetted/attempted/in question",
          "bailable": "yes",
          "compoundable": "no"
        },
        "259(b)": {
          "offence": "If punishable with imprisonment for life or imprisonment for 10 years.",
          "punishment": "Imprisonment for 3 years, with or without fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "259(c)": {
          "offence": "If punishable with imprisonment for less than 10 years.",
          "punishment": "Imprisonment for 2 years, with or without fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "260": {
      "title": "Intentional omission to apprehend on part of public servant bound to apprehend person under sentence or lawfully committed",
      "punishment": "260(a): Imprisonment for life, or imprisonment for 14 years, with or without fine.; 260(b): Imprisonment for 7 years, with or without fine.; 260(c): Imprisonment for 3 years, or fine, or both.",
      "max_years": 99,
      "bailable": null,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "bailable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "260(a)": {
          "offence": "Intentional omission to apprehend on the part of a public servant bound by law to apprehend person under sentence of a Court if under sentence of death.",
          "punishment": "Imprisonment for life, or imprisonment for 14 years, with or without fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "260(b)": {
          "offence": "If under sentence of imprisonment for life or imprisonment for 10 years, or upwards.",
          "punishment": "Imprisonment for 7 years, with or without fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "260(c)": {
          "offence": "If under sentence of imprisonment for less than 10 years or lawfully committed to custody.",
          "punishment": "Imprisonment for 3 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "261": {
      "title": "Escape from confinement or custody negligently suffered by public servant",
      "punishment": "Simple imprisonment up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "262": {
      "title": "Resistance or obstruction by a person to his lawful apprehension",
      "punishment": "Imprisonment for 2 years, or fine, or both.",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "263": {
      "title": "Resistance or obstruction to lawful apprehension of another person",
      "punishment": "263(a): Imprisonment for 2 years, or fine, or both.; 263(b): Imprisonment for 3 years and fine.; 263(c): Imprisonment for 7 years and fine.; 263(d): Imprisonment for 7 years and fine.; 263(e): Imprisonment for life, or imprisonment for 10 years and fine.",
      "max_years": 99,
      "bailable": null,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "bailable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "263(a)": {
          "offence": "Resistance or obstruction to the lawful apprehension of any person, or rescuing him from lawful custody.",
          "punishment": "Imprisonment for 2 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "263(b)": {
          "offence": "If charged with an offence punishable with imprisonment for life or imprisonment for 10 years.",
          "punishment": "Imprisonment for 3 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "263(c)": {
          "offence": "If charged with offence punishable with death.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "263(d)": {
          "offence": "If the person is sentenced to imprisonment for life, or imprisonment for 10 years, or upwards.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "263(e)": {
          "offence": "If under sentence of death.",
          "punishment": "Imprisonment for life, or imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "264": {
      "title": "Omission to apprehend, or sufferance of escape, on part of public servant, in cases not otherwise provided for",
      "punishment": "Simple imprisonment up to 3 years, and fine (intentional); up to 2 years, or fine, or both (negligent)",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "265": {
      "title": "Resistance or obstruction to lawful apprehension or escape or rescue in cases not otherwise provided for",
      "punishment": "Imprisonment for 6 months, or fine, or both.",
      "max_years": 0,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "266": {
      "title": "Violation of condition of remission of punishment",
      "punishment": "Punishment of original sentence, or if part of the punishment has been undergone, the residue.",
      "max_years": null,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "266": {
          "offence": "Violation of condition of remission of punishment.",
          "punishment": "Punishment of original sentence, or if part of the punishment has been undergone, the residue.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "267": {
      "title": "Intentional insult or interruption to public servant sitting in judicial proceeding",
      "punishment": "Simple imprisonment up to 6 months, or fine up to 5,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "268": {
      "title": "Personation of assessor",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "269": {
      "title": "Failure by person released on bail bond or bond to appear in Court",
      "punishment": "Imprisonment for 1 year, or fine, or both.",
      "max_years": 1,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIV — Of False Evidence and Offences Against Public Justice"
    },
    "270": {
      "title": "Public nuisance",
      "punishment": "Definition section: punishment is in section 292 and the specific sections.",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals",
      "verify": "Definition; punishment is in 292 (and the specific sections). Classification attributes not available: set to null."
    },
    "271": {
      "title": "Negligent act likely to spread infection of disease dangerous to life",
      "punishment": "Up to 6 months, or fine, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "272": {
      "title": "M alignant act likely to spread infection of disease dangerous to life",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "273": {
      "title": "Disobedience to quarantine rule",
      "punishment": "Up to 6 months, or fine, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "274": {
      "title": "Adulteration of food or drink intended for sale",
      "punishment": "Up to 6 months, or fine up to 5,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "275": {
      "title": "Sale of noxious food or drink",
      "punishment": "Up to 6 months, or fine up to 5,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "276": {
      "title": "Adulteration of drugs",
      "punishment": "Up to 1 year, or fine up to 5,000, or both",
      "max_years": 1,
      "bailable": null,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals",
      "verify": "First Schedule prints this as non-cognizable and non-bailable, an unusual combination; bailable and cognizable are left empty until checked against India Code (CLO, 12 Oct 2026)."
    },
    "277": {
      "title": "Sale of adulterated drugs",
      "punishment": "Up to 6 months, or fine up to 5,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "278": {
      "title": "Sale of drug as a different drug or preparation",
      "punishment": "Up to 6 months, or fine up to 5,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "279": {
      "title": "Fouling water of public spring or reservoir",
      "punishment": "Up to 6 months, or fine up to 5,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "280": {
      "title": "Making atmosphere noxious to health",
      "punishment": "Fine up to 1,000",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "281": {
      "title": "Rash driving or riding on a public way",
      "punishment": "Up to 6 months, or fine up to 1,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "282": {
      "title": "Rash navigation of vessel",
      "punishment": "Up to 6 months, or fine up to 10,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "283": {
      "title": "Exhibition of false light, mark or buoy",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "284": {
      "title": "Conveying person by water for hire in unsafe or overloaded vessel",
      "punishment": "Up to 6 months, or fine up to 10,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "285": {
      "title": "Danger or obstruction in public way or line of navigation",
      "punishment": "Fine up to 5,000",
      "max_years": 0,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "286": {
      "title": "Negligent conduct with respect to poisonous substance",
      "punishment": "Up to 6 months, or fine up to 5,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "287": {
      "title": "Negligent conduct with respect to fire or combustible matter",
      "punishment": "Up to 6 months, or fine up to 2,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "288": {
      "title": "Negligent conduct with respect to explosive substance",
      "punishment": "Up to 6 months, or fine up to 2,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "289": {
      "title": "Negligent conduct with respect to machinery",
      "punishment": "Up to 6 months, or fine up to 5,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "290": {
      "title": "Negligent conduct with respect to pulling down, repairing or constructing buildings, etc",
      "punishment": "Imprisonment for 6 months, or fine of 5,000 rupees, or both.",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "291": {
      "title": "Negligent conduct with respect to animal",
      "punishment": "Up to 6 months, or fine up to 5,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "292": {
      "title": "Punishment for public nuisance in cases not otherwise provided for",
      "punishment": "Fine up to 1,000",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "293": {
      "title": "Continuance of nuisance after injunction to discontinue",
      "punishment": "Up to 6 months, or fine up to 5,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "294": {
      "title": "Sale, etc., of obscene books, etc",
      "punishment": "First conviction: up to 2 years and fine up to 5,000; subsequent: up to 5 years and fine up to 10,000",
      "max_years": 5,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "295": {
      "title": "Sale, etc., of obscene objects to child",
      "punishment": "First conviction: up to 3 years and fine up to 2,000; subsequent: up to 7 years and fine up to 5,000",
      "max_years": 7,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "296": {
      "title": "Obscene acts and songs",
      "punishment": "Up to 3 months, or fine up to 1,000, or both, or community service",
      "max_years": 0,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "297": {
      "title": "Keeping lottery office",
      "punishment": "Up to 6 months, or fine, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XV — Of Offences Affecting the Public Health, Safety, Convenience, Decency and Morals"
    },
    "298": {
      "title": "Injuring or defiling place of worship with intent to insult religion of any class",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVI — Of Offences Relating to Religion"
    },
    "299": {
      "title": "Deliberate and malicious acts, intended to outrage religious feelings of any class by insulting its religion or religious beliefs",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVI — Of Offences Relating to Religion"
    },
    "300": {
      "title": "Disturbing religious assembly",
      "punishment": "Imprisonment for 1 year, or fine, or both.",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVI — Of Offences Relating to Religion"
    },
    "301": {
      "title": "Trespassing on burial places, etc",
      "punishment": "Imprisonment for 1 year, or fine, or both.",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVI — Of Offences Relating to Religion"
    },
    "302": {
      "title": "Uttering words, etc., with deliberate intent to wound religious feelings of any person",
      "punishment": "Up to 1 year, or fine, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XVI — Of Offences Relating to Religion"
    },
    "303": {
      "title": "Theft",
      "punishment": "Rigorous imprisonment for not be less than 1 year but which may extend to 5 years and fine. Upon return of the value of property or restoration of the stolen property, shall be punished with community service.",
      "max_years": 5,
      "bailable": null,
      "cognizable": null,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "bailable: differs by sub-section, see variants; cognizable: differs by sub-section or is conditional, see variants. Set to null.",
      "variants": {
        "303(2)": {
          "offence": "Theft. Where value of property is less than 5,000 rupees.",
          "punishment": "Rigorous imprisonment for not be less than 1 year but which may extend to 5 years and fine. Upon return of the value of property or restoration of the stolen property, shall be punished with community service.",
          "cognizable": "yes; no",
          "bailable": "no; yes",
          "compoundable": "yes"
        }
      }
    },
    "303(2)": {
      "title": "Theft",
      "punishment": "1 to 5 years, and fine; second/subsequent: rigorous 1 to 5 years and fine",
      "max_years": 5,
      "bailable": null,
      "cognizable": null,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "bailable: differs by sub-section, see variants; cognizable: differs by sub-section or is conditional, see variants. Set to null.",
      "variants": {
        "303(2)": {
          "offence": "Theft. Where value of property is less than 5,000 rupees.",
          "punishment": "Rigorous imprisonment for not be less than 1 year but which may extend to 5 years and fine. Upon return of the value of property or restoration of the stolen property, shall be punished with community service.",
          "cognizable": "yes; no",
          "bailable": "no; yes",
          "compoundable": "yes"
        }
      }
    },
    "304": {
      "title": "Snatching",
      "punishment": "Up to 3 years, and fine",
      "max_years": 3,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "305": {
      "title": "Theft in a dwelling house, or means of transportation or place of worship, etc",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "306": {
      "title": "Theft by clerk or servant of property in possession of master",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "307": {
      "title": "Theft after preparation made for causing death, hurt or restraint in order to committing of theft",
      "punishment": "Rigorous imprisonment up to 10 years, and fine",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "308": {
      "title": "Extortion",
      "punishment": "308(2): Imprisonment for 7 years, or fine, or both.; 308(3): Imprisonment for 2 years, or fine, or both.; 308(4): Imprisonment for 7 years and fine.; 308(5): Imprisonment for 10 years and fine.; 308(6): Imprisonment for 10 years and fine.; 308(7): Imprisonment for 10 years and fine.",
      "max_years": 10,
      "bailable": null,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "bailable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "308(2)": {
          "offence": "Extortion.",
          "punishment": "Imprisonment for 7 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "308(3)": {
          "offence": "Putting or attempting to put in fear of injury, in order to commit extortion.",
          "punishment": "Imprisonment for 2 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "308(4)": {
          "offence": "Putting or attempting to put a person in fear of death or grievous hurt in order to commit extortion.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "308(5)": {
          "offence": "Extortion by putting a person in fear of death or grievous hurt.",
          "punishment": "Imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "308(6)": {
          "offence": "Putting a person in fear of accusation of an offence punishable with death, imprisonment for life, or imprisonment for 10 years in order to commit extortion.",
          "punishment": "Imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "308(7)": {
          "offence": "Extortion by threat of accusation of an offence punishable with death, imprisonment for life, or imprisonment for 10 years.",
          "punishment": "Imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "309": {
      "title": "Robbery",
      "punishment": "309(4): Rigorous imprisonment for 10 years and fine. Rigorous imprisonment for 14 years.; 309(5): Rigorous imprisonment for 7 years and fine.; 309(6): Imprisonment for life, or rigorous imprisonment for 10 years and fine.",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "310": {
      "title": "Dacoity",
      "punishment": "Imprisonment for life, or rigorous up to 10 years, and fine; with murder: death/life and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "310(6)": {
      "title": "Dacoity",
      "punishment": "Imprisonment for life, or rigorous imprisonment for 10 years and fine.",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "311": {
      "title": "Robbery, or dacoity, with attempt to cause death or grievous hurt",
      "punishment": "Imprisonment for not less than 7 years.",
      "max_years": null,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "311": {
          "offence": "Robbery or dacoity, with attempt to cause death or grievous hurt.",
          "punishment": "Imprisonment for not less than 7 years.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "312": {
      "title": "Attempt to commit robbery or dacoity when armed with deadly weapon",
      "punishment": "Imprisonment for not less than 7 years.",
      "max_years": null,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "312": {
          "offence": "Attempt to commit robbery or dacoity when armed with deadly weapon.",
          "punishment": "Imprisonment for not less than 7 years.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "313": {
      "title": "Punishment for belonging to gang of robbers, etc",
      "punishment": "Rigorous imprisonment for 7 years and fine.",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "314": {
      "title": "Dishonest misappropriation of property",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "315": {
      "title": "Dishonest misappropriation of property possessed by deceased person at the time of his death",
      "punishment": "Imprisonment for 3 years and fine. Imprisonment for 7 years.",
      "max_years": 7,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "316": {
      "title": "Criminal breach of trust",
      "punishment": "316(2): Imprisonment for 5 years, or fine, or both.; 316(3): Imprisonment for 7 years and fine.; 316(4): Imprisonment for 7 years and fine.; 316(5): Imprisonment for life, or imprisonment for 10 years and fine.",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": null,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "compoundable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "316(2)": {
          "offence": "Criminal breach of trust.",
          "punishment": "Imprisonment for 5 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "yes (with Court permission)"
        },
        "316(3)": {
          "offence": "Criminal breach of trust by a carrier, wharfinger, etc.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "yes"
        },
        "316(4)": {
          "offence": "Criminal breach of trust by a clerk or servant.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "yes (with Court permission)"
        },
        "316(5)": {
          "offence": "Criminal breach of trust by public servant or by banker, merchant or agent, etc.",
          "punishment": "Imprisonment for life, or imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "317": {
      "title": "Stolen property",
      "punishment": "Up to 3 years (receiving); up to 7 years (habitually); up to life (if from dacoity)",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": null,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "compoundable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "317(2)": {
          "offence": "Dishonestly receiving stolen property knowing it to be stolen.",
          "punishment": "Imprisonment for 3 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "yes"
        },
        "317(3)": {
          "offence": "Dishonestly receiving stolen property, knowing that it was obtained by dacoity.",
          "punishment": "Imprisonment for life, or rigorous imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "317(4)": {
          "offence": "Habitually dealing in stolen property.",
          "punishment": "Imprisonment for life, or imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "317(5)": {
          "offence": "Assisting in concealment or disposal of stolen property, knowing it to be stolen.",
          "punishment": "Imprisonment for 3 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "yes"
        }
      }
    },
    "318": {
      "title": "Cheating",
      "punishment": "Imprisonment for 3 years, or fine, or both.",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "318(3)": {
      "title": "Cheating",
      "punishment": "Imprisonment for 5 years, or fine, or both.",
      "max_years": 5,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "318(4)": {
      "title": "Cheating",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "319": {
      "title": "Cheating by personation",
      "punishment": "Up to 5 years, or fine, or both",
      "max_years": 5,
      "bailable": true,
      "cognizable": true,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "320": {
      "title": "Dishonest or fraudulent removal or concealment of property to prevent distribution among creditors",
      "punishment": "Imprisonment of not be less than 6 months but which may extend to 2 years, or fine, or both.",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "321": {
      "title": "Dishonestly or fraudulently preventing debt being available for creditors",
      "punishment": "Imprisonment for 2 years, or fine, or both.",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "322": {
      "title": "Dishonest or fraudulent execution of deed of transfer containing false statement of consideration",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "323": {
      "title": "Dishonest or fraudulent removal or concealment of property",
      "punishment": "Imprisonment for 3 years, or fine, or both.",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "324": {
      "title": "Mischief",
      "punishment": "324(2): Imprisonment for 6 months, or fine, or both.; 324(3): Imprisonment for 1 year, or fine, or both.; 324(5): Imprisonment for 5 years, or fine, or both.; 324(6): Imprisonment for 5 years, and fine.",
      "max_years": 5,
      "bailable": true,
      "cognizable": null,
      "compoundable": null,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "cognizable: differs by sub-section or is conditional, see variants; compoundable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "324(2)": {
          "offence": "Mischief.",
          "punishment": "Imprisonment for 6 months, or fine, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "yes"
        },
        "324(3)": {
          "offence": "Mischief causing loss or damage to any property including property of Government or Local Authority.",
          "punishment": "Imprisonment for 1 year, or fine, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        },
        "324(5)": {
          "offence": "Mischief causing loss or damage to the amount of one lakh rupees or upwards.",
          "punishment": "Imprisonment for 5 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "324(6)": {
          "offence": "Mischief with preparation for causing to any person death, or hurt, or wrongful restraint, or fear of death, or of hurt, or of wrongful restraint.",
          "punishment": "Imprisonment for 5 years, and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "324(4)": {
      "title": "Mischief",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "325": {
      "title": "Mischief by killing or maiming animal",
      "punishment": "Up to 5 years, or fine, or both",
      "max_years": 5,
      "bailable": true,
      "cognizable": true,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "326": {
      "title": "Mischief by injury, inundation, fire or explosive substance, etc",
      "punishment": "326(a): Imprisonment for 5 years, or fine, or both.; 326(c): Imprisonment for 5 years, or with fine, or with both.; 326(e): Imprisonment for 1 year, or fine, or both.; 326(f): Imprisonment for 7 years and fine.; 326(g): Imprisonment for life, or imprisonment for 10 years and fine.",
      "max_years": 99,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "bailable null: differs by sub-section; cognizable null: differs by sub-section or conditional; compoundable null: differs by sub-section.",
      "variants": {
        "326(a)": {
          "offence": "Mischief by causing diminution of supply of water for agricultural purposes, etc.",
          "punishment": "Imprisonment for 5 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "yes"
        },
        "326(c)": {
          "offence": "Mischief by causing inundation or obstruction to public drainage attended with damage.",
          "punishment": "Imprisonment for 5 years, or with fine, or with both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "326(e)": {
          "offence": "Mischief by destroying or moving, etc., a landmark fixed by public authority.",
          "punishment": "Imprisonment for 1 year, or fine, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        },
        "326(f)": {
          "offence": "Mischief by fire or explosive substance with intent to cause damage.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "326(g)": {
          "offence": "Mischief by fire or explosive substance with intent to destroy a house, etc.",
          "punishment": "Imprisonment for life, or imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "326(b)": {
      "title": "Mischief by injury, inundation, fire or explosive substance, etc",
      "punishment": "Up to 5 years, or fine, or both",
      "max_years": 5,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "326(d)": {
      "title": "Mischief by injury, inundation, fire or explosive substance, etc",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "327": {
      "title": "Mischief with intent to destroy or make unsafe a rail, aircraft, decked vessel or one of twenty tons burden",
      "punishment": "327(1): Imprisonment for 10 years and fine.; 327(2): Imprisonment for life, or imprisonment for 10 years and fine.",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "328": {
      "title": "Punishment for intentionally running vessel aground or ashore with intent to commit theft, etc",
      "punishment": "Imprisonment for 10 years and fine.",
      "max_years": 10,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "329": {
      "title": "Criminal trespass and house-trespass",
      "punishment": "Up to 3 months, or fine up to 5,000, or both (trespass); up to 1 year and fine (house)",
      "max_years": 1,
      "bailable": true,
      "cognizable": true,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property"
    },
    "331": {
      "title": "Punishment for house-trespass or house-breaking",
      "punishment": "331(1): Imprisonment for 2 years and fine.; 331(2): Imprisonment for 3 years and fine.; 331(3): Imprisonment for 3 years and fine. Imprisonment for 10 years.; 331(4): Imprisonment for 5 years and fine. Imprisonment for 14 years.; 331(5): Imprisonment for 10 years and fine.; 331(6): Imprisonment for 14 years and fine.; 331(7): Imprisonment for life, or imprisonment for 10 years and fine.; 331(8): Imprisonment for life, or imprisonment for 10 years and fine.",
      "max_years": 99,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "332": {
      "title": "House-trespass in order to commit offence",
      "punishment": "332(a): Imprisonment for life, or rigorous imprisonment for 10 years and fine.; 332(b): Imprisonment for 10 years and fine.; 332(c): Imprisonment for 2 years and fine. Imprisonment for 7 years.",
      "max_years": 99,
      "bailable": null,
      "cognizable": true,
      "compoundable": null,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "bailable: differs by sub-section, see variants; compoundable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "332(a)": {
          "offence": "House-trespass in order to the commission of an offence punishable with death.",
          "punishment": "Imprisonment for life, or rigorous imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "332(b)": {
          "offence": "House-trespass in order to the commission of an offence punishable with imprisonment for life.",
          "punishment": "Imprisonment for 10 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "332(c)": {
          "offence": "House-trespass in order to the commission of an offence punishable with imprisonment. If the offence is theft.",
          "punishment": "Imprisonment for 2 years and fine. Imprisonment for 7 years.",
          "cognizable": "yes; yes",
          "bailable": "yes; no",
          "compoundable": "yes"
        }
      }
    },
    "333": {
      "title": "House-trespass after preparation for hurt, assault or wrongful restraint",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property"
    },
    "334": {
      "title": "Dishonestly breaking open receptacle containing property",
      "punishment": "334(1): Imprisonment for 2 years, or fine, or both.; 334(2): Imprisonment for 3 years, or fine, or both.",
      "max_years": 3,
      "bailable": null,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "bailable null: differs by sub-section.",
      "variants": {
        "334(1)": {
          "offence": "Dishonestly breaking open or unfastening any closed receptacle containing or supposed to contain property.",
          "punishment": "Imprisonment for 2 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "334(2)": {
          "offence": "Being entrusted with any closed receptacle containing or supposed to contain any property, and fraudulently opening the same.",
          "punishment": "Imprisonment for 3 years, or fine, or both.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "336": {
      "title": "Forgery",
      "punishment": "Up to 2 years, or fine, or both; for cheating: up to 7 years and fine",
      "max_years": 7,
      "bailable": null,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks",
      "verify": "bailable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "336(3)": {
          "offence": "Forgery for the purpose of cheating.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "no",
          "compoundable": "no"
        },
        "336(4)": {
          "offence": "Forgery for the purpose of harming the reputation of any person or knowing that it is likely to be used for that purpose.",
          "punishment": "Imprisonment for 3 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "336(2)": {
      "title": "Forgery",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks"
    },
    "337": {
      "title": "Forgery of record of Court or of public register, etc",
      "punishment": "Up to 7 years, and fine",
      "max_years": 7,
      "bailable": null,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks",
      "verify": "First Schedule prints this as non-cognizable and non-bailable, an unusual combination; bailable and cognizable are left empty until checked against India Code (CLO, 12 Oct 2026)."
    },
    "338": {
      "title": "Forgery of valuable security, will, etc",
      "punishment": "Imprisonment for life, or up to 10 years, and fine",
      "max_years": 99,
      "bailable": false,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks",
      "verify": "cognizable: differs by sub-section or is conditional, see variants. Set to null.",
      "variants": {
        "338": {
          "offence": "Forgery of a valuable security, will, or authority to make or transfer any valuable security, or to receive any money, etc. When the valuable security is a promissory note of the Central Government.",
          "punishment": "Imprisonment for life, or imprisonment for 10 years and fine. Imprisonment for life, or imprisonment for 10 years and fine.",
          "cognizable": "no; yes",
          "bailable": "no; no",
          "compoundable": "no"
        }
      }
    },
    "339": {
      "title": "Having possession of document described in section 337 or section 338, knowing it to be forged and intending to use it as genuine",
      "punishment": "Imprisonment for 7 years and fine. Imprisonment for life, or imprisonment for 7 years and fine.",
      "max_years": 99,
      "bailable": true,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks",
      "verify": "cognizable null: differs by sub-section or conditional.",
      "variants": {
        "339": {
          "offence": "Having possession of a document, knowing it to be forged, with intent to use it as genuine; if the document is one of the description mentioned in section 337. If the document is one of the description mentioned in section 338.",
          "punishment": "Imprisonment for 7 years and fine. Imprisonment for life, or imprisonment for 7 years and fine.",
          "cognizable": "yes; no",
          "bailable": "yes; yes",
          "compoundable": "no"
        }
      }
    },
    "340": {
      "title": "Forged document or electronic record and using it as genuine",
      "punishment": "Punishment for forgery of such document.",
      "max_years": null,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "340(2)": {
          "offence": "Using as genuine a forged document which is known to be forged.",
          "punishment": "Punishment for forgery of such document.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "341": {
      "title": "Making or possessing counterfeit seal, etc., with intent to commit forgery punishable under section 338",
      "punishment": "341(1): Imprisonment for life, or imprisonment for 7 years and fine.; 341(2): Imprisonment for 7 years and fine.; 341(3): Imprisonment for 3 years and fine.; 341(4): Same as if he had made or counterfeited such seal, plate or other instrument.",
      "max_years": null,
      "bailable": true,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks",
      "verify": "Punishment is fixed by reference to another offence (First Schedule: \"same as for ...\" / fraction of the longest term), so max_years cannot be stated without the underlying offence.",
      "variants": {
        "341(1)": {
          "offence": "Making or counterfeiting a seal, plate, etc., with intent to commit a forgery punishable under section 338 or possessing with like intent any such seal, plate, etc., knowing the same to be counterfeit.",
          "punishment": "Imprisonment for life, or imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "341(2)": {
          "offence": "Making or counterfeiting a seal, plate, etc., with intent to commit a forgery punishable otherwise than under section 338 or possessing with like intent any such seal, plate, etc., knowing the same to be counterfeit.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "341(3)": {
          "offence": "Possesses any seal, plate or other instrument knowing the same to be counterfeit.",
          "punishment": "Imprisonment for 3 years and fine.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        },
        "341(4)": {
          "offence": "Fraudulently or dishonestly uses as genuine any seal, plate or other instrument knowing or having reason to believe the same to be counterfeit.",
          "punishment": "Same as if he had made or counterfeited such seal, plate or other instrument.",
          "cognizable": "yes",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "342": {
      "title": "Counterfeiting device or mark used for authenticating documents described in section 338, or possessing counterfeit marked material",
      "punishment": "342(1): Imprisonment for life, or imprisonment for 7 years and fine.; 342(2): Imprisonment for 7 years and fine.",
      "max_years": 99,
      "bailable": null,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks",
      "verify": "bailable: differs by sub-section, see variants. Set to null. First Schedule prints this as non-cognizable and non-bailable, an unusual combination; bailable and cognizable are left empty until checked against India Code (CLO, 12 Oct 2026).",
      "variants": {
        "342(1)": {
          "offence": "Counterfeiting a device or mark used for authenticating documents described in section 338 or possessing counterfeit marked material.",
          "punishment": "Imprisonment for life, or imprisonment for 7 years and fine.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        },
        "342(2)": {
          "offence": "Counterfeiting a device or mark used for authenticating documents other than those described in section 338 or possessing counterfeit marked material.",
          "punishment": "Imprisonment for 7 years and fine.",
          "cognizable": "no",
          "bailable": "no",
          "compoundable": "no"
        }
      }
    },
    "343": {
      "title": "Fraudulent cancellation, destruction, etc., of will, authority to adopt, or valuable security",
      "punishment": "Imprisonment for life, or imprisonment for 7 years and fine.",
      "max_years": 99,
      "bailable": null,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks",
      "verify": "First Schedule prints this as non-cognizable and non-bailable, an unusual combination; bailable and cognizable are left empty until checked against India Code (CLO, 12 Oct 2026)."
    },
    "344": {
      "title": "Falsification of accounts",
      "punishment": "Up to 7 years, or fine, or both",
      "max_years": 7,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks"
    },
    "345": {
      "title": "Property mark",
      "punishment": "Definition section: the offence is in 345(3).",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks",
      "verify": "Definition (\"Property mark\"); the offence is 345(3). Classification attributes not available: set to null."
    },
    "346": {
      "title": "Tampering with property mark with intent to cause injury",
      "punishment": "Imprisonment for 1 year, or fine, or both.",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks"
    },
    "347": {
      "title": "Counterfeiting a property mark",
      "punishment": "347(1): Imprisonment for 2 years, or fine, or both.; 347(2): Imprisonment for 3 years and fine.",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": null,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks",
      "verify": "compoundable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "347(1)": {
          "offence": "Counterfeiting a property mark used by another, with intent to cause damage or injury.",
          "punishment": "Imprisonment for 2 years, or fine, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "yes"
        },
        "347(2)": {
          "offence": "Counterfeiting a property mark used by a public servant, or any mark used by him to denote the manufacture, quality, etc., of any property.",
          "punishment": "Imprisonment for 3 years and fine.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "348": {
      "title": "Making or possession of any instrument for counterfeiting a property mark",
      "punishment": "Imprisonment for 3 years, or fine, or both.",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks"
    },
    "349": {
      "title": "Selling goods marked with a counterfeit property mark",
      "punishment": "Up to 1 year, or fine, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks"
    },
    "350": {
      "title": "Making a false mark upon any receptacle containing goods",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XVIII — Of Offences Relating to Documents and to Property Marks"
    },
    "351": {
      "title": "Criminal intimidation",
      "punishment": "Up to 2 years, or fine, or both; if threat is of death/grievous hurt: up to 7 years",
      "max_years": 7,
      "bailable": true,
      "cognizable": false,
      "compoundable": null,
      "chapter": "XIX — Of Criminal Intimidation, Insult, Annoyance, Defamation, Etc.",
      "verify": "compoundable: differs by sub-section, see variants. Set to null.",
      "variants": {
        "351(2)": {
          "offence": "Criminal intimidation.",
          "punishment": "Imprisonment for 2 years, or fine, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "yes"
        },
        "351(3)": {
          "offence": "If threat be to cause death or grievous hurt, etc.",
          "punishment": "Imprisonment for 7 years, or fine, or both.",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "yes"
        },
        "351(4)": {
          "offence": "Criminal intimidation by anonymous communication or having taken precaution to conceal whence the threat comes.",
          "punishment": "Imprisonment for 2 years, in addition to the punishment under section 351(1).",
          "cognizable": "no",
          "bailable": "yes",
          "compoundable": "no"
        }
      }
    },
    "352": {
      "title": "Intentional insult with intent to provoke breach of peace",
      "punishment": "Up to 2 years, or fine, or both",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XIX — Of Criminal Intimidation, Insult, Annoyance, Defamation, Etc."
    },
    "353": {
      "title": "Statements conducing to public mischief",
      "punishment": "Up to 3 years, or fine, or both; in religious context: up to 5 years and fine",
      "max_years": 5,
      "bailable": false,
      "cognizable": true,
      "compoundable": false,
      "chapter": "XIX — Of Criminal Intimidation, Insult, Annoyance, Defamation, Etc."
    },
    "353(1)": {
      "title": "Statements conducing to public mischief",
      "punishment": "Up to 3 years, or fine, or both",
      "max_years": 3,
      "bailable": null,
      "cognizable": null,
      "compoundable": false,
      "chapter": "XIX — Of Criminal Intimidation, Insult, Annoyance, Defamation, Etc.",
      "verify": "First Schedule prints this as non-cognizable and non-bailable, an unusual combination; bailable and cognizable are left empty until checked against India Code (CLO, 12 Oct 2026)."
    },
    "354": {
      "title": "Act caused by inducing person to believe that he will be rendered an object of Divine displeasure",
      "punishment": "Imprisonment for 1 year, or fine, or both.",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XIX — Of Criminal Intimidation, Insult, Annoyance, Defamation, Etc."
    },
    "355": {
      "title": "Misconduct in public by a drunken person",
      "punishment": "Up to 24 hours simple imprisonment, or fine up to 1,000, or both",
      "max_years": 0,
      "bailable": true,
      "cognizable": false,
      "compoundable": false,
      "chapter": "XIX — Of Criminal Intimidation, Insult, Annoyance, Defamation, Etc."
    },
    "356": {
      "title": "Defamation",
      "punishment": "Simple imprisonment up to 2 years, or fine, or both, or community service",
      "max_years": 2,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XIX — Of Criminal Intimidation, Insult, Annoyance, Defamation, Etc."
    },
    "356(1)": {
      "title": "Defamation",
      "punishment": "See section 356 for punishment",
      "max_years": null,
      "bailable": null,
      "cognizable": null,
      "compoundable": null,
      "chapter": "XIX — Of Criminal Intimidation, Insult, Annoyance, Defamation, Etc.",
      "verify": "Definition; punishment is in 356(2) to (4). Classification attributes not available: set to null."
    },
    "357": {
      "title": "Breach of contract to attend on and supply wants of helpless person",
      "punishment": "Up to 3 months, or fine up to 5,000, or both",
      "max_years": 1,
      "bailable": true,
      "cognizable": false,
      "compoundable": true,
      "chapter": "XIX — Of Criminal Intimidation, Insult, Annoyance, Defamation, Etc."
    }
  }
}
```

## T-383 (Shashank, b1f6be7), 13 Oct 2026: approved

BNS 61(2), and IPC 120B mapped to it, resolve to row 61 (criminal conspiracy) under rule 3. A target that splits into variants is the punishing sub-section, not a definition. The attributes stay null, so they show the T-371 "Depends on the sub-section…" line and the caveat. In the timeline it gives "Depends on the offence. Check BNSS section 187." (rule 2): conspiracy takes the punishment of its object offence, so no fixed period applies. The 1888-lookup sweep changed only 61(2).
