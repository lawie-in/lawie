# T-245: old/new criminal law switch, per pack (signed)

Ajay (CLO), 12 Oct 2026 IST. Base read: `origin/develop_staging` after 1aee87c. Apply after T-237 and T-241 (same files). Section pairs below are checked against our signed tables `config/sections/crpc-to-bnss.json` and `ipc-to-bns.json`; sub-sections not in a pack or table today are marked **verify** and stay out.

## The rule

- **Offence (substantive law)** follows the **date of the offence**. Before 1 July 2024: Indian Penal Code, 1860. On or after: Bharatiya Nyaya Sanhita, 2023. Special Acts (NDPS, SC/ST, PMLA, DV Act and the like) are not affected.
- **Procedure and evidence** follow the **date the case began** (FIR; or the complaint where there is no FIR). On or after 1 July 2024: BNSS and BSA. Before: proceedings pending on that date continue under the CrPC (BNSS s.531(2)(a)); whether a fresh application in such a case is made under the CrPC or the BNSS is the **advocate's choice**, never Lawie's.
- Lawie never converts a section from one code to the other and never assumes a date.

## Form keys (lead builds; I sign the `form_schema` diff)

| Key              | Label                                                         | Type                                             | Required       | Shown                                                           |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------ | -------------- | --------------------------------------------------------------- |
| `offence_date`   | Date of the alleged offence (or of the offence of conviction) | date                                             | no             | Group A, B                                                      |
| `fir_date`       | Date of FIR, or of the complaint if no FIR                    | date                                             | no             | Group A, C; reuse the key where the pack has it                 |
| `procedure_code` | This application is under                                     | select: `BNSS and BSA` / `CrPC and Evidence Act` | yes when shown | Group A, C, only when `fir_date` is before 1 July 2024 or empty |

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

| Pack                                   | Provision pair (CrPC → BNSS)                                                                    | Also                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bail_regular`                         | Magistrate 437 → 480; Court of Session / High Court 439 → 483                                   | Entry 0 becomes: `Draft a Regular Bail Application under the provision given as GOVERNING PROVISION in the case details, and cite only that provision as the provision under which bail is sought, in the heading, the opening paragraph and the prayer.` Entry 4 (BNS / "IPC 498A = BNS 85" line) is deleted; S-text replaces it |
| `bail_before_magistrate`               | 437 → 480                                                                                       | `prompt_context`: delete "(corresponding to Section 437 CrPC)" and "Cite BNS for offences (never IPC), BNSS for procedural provisions."                                                                                                                                                                                           |
| `bail_anticipatory`                    | 438 → 482                                                                                       | Entry 0 becomes: `Draft an Anticipatory Bail Application under the provision given as GOVERNING PROVISION in the case details.`                                                                                                                                                                                                   |
| `interim_bail`                         | 437 → 480 or 439 → 483, by court                                                                | Entry 0 becomes: `Draft an Interim Bail Application in the pending bail proceedings, under the provision given as GOVERNING PROVISION in the case details.`                                                                                                                                                                       |
| `bail_cancellation`                    | Court of Session / High Court 439(2) → 483(3); Magistrate 437(5) → 480 (sub-section **verify**) |                                                                                                                                                                                                                                                                                                                                   |
| `default_bail`                         | 167(2) → 187(3)                                                                                 |                                                                                                                                                                                                                                                                                                                                   |
| `surrender_application`                | 437 → 480                                                                                       |                                                                                                                                                                                                                                                                                                                                   |
| `suspension_of_sentence`               | 389 → 430                                                                                       |                                                                                                                                                                                                                                                                                                                                   |
| `criminal_appeal`                      | 374 → 415; 378 → 419                                                                            |                                                                                                                                                                                                                                                                                                                                   |
| `criminal_revision`                    | 397 → 438; 401 → 442                                                                            |                                                                                                                                                                                                                                                                                                                                   |
| `discharge_application`                | 227 → 250; 239 → 262; 245 → 268                                                                 | See citation fix 3                                                                                                                                                                                                                                                                                                                |
| `fir_quashing`, `quashing_528_bnss`    | 482 → 528                                                                                       | Article 226 unaffected                                                                                                                                                                                                                                                                                                            |
| `writ_petition_criminal`               | 154(3) → 173(4); 156(3) → 175(3); 41 → 35                                                       | Article 226 unaffected                                                                                                                                                                                                                                                                                                            |
| `review_petition` (criminal limb only) | 362 → 403                                                                                       | See citation fix 1                                                                                                                                                                                                                                                                                                                |
| `habeas_corpus`                        | 97 → 100; 57 → 58                                                                               | See citation fix 2. Articles 32 / 226 unaffected                                                                                                                                                                                                                                                                                  |

### Group B: offence only (no procedure key)

| Pack                      | Date key                                       | Pairs (IPC → BNS)                                                                                                  |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `legal_notice_defamation` | `offence_date`, labelled "Date of publication" | 499 → 356(1); 500 → 356(2)                                                                                         |
| `mact_claim`              | `offence_date`, labelled "Date of accident"    | 304A → 106(1); 279 → 281; 337 → 125(b); 338 → 125(c). The claim itself is under the Motor Vehicles Act, unaffected |

### Group C: procedure only (no offence)

| Pack                   | Pair                       | Note                                                                                                                                             |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maintenance_bnss_144` | 125 → 144; 127 → 146       | `fir_date` is labelled "Date the maintenance petition was filed" (for an alteration or execution in an old case); a fresh petition is under BNSS |
| `divorce_sma`          | 125 → 144 (reference only) | P-text only where it mentions maintenance                                                                                                        |

### Group D: wording only

`affidavit_identity`, `memo_of_parties`: the "NEVER include any IPC reference ..." sentence becomes `Cite a criminal law provision only as the BRIEF gives it. Do not convert an IPC section to the BNS, or a CrPC section to the BNSS.`

No change: `synopsis`, `list_of_dates`, `production_of_documents`, `vakalatnama`, `posh_complaint`, `dv_act_complaint`, civil limb of `review_petition`.

## Citation fixes in the same packs (wrong today)

| #   | Pack                    | Wrong                                                                                                                 | Exact fix                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `review_petition`       | "S.413 BNSS" as the criminal review provision (413 is CrPC 372, no appeal unless provided)                            | Replace every `S.413 BNSS` with `S.403 BNSS` (CrPC 362, court not to alter judgment; corrected from 402 by T-255)                                                                                                                                                                                                                                 |
| 2   | `habeas_corpus`         | "S.97 BNSS" for search of a person wrongfully confined                                                                | Replace every `S.97 BNSS` with `S.100 BNSS`                                                                                                                                                                                                                                                                                                       |
| 3   | `discharge_application` | "S.272 BNSS (summons case)": there is no discharge in a summons case; CrPC 245 (warrant case on complaint) is missing | `S.250 BNSS (Sessions) / S.262 BNSS (warrant case before Magistrate) / S.272 BNSS (summons case)` → `S.250 BNSS (Sessions) / S.262 BNSS (warrant case on police report) / S.268 BNSS (warrant case on complaint)`; `(S.250 / S.262 / S.272 BNSS)` → `(S.250 / S.262 / S.268 BNSS)`. Any other `272` in the pack: list it for me, do not change it |

## Conditions

