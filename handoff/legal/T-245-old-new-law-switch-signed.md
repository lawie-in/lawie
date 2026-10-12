# T-245: old/new criminal law switch, per pack (signed)

Ajay (CLO), 12 Oct 2026 IST. Base read: `origin/develop_staging` after 1aee87c. Apply after T-237 and T-241 (same files). Section pairs below are checked against our signed tables `config/sections/crpc-to-bnss.json` and `ipc-to-bns.json`; sub-sections not in a pack or table today are marked **verify** and stay out.

## The rule

- **Offence (substantive law)** follows the **date of the offence**. Before 1 July 2024: Indian Penal Code, 1860. On or after: Bharatiya Nyaya Sanhita, 2023. Special Acts (NDPS, SC/ST, PMLA, DV Act and the like) are not affected.
- **Procedure and evidence** follow the **date the case began** (FIR; or the complaint where there is no FIR). On or after 1 July 2024: BNSS and BSA. Before: proceedings pending on that date continue under the CrPC (BNSS s.531(2)(a)); whether a fresh application in such a case is made under the CrPC or the BNSS is the **advocate's choice**, never Lawie's.
- Lawie never converts a section from one code to the other and never assumes a date.

## Form keys (lead builds; I sign the `form_schema` diff)

| Key | Label | Type | Required | Shown |
|---|---|---|---|---|
| `offence_date` | Date of the alleged offence (or of the offence of conviction) | date | no | Group A, B |
| `fir_date` | Date of FIR, or of the complaint if no FIR | date | no | Group A, C; reuse the key where the pack has it |
| `procedure_code` | This application is under | select: `BNSS and BSA` / `CrPC and Evidence Act` | yes when shown | Group A, C, only when `fir_date` is before 1 July 2024 or empty |

When `fir_date` is on or after 1 July 2024, `procedure_code` is set to `BNSS and BSA` and not shown.

The case details sent to the Drafter carry two derived lines: `PROCEDURE CODE: <procedure_code>` and `GOVERNING PROVISION: <the pack's provision under that code, e.g. Section 480 of the BNSS>`. With no `procedure_code`, both lines are left out and the P-text's blank applies.

## Shared Drafter text (exact)

**S-text** (Groups A and B), one `promptInstructions` entry:

`Cite the offences as the BRIEF gives them (FIR, charge sheet, complaint or order). The law of the offence follows the date of the offence: an offence committed before 1 July 2024 is under the Indian Penal Code, 1860; one committed on or after that date is under the Bharatiya Nyaya Sanhita, 2023. Never convert a section from one code to the other. Where the BRIEF does not give the date of the offence, write the sections as the BRIEF gives them and add [To be confirmed: date of the alleged offence, which decides whether the IPC or the BNS applies]. Where the sections the BRIEF gives are under the other code from the one the date points to, or the alleged acts run across 1 July 2024, keep the sections as the BRIEF gives them and add [To be confirmed: whether the IPC or the BNS applies to the offence].`

**P-text** (Groups A and C), one `promptInstructions` entry:

`Cite the procedure under the code given as PROCEDURE CODE in the case details: the Bharatiya Nagarik Suraksha Sanhita, 2023 with the Bharatiya Sakshya Adhiniyam, 2023, or the Code of Criminal Procedure, 1973 with the Indian Evidence Act, 1872. Cite only that code, in the heading, the body and the prayer. Where no PROCEDURE CODE is given, cite the provision in both forms inside a blank, for example [To be confirmed: Section 437 of the CrPC or Section 480 of the BNSS].`

`{governing_provision}`: the lead adds this placeholder to `causeTitle.caseNomenclature` and `prayerTemplate` wherever they name a BNSS section today, filled from the per-pack pair below and `procedure_code`; empty choice → `[To be confirmed: Section <CrPC> CrPC or Section <BNSS> BNSS]`.

## Per pack

Every sentence or phrase in the pack that says "never IPC", "NEVER use old IPC section numbers", "Cite BNS for offences (never IPC)" or "NEVER include any IPC reference" is **deleted**; the S-text and/or P-text below is added once, as the second `promptInstructions` entry.

### Group A: offence and procedure

| Pack | Provision pair (CrPC → BNSS) | Also |
|---|---|---|
| `bail_regular` | Magistrate 437 → 480; Court of Session / High Court 439 → 483 | Entry 0 becomes: `Draft a Regular Bail Application under the provision given as GOVERNING PROVISION in the case details, and cite only that provision as the provision under which bail is sought, in the heading, the opening paragraph and the prayer.` Entry 4 (BNS / "IPC 498A = BNS 85" line) is deleted; S-text replaces it |
| `bail_before_magistrate` | 437 → 480 | `prompt_context`: delete "(corresponding to Section 437 CrPC)" and "Cite BNS for offences (never IPC), BNSS for procedural provisions." |
| `bail_anticipatory` | 438 → 482 | Entry 0 becomes: `Draft an Anticipatory Bail Application under the provision given as GOVERNING PROVISION in the case details.` |
| `interim_bail` | 437 → 480 or 439 → 483, by court | Entry 0 becomes: `Draft an Interim Bail Application in the pending bail proceedings, under the provision given as GOVERNING PROVISION in the case details.` |
| `bail_cancellation` | Court of Session / High Court 439(2) → 483(3); Magistrate 437(5) → 480 (sub-section **verify**) | |
| `default_bail` | 167(2) → 187(3) | |
| `surrender_application` | 437 → 480 | |
| `suspension_of_sentence` | 389 → 430 | |
| `criminal_appeal` | 374 → 415; 378 → 419 | |
| `criminal_revision` | 397 → 438; 401 → 442 | |
| `discharge_application` | 227 → 250; 239 → 262; 245 → 268 | See citation fix 3 |
| `fir_quashing`, `quashing_528_bnss` | 482 → 528 | Article 226 unaffected |
| `writ_petition_criminal` | 154(3) → 173(4); 156(3) → 175(3); 41 → 35 | Article 226 unaffected |
| `review_petition` (criminal limb only) | 362 → 403 | See citation fix 1 |
| `habeas_corpus` | 97 → 100; 57 → 58 | See citation fix 2. Articles 32 / 226 unaffected |

### Group B: offence only (no procedure key)

| Pack | Date key | Pairs (IPC → BNS) |
|---|---|---|
| `legal_notice_defamation` | `offence_date`, labelled "Date of publication" | 499 → 356(1); 500 → 356(2) |
| `mact_claim` | `offence_date`, labelled "Date of accident" | 304A → 106(1); 279 → 281; 337 → 125(b); 338 → 125(c). The claim itself is under the Motor Vehicles Act, unaffected |

### Group C: procedure only (no offence)

| Pack | Pair | Note |
|---|---|---|
| `maintenance_bnss_144` | 125 → 144; 127 → 146 | `fir_date` is labelled "Date the maintenance petition was filed" (for an alteration or execution in an old case); a fresh petition is under BNSS |
| `divorce_sma` | 125 → 144 (reference only) | P-text only where it mentions maintenance |

### Group D: wording only

`affidavit_identity`, `memo_of_parties`: the "NEVER include any IPC reference ..." sentence becomes `Cite a criminal law provision only as the BRIEF gives it. Do not convert an IPC section to the BNS, or a CrPC section to the BNSS.`

No change: `synopsis`, `list_of_dates`, `production_of_documents`, `vakalatnama`, `posh_complaint`, `dv_act_complaint`, civil limb of `review_petition`.

## Citation fixes in the same packs (wrong today)

| # | Pack | Wrong | Exact fix |
|---|---|---|---|
| 1 | `review_petition` | "S.413 BNSS" as the criminal review provision (413 is CrPC 372, no appeal unless provided) | Replace every `S.413 BNSS` with `S.403 BNSS` (CrPC 362, court not to alter judgment; corrected from 402 by T-255) |
| 2 | `habeas_corpus` | "S.97 BNSS" for search of a person wrongfully confined | Replace every `S.97 BNSS` with `S.100 BNSS` |
| 3 | `discharge_application` | "S.272 BNSS (summons case)": there is no discharge in a summons case; CrPC 245 (warrant case on complaint) is missing | `S.250 BNSS (Sessions) / S.262 BNSS (warrant case before Magistrate) / S.272 BNSS (summons case)` → `S.250 BNSS (Sessions) / S.262 BNSS (warrant case on police report) / S.268 BNSS (warrant case on complaint)`; `(S.250 / S.262 / S.272 BNSS)` → `(S.250 / S.262 / S.268 BNSS)`. Any other `272` in the pack: list it for me, do not change it |

## Conditions

| Item | Mark |
|---|---|
| Lead applies the text above word for word | Condition |
| AC4 tests per Group A and B pack: offence 2023 → IPC cited; 2025 → BNS; no date → blank, no code assumed. Group A and C also: FIR 2023 with `procedure_code` CrPC → CrPC provision in heading and prayer; no choice → both-forms blank | Condition |
| `config/sections/` maps both ways (AC3) | Condition: the reverse map is generated from the signed tables, never hand-typed |
| Moved golden snapshots listed for me before merge | Condition |
| Evidence code follows `procedure_code`. The BSA's own savings section is **verify** and not cited | Acceptable |
| T-239 batch 1 criminal specs use these keys and texts (AC6) | Approved; I apply them in each spec |

Signed: Ajay (CLO), 12 Oct 2026 IST, on the conditions above. Any other wording comes back to me.