| Item                                                                                                                                                                                                                                   | Mark                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Lead applies the text above word for word                                                                                                                                                                                              | Condition                                                                        |
| AC4 tests per Group A and B pack: offence 2023 → IPC cited; 2025 → BNS; no date → blank, no code assumed. Group A and C also: FIR 2023 with `procedure_code` CrPC → CrPC provision in heading and prayer; no choice → both-forms blank | Condition                                                                        |
| `config/sections/` maps both ways (AC3)                                                                                                                                                                                                | Condition: the reverse map is generated from the signed tables, never hand-typed |
| Moved golden snapshots listed for me before merge                                                                                                                                                                                      | Condition                                                                        |
| Evidence code follows `procedure_code`. The BSA's own savings section is **verify** and not cited                                                                                                                                      | Acceptable                                                                       |
| T-239 batch 1 criminal specs use these keys and texts (AC6)                                                                                                                                                                            | Approved; I apply them in each spec                                              |

Signed: Ajay (CLO), 12 Oct 2026 IST, on the conditions above. Any other wording comes back to me.

## Addendum 1: T-245a build rulings (Vishal, 14 Oct 2026)

`{governing_provision}` renders, byte-exact, as one of:

- BNSS: `Section {n} of the Bharatiya Nagarik Suraksha Sanhita, 2023`
- CrPC: `Section {n} of the Code of Criminal Procedure, 1973`
- no choice: `[To be confirmed: Section {crpc} of the CrPC or Section {bnss} of the BNSS]`
  In an all-caps heading it is upper-cased as a whole.

| #   | Point                                                                       | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Kind     |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Where the heading's provision goes                                          | **(A) approved**: `(Under {governing_provision})` in each pack's own cause-title format, and in the application heading for bail_regular / bail_anticipatory. No court-rule change.                                                                                                                                                                                                                                                                                                                                                               | —        |
| 2   | D1 skeletons hard-code BNSS                                                 | Replace each hard-coded `Section N of the Bharatiya Nagarik Suraksha Sanhita, 2023` with `{governing_provision}`: bail_regular :31 (court-keyed 437/439 → 480/483), bail_before_magistrate :53, bail_anticipatory :31, default_bail :11 (167(2) → 187(3)). bail_before_magistrate :211, women's proviso: BNSS `the first proviso to Section 480(1) of the BNSS` (as today); CrPC `the first proviso to Section 437(1) of the CrPC`; no choice `the first proviso to [To be confirmed: Section 437(1) of the CrPC or Section 480(1) of the BNSS]`. | must-fix |
| 3   | docs/templates twins (bail_regular, bail_anticipatory)                      | Heading `APPLICATION FOR REGULAR BAIL UNDER {GOVERNING_PROVISION}` / `APPLICATION FOR ANTICIPATORY BAIL UNDER {GOVERNING_PROVISION}`; prayer `… under {governing_provision}`, replacing "Section {bail_section} of BNSS, 2023". **Turn auto-convert off** for both: offences print exactly as given (it breaks "never convert"). Descriptions (:5): `Application for regular bail` / `Application for anticipatory bail (apprehension of arrest)`.                                                                                                | must-fix |
| 4   | Court unknown in two-pair packs (bail_regular, interim_bail)                | Procedure known: `[To be confirmed: Section 480 or Section 483 of the BNSS]` / `[To be confirmed: Section 437 or Section 439 of the CrPC]`. Both unknown: `[To be confirmed: Section 437 or 439 of the CrPC, or Section 480 or 483 of the BNSS]`. bail_cancellation, Magistrate: CrPC `Section 437(5)`, BNSS `Section 480` with no sub-section (verify stands).                                                                                                                                                                                   | must-fix |
| 5   | Lines my text missed                                                        | bail_before_magistrate entry [0]: delete `(successor to Section 437 CrPC)`. Entry [1]: `under BNSS 480` → `under the provision given as GOVERNING PROVISION in the case details`. bail_cancellation entry [0]: `483(3) BNSS read with 480 BNSS` → `the provision given as GOVERNING PROVISION in the case details`. Form labels `(BNS sections)` → `(as written in the FIR)`.                                                                                                                                                                     | must-fix |
| 6   | allahabad_hc anticipatory line names "U/S 482 BNSS"                         | Keep it for a BNSS choice. For a CrPC choice or no choice, print the T-426 generic `Anticipatory Bail Application No. _____ of {year}` (the court's old-law form is verify). Moved goldens to me.                                                                                                                                                                                                                                                                                                                                                 | must-fix |
| 7   | Preflight old_law_section and the intake IPC note fall back to the FIR date | **Offence date only.** With no offence date, no finding and no note: the S-text blank handles it. The FIR date is never a stand-in for the offence date.                                                                                                                                                                                                                                                                                                                                                                                          | must-fix |
| 8   | procedure_code cannot be shown conditionally                                | Always ask it, with help text `Matters only for a case that began before 1 July 2024. For an FIR on or after that date, Lawie uses the BNSS.` At draft time an FIR date on or after 1 July 2024 forces BNSS whatever was chosen.                                                                                                                                                                                                                                                                                                                  | approved |
| 9   | "Notice under Section 35 BNSS" (CrPC 41A)                                   | Follows procedure_code: `Section 35 of the BNSS` / `Section 41A of the CrPC`, no sub-section on either side. A form label shown before the choice reads `Notice to appear (Section 35 BNSS / Section 41A CrPC)`.                                                                                                                                                                                                                                                                                                                                  | must-fix |
| —   | offence_date in every pack; fir_date required?                              | offence_date goes in every Group A and B pack (signed table), optional. fir_date stays optional: an unknown date gives the blank, never a block.                                                                                                                                                                                                                                                                                                                                                                                                  | —        |

Golden entries moved by 2, 3, 4 and 6 come to me before merge.

Signed: Ajay (CLO), 14 Oct 2026 IST. Addendum 1 is my ruling; the "(Vishal, …)" in its heading names who asked.

## Addendum 2: T-245a part 1 build points (Vishal, 14 Oct 2026)

| #   | Point                                                                                                                                                                                                                          | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Kind                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | 35 BNSS / 41A CrPC wording                                                                                                                                                                                                     | BNSS `Section 35(3) of the BNSS`, kept as today where the text has it. CrPC `Section 41A of the CrPC`. No choice: `[To be confirmed: Section 41A of the CrPC or Section 35(3) of the BNSS]`. Applies to the skeleton clauses, the \_averments s35 entries and the s35 question. The form label from Addendum 1 stays as signed.                                                                                                                                                                                                                         | must-fix              |
| 2   | bail_cancellation, court unknown                                                                                                                                                                                               | BNSS: `[To be confirmed: Section 480 or Section 483(3) of the BNSS]`. CrPC: `[To be confirmed: Section 437(5) or Section 439(2) of the CrPC]`. Neither: `[To be confirmed: Section 437(5) or 439(2) of the CrPC, or Section 480 or 483(3) of the BNSS]`. No "480(5)" (verify stands).                                                                                                                                                                                                                                                                   | must-fix              |
| 3   | Twin texts missed                                                                                                                                                                                                              | bail_regular computed bail_section instruction → `{governing_provision}`. Both twins' `under Sections {sections_charged} of BNS, 2023` → `under Section(s) {sections_charged}, as written in the FIR`. Anticipatory `under Section 482 BNSS` → `under {governing_provision}`.                                                                                                                                                                                                                                                                           | must-fix              |
| 4   | Remaining BNSS citations                                                                                                                                                                                                       | All follow procedure_code. Magistrate entry [0] and prompt_context `480 BNSS / 483 BNSS` → `the provision given as GOVERNING PROVISION in the case details`. Bailable variant: new pair **CrPC 436 → BNSS 478**, through `{governing_provision}`. interim_bail `read with BNSS 480/483` and bail_cancellation `BNSS 483(3) ... read with 480` → `read with the provision given as GOVERNING PROVISION in the case details`. bail_regular `domestic violence (BNS 85/80)` → `cruelty or dowry death`, with no section numbers (S-text governs offences). | must-fix              |
| 5   | procedure_code required:true but never blocks                                                                                                                                                                                  | Make it **optional**. A required mark that never blocks misleads, and an empty value gives the blank.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | must-fix              |
| 6   | S/P at [1]/[2], entry 4 deleted                                                                                                                                                                                                | Same result. **Approved.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                     |
| 7   | default_bail blank in the Addendum 1 form                                                                                                                                                                                      | **Approved.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                     |
| 8   | Judgment names in prompts: bail_cancellation entry 5 (Dolat Ram; Bhagirathsinh), bail_anticipatory twin (Sushila Aggarwal), interim_bail prompt_context (Lal Kamlendra); also criminal_revision :219 (Krishnan v. Krishnaveni) | Against the signed rule (`Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].`). The model can misquote or invent a citation. Out of T-245a scope: a **new ticket** (Priya) removes each name and adds that sentence to the pack.                                                                                                                                                                                                                                                             | must-fix (new ticket) |

Moved goldens (part 2) come to me before merge.

## Addendum 3: T-245a part 1 leftovers (Vishal, 14 Oct 2026)

| #   | Point                                               | Ruling                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Static s35 question                                 | Use `…under Section 35(3) of the BNSS or Section 41A of the CrPC…` (the rest of the question unchanged).                                                                                                                                                                                                  |
| 2   | bail_before_magistrate DISTINCTION sentence         | Keep it, with each BNSS number followed by its pair: `Section 480 BNSS (Section 437 CrPC)` and `Section 483 BNSS (Section 439 CrPC)`. The P-text still decides what is cited.                                                                                                                             |
| 3   | bail_regular relatedActs note "BNS 85/80"           | Yes: `When the bail application involves cruelty or dowry death`. No section numbers.                                                                                                                                                                                                                     |
| 4   | Twin's "Do not cite Section 481 or Section 482"     | Follows the choice. Correct pairs: **CrPC 437A → BNSS 481** (not 436A) and **438 → 482**. CrPC: `Do not cite Section 437A or Section 438 of the CrPC`; no choice: `Do not cite Section 437A or 438 of the CrPC, or Section 481 or 482 of the BNSS`.                                                       |
| 5   | Bailable variant when the classification is unknown | Not 437/480 by default: unknown → blank, like the court-unknown rule. BNSS `[To be confirmed: Section 478 or Section 480 of the BNSS]`; CrPC `[To be confirmed: Section 436 or Section 437 of the CrPC]`; neither `[To be confirmed: Section 436 or 437 of the CrPC, or Section 478 or 480 of the BNSS]`. |
| 6   | Label reuse for the notice_provision condition      | Approved.                                                                                                                                                                                                                                                                                                 |

Signed: Ajay (CLO), 14 Oct 2026 IST.

## Addendum 4: T-245a part 2 (Vishal, 15 Oct 2026)

1. default_bail RELATED ACTS. CrPC choice: the CrPC entry **only**, `{act: "Code of Criminal Procedure, 1973", sections: [{number: "167(2)", description: "Procedure when investigation cannot be completed in twenty-four hours"}]}`, with the BNSS entry dropped. BNSS choice: the BNSS entry only, as today. No choice: both entries. **Approved.**
2. Upper-cased blank in the twins' heading: approved, on one condition: blank detection matches `[To be confirmed:` case-insensitively. A test with the upper-cased heading must be flagged as unfinished exactly as the lower-case blank is. must-fix if the detection misses it.

No golden moved (fixture FIR 2026): noted. The CrPC / no-choice Allahabad test is welcome.

Signed: Ajay (CLO), 15 Oct 2026 IST.

## Addendum 5: T-245a hash pins and the FIR-date question (Vishal, 15 Oct 2026)

1. `_averments/bail_regular.json` re-pin to `df163457…a923`: **approved**, on the stated diff only: the s35 averment `no notice under {{notice_provision}} was served on the applicant before arrest`, where `{{notice_provision}}` renders per Addendum 2 #1, plus requires/unlocked_by `notice_provision present`. Any other change in that file is not covered.
2. t182 bail_regular prompt digest: **approved** to re-record. The instruction changes are exactly the signed ones (deletions; S/P at [1]/[2]; entry 0; entry 4 removed; "cruelty or dowry death").
3. FIR date at intake: **ask it, never block.** It decides the procedure code, so asking it cuts the blanks. Label as signed (`Date of FIR, or of the complaint if no FIR`), with "Not known" allowed. An unanswered date prints the blank as today.

Signed: Ajay (CLO), 15 Oct 2026 IST.

Addendum 5 #3 follow-up (15 Oct 2026). fir_date question, signed byte-exact, replacing the model's wording and the fallback in all six packs:
`On what date was the FIR registered, or the complaint filed if there is no FIR?`

## Addendum 6: T-245a review wording (Vishal, 15 Oct 2026)

1. bail_cancellation prompt_context: use `Draft an Application for Cancellation of Bail under the provision given as GOVERNING PROVISION in the case details.` (not "read with").
2. bail_before_magistrate. displayName: `Bail Application before Magistrate (Section 480 BNSS / Section 437 CrPC)`. The \_meta description follows the same pairing. Validation rule: `recommend Section 483 BNSS (Section 439 CrPC) before the Court of Session or High Court`. Fold into T-245a. must-fix (the displayName is shown to users).
3. Court-rule practice notes ("S.483 BNSS" / "S.482 BNSS"): **parked**. The P-text governs what is cited. A follow-up adds the CrPC pair to each note.

Signed: Ajay (CLO), 15 Oct 2026 IST.

## Addendum 7: T-245a review round 2 notes (Vishal, 15 Oct 2026)

1. System rule 1 repeating the S-text and P-text verbatim (replacing "NEVER reference old IPC, CrPC"): **approved**.
2. The dead `\n(Under {governing_provision})` suffix in the bail_before_magistrate / default_bail caseNomenclature: **remove it in T-245a** (it would print twice if ever wired). No other change to those strings.
3. Offence-date-only warning scoped to the six packs until T-245b: noted.

## Addendum 8: T-441, judgment names (Vishal, 15 Oct 2026)

S = `Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].`

**(a) The five strings: approved as proposed** (including #2, bail_cancellation prompt_context :187, which I had missed). S is added once per pack, not once per line.

**(b) T-441 covers the whole of criminal_revision, bail_cancellation, bail_anticipatory (twin) and interim_bail**, by the rules below. Same files as T-245a.

**(c) The rest of the catalogue: one ticket per group, applying these signed rules mechanically.** I byte-check each group's diff; I do not pre-sign every line.

| Rule | Text                                                                                                                                                                                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | In model-visible text (promptInstructions, prompt_context, system_role, clause names and descriptions, relevantActs descriptions, notes), delete each judgment name, its citation and its connector ("per", "in", "as held in", "see", "following", "cite … on"). Keep the legal proposition word for word. |
| R2   | If a line only says to cite a judgment, delete the line.                                                                                                                                                                                                                                                    |
| R3   | Add S once per pack, as the last promptInstructions entry.                                                                                                                                                                                                                                                  |
| R4   | Where a name is used as a label ("Bhajan Lal categories", "Sarla Verma method"), replace it with a plain description proposed in the diff (e.g. "the recognised categories for quashing"). I check each one.                                                                                                |
| R5   | No new law in any replacement: no new section, case or proposition.                                                                                                                                                                                                                                         |
| R6   | key_citations, key_precedents and \_meta are not sent to the model: leave them. But change each `_meta.change_protocol` that makes a citation MANDATORY to `Do not name judgments in model-visible text (Ajay, T-441).`                                                                                     |
| R7   | The \_averments ban lists stay as they are.                                                                                                                                                                                                                                                                 |

**Always V1, whatever the group, signed one by one (send me the list):**

- the 6 user-facing form labels naming cases (curative, fir_quashing, divorce_mutual, dv_act, plaint_recovery, plaint_partition);
- any judgment inside fixed clause text that prints into the document (e.g. service_agreement);
- the "Suraj Lamp Disclaimer" clause name (gpa/spa).

Group order: criminal and writs **V1**; civil/family and deeds/agreements **V1.1**, except the always-V1 items above.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### Addendum 8: always-V1 items, signed byte-exact (15 Oct 2026)

| File:line                                  | New text                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| curative_petition.json :72 label           | `Curative ground`                                                                                                                                          |
| fir_quashing.json :103 label               | `Grounds for quashing invoked (one or more)` (the id stays)                                                                                                |
| divorce_mutual_consent.json :148 label     | `Whether waiver of the 6-month cooling period is sought`                                                                                                   |
| dv_act_complaint.json :82 label            | `Additional respondents (in-laws, family members)`                                                                                                         |
| plaint_recovery.json :202 label            | `Pre-institution mediation completed under Section 12A of the Commercial Courts Act, 2015 (if commercial and no urgent interim relief)`                    |
| plaint_partition.json :93 label            | `Female coparceners: daughters with an equal share after the Hindu Succession (Amendment) Act, 2005`                                                       |
| service_agreement.json :75 printed content | Delete the last sentence, ` Reference: Dharangadhara Chemical Works v. Workmen AIR 1957 SC 264 (control test).`. The clause ends at `…all statutory dues.` |
| gpa.json :239 name                         | `Title disclaimer (if power to sell included)`; the description stays.                                                                                     |
| spa.json :233 name                         | `Title disclaimer (if power to sell)`; the description stays.                                                                                              |

Any golden that moves (service_agreement especially) comes to me.

### T-441 byte check (feature/t-441-no-judgment-names, diff 7e94b5e9.., 15 Oct 2026)

The five signed strings are applied verbatim; S appears once per pack, last; no case name is left in any model-visible field of the four files (only key_citations, which R6 leaves alone); no golden moved.

criminal_revision R1/R2 calls: **approved as proposed** for :231, :233, :236, :237, :243, :249 and :250 (keep "charge framing principles"). The deletions of :232 and :238 are approved (nothing of law left).

Para 8: `Para 8: Grounds of revision — itemise each ground with relevant precedent.` becomes `Para 8: Grounds of revision — itemise each ground.` "With relevant precedent" invites a citation S forbids. must-fix in T-441.

With Para 8 changed: **T-441 is approved.** Merge-body ref: "Legal: T-441 signed by Ajay, 2ec63fc + this check".

T-441 review note (Vishal, 15 Oct 2026): restore the two propositions, as R1 would:

- interim_bail prompt_context, where the deleted sentence stood: `The court has power to grant interim bail pending disposal of the bail application.`
- bail_anticipatory twin: `Include reference to: (i) Article 21 of Constitution, (ii) the conditions the court may impose when granting anticipatory bail, (iii) that custodial interrogation is not necessary as applicant is willing to join investigation. ` + S.
  Fold into T-441 before merge; the rest stays approved.
  The two strings above, byte-exact:
- interim_bail: `The court has power to grant interim bail pending disposal of the bail application.`
- twin: `(ii) the conditions the court may impose when granting anticipatory bail, (iii) that custodial interrogation is not necessary as applicant is willing to join investigation.` followed by S.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-447 byte check (feature/t-447-criminal-judgment-names, diff e1b13796.., 15 Oct 2026)

Packs: criminal_appeal, curative_petition, fir_quashing, quashing_528_bnss, review_petition, surrender_application, suspension_of_sentence. S appears verbatim once per pack, last. No case name is left in any model-visible field (only key_citations, `_meta`, top-level `description`, form labels and validation_rules; the last two go to T-451, below). No new law (R5 met).

R4 labels: **approved as proposed.**

- fir_quashing: title `citing the recognised categories for quashing`; clause `Recognised Quashing Categories Verbatim`; `Quashing category 5 application` / `Quashing category 7 application`; `The seven categories are illustrative…`; `Para 8: Seven categories verbatim quotation paragraph…`; `(Cat 5 / Cat 1)`, `(Cat 6)`, `(Cat 7)`.
- quashing_528_bnss: clause and Para 5 `Recognised Quashing Categories Invoked` / `Recognised quashing categories invoked`; `cat 5 squarely applies`.
- curative_petition: `the recognised curative grounds`; `which curative ground is invoked`.

must-fix in T-447 (quashing_528_bnss), delete two lines:

- `Comprehensive principles on quashing on settlement.` There is no law left, and the two lines above already state it.
- `Three categories of cases for quashing.` This is unanchored and sits beside the quoted seven categories, so the model may invent a second list.

Questions:

- (a) curative_petition `prompt_context.promptInstructions: [S]`: **OK.** readDraftingInstructions flattens prompt_context, so S comes last. Condition: the T-447 test shows S as the last numbered instruction in curative's assembled prompt.
- (b) **Keep the CLO line.** R6 amended: each such `_meta.change_protocol` becomes `All edits require CLO sign-off. Do not name judgments in model-visible text (Ajay, T-441).`. This applies to the three in T-447, and to any T-441 pack where the CLO line was dropped.
- (c) **Yes, add to T-451:**
  - fir_quashing :103 label becomes `Recognised quashing categories invoked (one or more)`.
  - curative_petition :72 label becomes `Curative ground`.
  - curative_petition :196 validation rule becomes `At least one recognised curative ground must be selected`, if validation_rules reach preflight or the model.

With the two deletions, (a)'s test and (b) applied: **T-447 is approved.** Merge-body ref: "Legal: T-447 signed by Ajay, T-245 file, T-447 byte check".

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-451 ids (Priya, 15 Oct 2026)

Both ids reach the model: clause ids go through clauseLines (brief-drafter.ts:299), and form keys through the brief entry (`key`, :280). So R1/R4 apply, and they cannot stay. R4 replacements:

| Where                                       | Old                             | New                             |
| ------------------------------------------- | ------------------------------- | ------------------------------- |
| Clause id (fir_quashing, quashing_528_bnss) | `bhajan_lal_paragraph`          | `quashing_categories_paragraph` |
| Form key (fir_quashing)                     | `bhajan_lal_categories_invoked` | `quashing_categories_invoked`   |

This is no new law (R5). CLAUSE_CUES, the skeletons and any saved-form or draft mapping follow the rename; how that is done is Arjun's call, not mine. The wording does not change, so no golden should move; any golden that does move comes to me.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-449 questions (Priya / Kunal, 15 Oct 2026)

1. **Where S goes when a pack has no promptInstructions** (rejoinder_affidavit, restoration_application, interim_application). Do not append it to `system_prompt_addendum` or `system_role`. Field order puts it before tone and key_phrases, so it would not come last. Do the same as curative_petition (T-447 (a)): add `prompt_context.promptInstructions: [S]` as the **last key** of prompt_context. Never add a top-level `promptInstructions` to these packs: prompt-assembler then uses only that list and drops all of prompt_context. Condition: a test shows S as the last numbered instruction for each of the three.
2. **\_meta.** For mact_claim, yes to the reset, but use the amended R6 text that keeps the CLO line: `All edits require CLO sign-off. Do not name judgments in model-visible text (Ajay, T-441).` For plaint_declaration and plaint_partition, **leave** the \_meta: it is not model-visible and makes no citation mandatory.
3. **R4 labels.** I will mark them when Kunal's diff arrives.
4. **rera_complaint :155 label.** Labels reach the model (item.label), so it goes into T-451, not left as it is. New label: `Any previous Consumer / Civil proceedings on same cause? (the consumer remedy is concurrent)`.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-449 byte check (feature/t-449-civil-family-no-judgments, 27 packs, 15 Oct 2026)

S appears verbatim once, last, in 24 packs. It is missing from interim_application, rejoinder_affidavit and restoration_application: add it as ruled in T-449 Q1. No case name is left in any added line.

R4 marks:

| #   | Proposed                                                                                                               | Mark                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | mact_claim clause: `Multiplier method, with personal expenses deduction and conventional heads`                        | Approved with one addition: `Multiplier method, with future prospects, personal expenses deduction and conventional heads`                                                                                                                                                                                                                                     |
| 2   | mact_claim Para 18: `…largely superseded by multiplier-method computation in S.166 claims`                             | Approved                                                                                                                                                                                                                                                                                                                                                       |
| 3   | interim_application: `plead all three limbs (prima facie case, balance of convenience, irreparable injury) explicitly` | Approved                                                                                                                                                                                                                                                                                                                                                       |
| 4   | guardianship clause                                                                                                    | Reworded: `Details of father and mother — death/unfitness/incapacity/absence; for Hindu minors per S.6 HMGA father is natural guardian and after him mother, with 'after' read as 'in the absence of'; subject to S.4`                                                                                                                                         |
| 5   | plaint_partition Para 7: `…coparcenary status is conferred retrospectively.`                                           | **Not approved, legally wrong.** The amended S.6 is retroactive, not retrospective. Use: `Para 7: For pre-2005 demises or earlier partitions, plead carefully — the daughter's right under amended S.6 HSA arises by birth and operates retroactively, not retrospectively; a partition by registered deed or court decree before 20.12.2004 is not reopened.` |

The mact_claim R2 deletions (the minor-death and non-earning-member citation lines) are approved: nothing of law is left in them.

must-fix in T-449 (mact_claim :290, an error that was already there): the future-prospects line wrongly splits fixed salary out. It becomes: `   - Future prospects addition: permanent job — 50% if deceased below 40, 30% if 40-50, 15% if 50-60; self-employed or fixed salary — 40% / 25% / 10% for the same age bands.`

With the three S placements, #1, #4, #5 and :290 applied: **T-449 is approved.** Merge-body ref: "Legal: T-449 signed by Ajay, T-245 file, T-449 byte check".

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-449 reviewer round 1 (Priya / Kunal, 15 Oct 2026)

1. plaint_partition clause id `vineeta_sharma_paragraph` becomes `daughter_coparcener_paragraph`. Its cue and skeleton change with it.
2. ibc_application :150 label becomes `Any pre-existing dispute disclosed by CD (S.9 — dispute raised before the demand notice) — details`. It goes in T-451. The clause name at :226, if still named, becomes `No Pre-existing Dispute (S.9)` in T-449.
3. dv_act keeps a plain cue, placed where the deleted line stood: `Where maintenance or other monetary relief is sought, file an affidavit of assets and liabilities of both parties.`
4. condonation: reword to `Rejection of mechanical approach to condonation.` (the count goes; "Fifteen principles" points at nothing).
5. filing_checklist and validation_rules are shown to the user and not sent to the model (ai.service streams the checklist; the prompt assembler reads neither). They are outside T-441/T-451 and stay as they are, but only as citations I have checked. Priya: send me the list. I verify each one, and any I cannot verify is removed from that list.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-449 item 5: user-facing citations (Kunal, 15 Oct 2026)

These are not sent to the model. I checked each one:

| #   | Where                                                                                   | Mark                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | plaint_partition validation_rules.13 (Vineeta Sharma)                                   | Keep: correct                                                                                                                                                                                                                                                                                              |
| 2   | plaint_recovery validation_rules.11 (Patil Automation)                                  | Reword: as written it states the rule too broadly (it applies only to commercial suits, and urgent interim relief is an exception). New text: `pre_institution_mediation must be true for a commercial suit, unless urgent interim relief is sought (S.12A Commercial Courts Act, 2015; Patil Automation)` |
| 3   | legal_notice_copyright_infringement validation_rules.1 (Eastern Book Co. v. D.B. Modak) | Keep: correct                                                                                                                                                                                                                                                                                              |
| 4   | restoration_application validation_rules.parimal_standard (Parimal v. Veena)            | Keep: correct                                                                                                                                                                                                                                                                                              |
| 5   | dv_act_complaint filing_checklist.9 (Rajnesh v. Neha)                                   | Keep: correct                                                                                                                                                                                                                                                                                              |
| 6   | maintenance_bnss_144 filing_checklist.8 (Rajnesh v. Neha)                               | Keep: correct                                                                                                                                                                                                                                                                                              |

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-449 round 2 (Priya / Kunal reviewer optionals, 15 Oct 2026)

1. maintenance_bnss_144 "Supreme Court framework requiring affidavits of assets and liabilities": **leave**. The requirement is stated correctly.
2. itat_appeal Para 9: "Constitution Bench" is wrong (it was a three-judge bench). Reword the parenthesis to `(the Supreme Court struck down the third proviso to S.254(2A))`.

Separate item, not T-449: the Income-tax Act, 2025 has applied since 1 April 2026, so the 1961-Act section numbers in itat_appeal are marked "verify" until I map them. Priya opens the ticket.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-451 questions (Priya / Kunal, 15 Oct 2026)

1. fir_quashing :103 label: use the earlier string, `Grounds for quashing invoked (one or more)`. This withdraws the T-447 (c) string "Recognised quashing categories invoked (one or more)".
2. quashing_528_bnss :109-115 option ids: rename them, dropping the `_bhajan_lal_cat_N` suffix. The model sees the suffix, and its numbers also do not match the seven categories quoted in the pack (e.g. "absurd" is category 5, not 3). New ids: `no_offence_disclosed`, `ingredients_not_made_out`, `facts_absurd_inherently_improbable`, `express_legal_bar`, `civil_dispute_criminal_colour`, `mala_fide_personal_vendetta`, `procedural_illegality`. The two compromise ids stay. Mapping saved answers is Arjun's call. Any golden that moves comes to me.
3. curative_petition validation rule: if Kunal finds that validation_rules reach preflight or the model, use `At least one recognised curative ground must be selected`. If they do not, the rule is user-facing only and its citation is correct, so it stays as it is.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-451 gpa/spa ids (Priya, 15 Oct 2026)

The model sees both ids, so they are renamed in T-451 with the same read-time alias. This matches the gpa/spa clause names already signed.

| Old                           | New                      |
| ----------------------------- | ------------------------ |
| `suraj_lamp_disclaimer`       | `title_disclaimer`       |
| `yes_flag_suraj_lamp_warning` | `yes_flag_title_warning` |

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-451 joint_development_agreement id (Priya, 15 Oct 2026)

- joint_development_agreement :246 option `yes_general_gpa_with_suraj_lamp_flag` becomes `yes_general_gpa_with_title_flag`, with the same read-time alias. The :641 validation rule follows the new id.
- I swept every pack for judgment names in ids. The only carriers left are the ones already ruled for T-451 (fir_quashing, quashing_528_bnss, gpa, spa, and this one). `_averments/bail_regular` `arnesh_kumar_type_citation` is a ban-list id and stays under R7.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-450 questions (Priya / Shashank, 15 Oct 2026)

1. partition_deed `_meta.change_protocol`: **leave**, as for plaint_partition. It is not model-visible, and what it makes mandatory is the daughters' rights, not a citation.
2. gpa and sale_deed `_meta.change_protocol`: **leave**. Same reason: the disclaimer stays mandatory. Any model-visible text that names the judgment follows R1/R4 and becomes "title disclaimer".
3. The six hits are **in scope for T-450**. Exact text:

| Where                                   | New text                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| gift_deed :367 description              | `Coparcener cannot gift away coparcenary interest except for pious / charitable purposes`                                                         |
| spa :269                                | `Para 7: TITLE DISCLAIMER (if SPA authorises sale) — same as GPA: SPA does not itself transfer title; only registered Sale Deed transfers title.` |
| license_agreement :262 description      | `Critical to preserve license vs lease distinction (substance, not form: a lease passes an interest in the property, a licence does not)`         |
| shareholders_agreement :93 note         | `Must be mirrored in AOA to bind company`                                                                                                         |
| shareholders_agreement :168 note        | `Critical`                                                                                                                                        |
| shareholders_agreement :178 system_role | Delete ` (V.B. Rangaraj)`. The sentence ends `…mirrorable in AOA.`                                                                                |
| aoa :191                                | `Reserved matters / affirmative vote provisions are enforceable only if also reflected in AOA.`                                                   |

4. joint_development_agreement :497 goes into **T-450**: replace `Suraj Lamp disclaimer` with `title disclaimer`. The rest of the line stays.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-451 byte check (fix/t-451-judgment-labels at 175c0a4, 15 Oct 2026)

Every label, id and option rename matches the signed strings byte for byte: the curative label; divorce; dv_act; fir_quashing (`quashing_categories_invoked`, `Grounds for quashing invoked (one or more)`, `quashing_categories_paragraph` and its validation rule); quashing_528_bnss (`quashing_categories_paragraph` and the 7 option ids); gpa and spa (`title_disclaimer`, `Title disclaimer (…)`, `yes_flag_title_warning`); jda (`yes_general_gpa_with_title_flag`); ibc; plaint_partition; plaint_recovery; rera; and the service_agreement deletion.

The curative :196 validation rule is unchanged. That is allowed under my ruling: validation_rules are not model-visible, and the citation is correct. The judgment names still on this branch are in key_citations, in `_meta`, in user-facing validation_rules (allowed), or in deed packs that belong to T-450 (gpa :263/:371, sale_deed, partition_deed, jda :497).

**T-451 is approved.** Merge-body ref: "Legal: T-451 signed by Ajay, T-245 file, T-451 byte check 175c0a4".

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-450 byte check (feature/t-450-deeds-no-judgments at e665603, 15 Oct 2026)

The sweep strings from 50dc3c1 are applied verbatim: gift_deed, spa :269, license :262, shareholders ×3, aoa :191, jda :497. The R2 whole-line deletions are approved (lease :445, founders :169, service :174, partition :296, will (e)): nothing of law is left in them. Approved as well: spa :278 dropping "Key precedent:", and gpa :279 keeping "(per state amendments)". S appears once, last, in 18 of the 19 packs.

must-fix in T-450:

1. partition_deed :294 replaces the whole line with: `Daughter is coparcener by birth, irrespective of whether father was alive on 09.09.2005; the amended S.6 HSA operates retroactively, not retrospectively.` This drops "RETROSPECTIVE", as in T-449.
2. joint_development_agreement: S is missing. Add it once, as the last instruction, per R3.
3. gpa relevantActs :319 description, which now ends mid-sentence. New text: `Documents of which registration is compulsory — a GPA for sale of immovable property may fall within it`.

With 1-3 applied, **T-450 is approved.** Merge-body ref: "Legal: T-450 signed by Ajay, T-245 file, T-450 byte check e665603 + fixes".

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-448 byte check (fix/t-448-writ-packs-no-judgment-names at 8827785, 15 Oct 2026)

Packs: cat_oa, certiorari, mandamus, pil, quo_warranto, writ_petition_civil, writ_petition_criminal. S appears once, last, in each. No case name is left in model-visible text. R1/R2 are applied correctly. Approved:

- the certiorari Article 227 sentence, which is the correct present position on judicial orders of civil courts;
- the R4 labels "mandatory PIL disclosure guidelines", "exceptions to the alternative-remedy bar" and "custodial torture guidelines".

must-fix in T-448:

1. **R6.** cat_oa, pil, writ_petition_civil and writ_petition_criminal dropped the CLO line. Use `All edits require CLO sign-off. Do not name judgments in model-visible text (Ajay, T-441).`
2. **Wrong section (already in the pack before this ticket).** "S.35(7)" is not the arrest-without-warrant conditions. writ_petition_criminal Art. 22 line becomes: `   Art. 22 — Arrest procedures — conditions for arrest without warrant in offences punishable up to 7 years: S.35(1)(b) BNSS [S.41(1)(b) CrPC]; notice of appearance: S.35(3) BNSS [S.41A CrPC].` relevantActs description becomes: `When police may arrest (replaces S.41 CrPC)`.
3. writ_petition_civil: restore the deleted proposition as `Where action affects livelihood / human dignity — plead Article 21.`
4. cat_oa Para 15: `Para 15: Where penalty challenged — separate grounds on proportionality and on irrationality and, where applicable, S.11(2) CCS (CCA) Rules.` Proportionality and irrationality are two different tests.

With 1-4 applied: **T-448 is approved.** Merge-body ref: "Legal: T-448 signed by Ajay, T-245 file, T-448 byte check 8827785 + fixes".

Signed: Ajay (CLO), 15 Oct 2026 IST.

### Rechecks and T-448 leftovers (15 Oct 2026, evening)

- **T-451 at merge 1c8af6d8:** every signed label, id and option is present and unchanged. Closed.
- **T-450 at 1167a239:** all three fixes are present (partition_deed :294 retroactive line, S in joint_development_agreement, gpa :319). **T-450 closed.**
- **T-453 verifier "unsupported" on NI Act / BNSS section references (fixtures 06, 12-14):** a section number is law, not a fact, so it does not belong in the fact ledger. Extend the verifier's reference list with **only** the sections that appear in that pack's signed text or in a signed table (bns-offences, the T-245 pairs, the T-361 rows). A section found in neither stays "unsupported" and its draft comes to me. Do not add a general whitelist.
- **T-448 leftovers (Mahak):**
  - habeas_corpus :303 description becomes `Arrest by police — when permissible; conditions for arrest without warrant in offences punishable up to 7 years: S.35(1)(b) BNSS [S.41(1)(b) CrPC]`. This is the same wrong-section fix as T-448 #2, and it removes the judgment name.
  - mandamus validation rule :127 becomes `{ "rule": "Grounds must show a public legal duty, a clear legal right of the petitioner, demand and refusal, and no equally efficacious alternative remedy", "severity": "medium" }`. A rule that requires citing a judgment contradicts S.
  - certiorari system_role opening becomes `Certiorari issues to quash an order of an inferior tribunal or quasi-judicial authority on these grounds only:`. This drops "court", in line with the Article 227 sentence. The rest is unchanged.

Signed: Ajay (CLO), 15 Oct 2026 IST.

### T-471: s.138 drawer firm (Priya / Vishal, 16 Oct 2026)

(a) **OK.** respondent_name means "drawer as named on the cheque: a firm, company or person".

(b) The signed intake-prompt line, exact text:

`A firm or company named as the drawer is the drawer's name. Put the proprietor, partners or directors named with it in their own fields, never in place of the firm.`

(c) Fixture 08 is **OK** (drawer Gupta Electricals, drawer_proprietor Anil Gupta). Add one condition to the draft check. A sole proprietorship is not a separate person in law, so the notice is addressed to the proprietor "trading as" the firm (`Anil Gupta, proprietor of Gupta Electricals`) and **s.141 is not pleaded** for it (this ties in with the T-452 drawer type).

On naming persons for s.141:

- For a partnership firm or a company, s.141 applies.
- The notice is addressed to the firm or company.
- As safe practice, it is also addressed to each partner or director whom the advocate intends to arraign as in charge of and responsible for the business.
- Those names come from the advocate. The model never adds them.

Signed: Ajay (CLO), 16 Oct 2026 IST.

### Anushka run 4 (16 Oct 2026): T-472 limitation, T-471 s.141 paragraph, T-221

**T-472 (v1 blocker). Rule for every pack:** the model never states that a filing is within limitation. Limitation is computed by code from signed dates, or it is a blank.

1. Inputs: the date of the impugned order, the filing date, and, where relevant, the dates the certified copy was applied for and received. That interval is excluded under s.12(2) Limitation Act. **No yes/no "within limitation" field** may decide the paragraph. criminal_revision :115 becomes a date field.
2. Within the period (computed): `The present petition is filed within the period of limitation prescribed under {article/section}.`
3. Beyond the period (computed): print instead:

   `The present petition is filed after the period of limitation prescribed under {article/section}, with a delay of [To be confirmed: number of days of delay]. The petitioner has filed a separate application under Section 5 of the Limitation Act, 1963 for condonation of the delay, which may be read as part of this petition.`

   Also add the s.5 application to the filing checklist. The day count is printed only if code computed it; otherwise it stays the blank above.

4. Any input date unknown: `[To be confirmed: whether the petition is within limitation]`. Nothing is computed.
5. Scope: the same fault can occur in every pack whose text speaks of limitation. Today that is 19 packs: amendment_of_pleadings, certiorari, consumer_complaint, counter_affidavit, criminal_appeal, criminal_revision, curative_petition, default_bail, divorce_hma, divorce_sma, judicial_separation, legal_notice_breach_of_contract, legal_notice_consumer_deficiency, plaint_injunction, plaint_partition, plaint_recovery, posh_complaint, rejoinder_affidavit, restoration_application. Fix criminal_revision first (the blocker); the rest go in one follow-up under the same rule. Each pack's article or section comes from its signed text, and anything not there is **verify** and comes to me.

**T-471, the s.141 paragraph for a company or partnership drawer.** Names and roles come only from the advocate; a missing role is a blank.

- Notice, addressees:

  `1. {drawer firm/company}, through its {authorised signatory / partner / director}, at {registered office / place of business}; 2. {name}, {designation}; 3. …` (one line per person the advocate names).

- Notice and complaint, paragraph:

  `Accused No. 1 is a {company / partnership firm}, and the cheque was drawn on its account. Accused No. {n}, {name}, was, at the time the offence was committed, in charge of and responsible to Accused No. 1 for the conduct of its business, being its {designation} and {role: [To be confirmed: role of {name} in the conduct of the business]}. Accused No. {n} is therefore deemed to be guilty of the offence under Section 138 read with Section 141 of the Negotiable Instruments Act, 1881.`

  One such sentence is printed per person.

- Sole proprietorship: no s.141, as T-471 (c).

**T-221 forgot-password copy:** send me Madhuri's text and I will do the final pass. Conditions:

- It never reveals whether an account exists: `If an account exists for this email, we've sent a link to reset your password.`
- It states how long the link stays valid.
- It asks for no other personal data.

Signed: Ajay (CLO), 16 Oct 2026 IST.

### T-478: certiorari, Article 227 (16 Oct 2026)

1. **v1 blocker: the verifier.** A number directly after `Article`, `Art.`, `Section`, `S.`, `s.`, `Order`, `O.`, `Rule`, `r.`, `Schedule` or `Para` is a legal reference, not a case number. It is never blanked. Blanking "Article 227" also hits every writ that says "Article 226". This fix covers all packs, not only certiorari.
2. **v1:** certiorari.json `article_invoked` gains the option `Article 227 (judicial order of a civil court)`. The existing options stay.
3. **v1:** the mandatory clause id becomes `jurisdiction_clause`, with a read-time alias as in T-451. Name: `Jurisdiction`. Description: `State the Article selected in article_invoked. For a judicial order of a civil court, invoke Article 227, not Article 226.` Any golden that moves comes to me.

Signed: Ajay (CLO), 16 Oct 2026 IST.

### T-471 byte check (feature/t-471-drawer-firm at 98ffe7b6, 16 Oct 2026), with a correction to my own text

These match my signed text and are approved:

- the intake line (intake.prompts.ts:271);
- the proprietorship type ("X, proprietor of Y", no s.141);
- the addressee line ("through its {capacity}, at its {registered office / principal place of business}");
- the 3 person slots with "up to 3; add any others in the draft";
- the `[To be confirmed: …]` blanks.

**Correction (mine).** My 16 Oct paragraph said "Notice and complaint". In a **demand notice** it is wrong for two reasons:

- no one is yet an "Accused";
- the offence is complete only if payment is not made within 15 days of receipt of the notice, so "at the time the offence was committed … deemed to be guilty" cannot be said yet.

The "Accused No." wording belongs only to the s.138/141 complaint pack (v1.1). In legal_notice_s138 (docs/templates :539, :693, :696, :699) use:

- Opening: `Noticee No. 1 is a {s141_kind}, and the cheque was drawn on its account.`
- Per person: `Noticee No. {n}, {name}, is in charge of and responsible to Noticee No. 1 for the conduct of its business, being its {designation_text} and {role_text}, and shall be liable under Section 141 of the Negotiable Instruments Act, 1881 if the amount is not paid within 15 days of receipt of this notice.`

The designation and role blanks stay as built. With this change, **T-471 is approved.** Merge-body ref: "Legal: T-471 signed by Ajay, T-245 file, byte check 98ffe7b6 + notice wording correction".

Signed: Ajay (CLO), 16 Oct 2026 IST.

### Anushka run 4 triage (16 Oct 2026): T-485, T-484, T-479, T-482

**T-485 (pack faults).**

1. **Revision title follows the forum** (signed T-429 text):
   - Sessions Court: `Criminal Revision under Section 438 read with Section 440 BNSS (Section 397 read with Section 399 CrPC)`.
   - High Court: `Criminal Revision under Section 438 read with Section 442 BNSS (Section 397 read with Section 401 CrPC)`.
   - Both forums stay selectable.
   - Add one line: `Where a revision has already been filed before one of these courts, a further revision by the same person is barred (Section 438(3) BNSS / Section 397(3) CrPC).`
2. **quashing_528_bnss.**
   - Settlement or compromise must be offered and drafted as a ground. Use the existing `settlement_in_matrimonial_or_commercial_dispute` option, with the pack's signed caution that offences with a public element are not quashed on settlement.
   - Since the source is not named (T-441), the categories are **set out, not quoted**: no quotation marks and no "verbatim".
   - Clause name `Recognised Quashing Categories Verbatim` becomes `Recognised Quashing Categories` (this amends T-447). The instruction "quote verbatim" becomes `Set out the applicable categories in plain numbered form, not as a quotation.`
   - S stays last.
3. **"Disclaimer slip — Lawie drafting assistance acknowledged":** delete it from **every** filing checklist (amendment_of_pleadings, cat_oa, condonation_of_delay, criminal_appeal, criminal_revision, discharge_application, divorce_hma, divorce_mutual_consent, divorce_sma, dv_act_complaint and any others). Nothing about Lawie is filed in court.
   - The Lawie disclaimer appears in the app and on the export cover note, **never inside the court document's text**.
   - "Append Lawie disclaimer" in the prompts becomes a renderer action outside the pleading body.
4. **"Shri/Smt.":** never print both. If the gender is given, use `Shri` or `Smt.`. If not, print the name with no honorific. Applies to all packs.

**T-484 (caveat, s.148A CPC):** a real pack, v1.1. Until then show "This document type is not available yet"; there is no fallback draft. Required content:

- court and proceeding (instituted or expected);
- caveator and the expected applicant, with addresses;
- the order or application expected;
- caveator's address for service;
- the s.148A(2) undertaking that notice of the caveat has been or will be served by registered post (acknowledgement due) on the expected applicant;
- a note that the caveat lapses 90 days after lodging (s.148A(5)).

Checklist: proof of service, the court fee as per State rules, and an affidavit where the High Court's rules require one. The State and High Court rules are **verify**: listed in the pack, not stated as law until I check them.

**T-479 (cause titles):** no new wording. The signed T-404 cause-title fields apply. Mandamus uses the writ_petition_civil cause title. Send me any pack whose title has no signed text.

**T-482 (maintenance forum):**

- A s.144 BNSS application lies before the Family Court where one is established for the area (Family Courts Act s.7). Elsewhere it lies before the Judicial Magistrate First Class.
- The pack offers `Principal Judge, Family Court, {district}` **only for districts I have confirmed**, otherwise `Court of the Judicial Magistrate First Class, {district}`.
- The district list for Gaya and the other Bihar and Jharkhand districts is **verify**: I check it against each High Court's notification, and nothing is entered from memory.

Signed: Ajay (CLO), 16 Oct 2026 IST.

### T-471 drafter rule 4 line (Vishal, 16 Oct 2026)

Signed for all drafter and repair prompts, appended to rule 4:

`Never write that a fact is missing, not given or not stated in the brief, the facts or the instructions; print only its blank in the form [To be confirmed: …].`

The pack fallback at legal_notice_s138 :355 is also approved: `bank memo reference number (if not given: [To be confirmed: bank memo reference number])`.

Signed: Ajay (CLO), 16 Oct 2026 IST.

- T-471: a proprietorship with no proprietor named prints `[To be confirmed: name of the proprietor], proprietor of {firm}` (docs/templates/legal_notice_s138 :485). The notice is never addressed to the firm alone. Limiting respondent_name-as-text to the s.138 pack: OK.

Signed: Ajay (CLO), 16 Oct 2026 IST.

- Rule 4 in the ledger drafter and its repair prompts (drafter.prompts.ts :165, :200, :243): `Never write that a fact is missing, not given or not stated in the brief, the facts or the instructions; print only its placeholder in the form {{MISSING: …}}.` The signed sentence is used verbatim at :59, :88, :121. Condition: code turns every `{{MISSING: …}}` into `[To be confirmed: …]` before the user sees the draft, and a test shows none survives.

Signed: Ajay (CLO), 16 Oct 2026 IST.

### T-481 bug 2: default bail undertaking (16 Oct 2026)

Default bail under S.187(3) BNSS (old S.167(2) CrPC) is available only where the accused is prepared to furnish bail. So the undertaking is part of the right, but it is never asserted against the user's answer.

- **Yes:** print the pack's existing undertaking sentence, unchanged.
- **Not answered:** print `That the applicant [To be confirmed: whether the applicant is prepared to furnish bail and bonds as directed by this Hon'ble Court].`
- **No:** print nothing (the post-check removes any undertaking), and show this in the app, not in the draft: `Default bail under Section 187(3) BNSS is available only if the accused is prepared to furnish bail. Check this before filing.`

promptInstructions[8] becomes conditional on the answer, as above.

Signed: Ajay (CLO), 16 Oct 2026 IST.

## T-479 follow-up: respondent numbering and Supreme Court mandamus title (Ajay, 16 Oct 2026)

| Point                                     | Ruling                                                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Advocate-typed numbering              | OK. Strip only a leading "n." or "n)" at the start of a respondent line before our numbering. Never change the rest of the line.                                                                          |
| (b) Mandamus title, court = Supreme Court | A High Court / Article 226 title on a Supreme Court petition is wrong. Use the title below. If it is not built in v1, hide the Supreme Court option in mandamus. Never print the High Court title for it. |

Signed Supreme Court title (one line each):

```
IN THE SUPREME COURT OF INDIA
CIVIL ORIGINAL JURISDICTION
WRIT PETITION (CIVIL) NO. ______ OF ______
(Under Article 32 of the Constitution of India)
```

T-473 scope: ref f1a18422 covers the labels in forms, in the intake brief and in the intake extraction prompt, including the three court-type labels.
