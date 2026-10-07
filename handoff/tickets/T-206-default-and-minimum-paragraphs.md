# T-206 — Default and minimum paragraphs for each document type

| Field      | Value                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| Phase      | 2 — Drops pricing                                                                            |
| Owner      | Ajay, with Priya                                                                             |
| Mode       | Legal work, not through the dev lead                                                         |
| Status     | Delivered by Ajay on 4 Oct 2026. Limits for 86 templates wait for a check against T-004 data |
| Depends on | None                                                                                         |
| Branch     | None                                                                                         |
| Created    | 2026-10-03                                                                                   |

## Goal

One table that says, for each of the 92 document types, the default and the minimum number of paragraphs, and one definition of a paragraph.

## Context

- T-202 charges 50 drops + 2 per paragraph and never lets a court-critical document go below its minimum.
- T-003 and T-202 both need the same definition of a paragraph.
- If the numbers are stored in `apps/drafting/src/config/document-rules/`, that is legal content and needs Ajay's sign-off.
- Paragraph limits already exist in config: `min_paragraphs` and `max_paragraphs` on AI sections and `min_body_paragraphs` in the validation rules. Six hand-tuned templates set them (minimums of 5, 7, 8 and 12). The rest get defaults from `template-promoter.ts` (4 to 12, 5 to 15, or 6 to 18). Start the table from these values.

## Acceptance criteria

- A written definition of a paragraph. Proposed: non-empty text blocks in AI-generated sections, not counting headings, cause title, prayer or verification.
- A table of the 92 document types with a default and a minimum for each.
- Document types that must never be shortened are marked.
- A statement on whether the model may be told a target length.
- Ajay's sign-off reference is written in this file for T-202 to quote.

## In scope

- The definition and the table, saved in this file or linked from it

## Out of scope

- Code

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: This ticket produces it

## Review, 3 Oct 2026

| Reviewer | Verdict  | Note                            |
| -------- | -------- | ------------------------------- |
| Ajay     | Approved | Mine to deliver. Can start now. |
| Priya    | Approved | T-202 cannot start without it.  |

## Result (Ajay, 4 Oct 2026)

**Status: delivered. This is the CLO agent's proposal. The numbers for the 86 templates that were never hand-tuned are judgement, not measurement, and should be checked against the T-004 data.**

### 1. What counts as a paragraph

- A paragraph is **one numbered paragraph of the body**. In an agreement or deed it is one numbered clause.
- Not counted: the cause title, headings, the subject line, recitals, the prayer, the verification, the advocate block, and sub-paragraphs such as (a), (b), (i), (ii).
- This is what the code already counts: lines that start with a number and a full stop in the AI-written body (`assembleDocument` in `template-engine.service.ts`).
- One gap for T-202: the code counts only the first AI-written section. A template with more than one must have all of them counted.

### 2. May the model be told a target length?

- **Yes, and it already is.** The user prompt ends with "Generate 5-15 numbered paragraphs", built from the template's limits in `buildAIUserPrompt`.
- For T-202 the range may be replaced by the length the user chose, as a target. The model will not always hit it exactly, which is why the rule is "charge the actual count, never more than the estimate".
- A user may never choose a length below the minimum for a court-filed document.

### 3. What exists in the code today

- Six hand-tuned templates carry their own limits: `bail_anticipatory` 8 to 12, `bail_regular` 7 to 12, `consumer_complaint` 8 to 12, `legal_notice_s138` 5 to 7, `legal_notice_s80` 5 to 8, `rent_agreement` 12 to 18. I set these in May and they stay.
- The other 86 get a default from `template-promoter.ts` by kind: legal notice 4 to 12, agreement 6 to 18, court application 5 to 15, everything else 5 to 15.

### 4. Proposed limits by category

| Category                 | Templates | Min | Default | Max |
| ------------------------ | --------- | --- | ------- | --- |
| civil                    | 2         | 6   | 10      | 18  |
| civil_interlocutory      | 5         | 6   | 10      | 18  |
| civil_pleading           | 8         | 10  | 16      | 30  |
| consumer                 | 1         | 8   | 12      | 20  |
| corporate                | 10        | 12  | 18      | 35  |
| criminal                 | 3         | 8   | 14      | 25  |
| criminal_appellate       | 1         | 10  | 16      | 30  |
| criminal_bail            | 4         | 8   | 12      | 20  |
| criminal_petition        | 5         | 8   | 14      | 25  |
| criminal_procedural      | 1         | 6   | 10      | 18  |
| family                   | 8         | 10  | 15      | 25  |
| non_court_legal_document | 1         | 4   | 6       | 10  |
| notice                   | 6         | 5   | 8       | 14  |
| procedural               | 8         | 4   | 6       | 12  |
| transactional_deed       | 12        | 10  | 15      | 30  |
| tribunal                 | 6         | 8   | 14      | 25  |
| writ                     | 11        | 10  | 16      | 30  |

### 5. Proposed limits for all 92 templates

The same numbers as a file for T-202: `handoff/design/T-206-paragraph-limits.json`.

| Category                 | Template id                           | Name                                                                                   | Min | Default | Max | Court-filed | Note                                |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------- | --- | ------- | --- | ----------- | ----------------------------------- |
| civil                    | `legal_notice_s80`                    | Legal Notice under Section 80 CPC                                                      | 5   | 6       | 8   | No          | Hand-tuned in May 2026, limits kept |
| civil                    | `rent_agreement`                      | Rent Agreement / Lease Deed                                                            | 12  | 15      | 18  | No          | Hand-tuned in May 2026, limits kept |
| civil_interlocutory      | `amendment_of_pleadings`              | Amendment of Pleadings Application (Order 6 R.17 CPC)                                  | 6   | 10      | 18  | Yes         |                                     |
| civil_interlocutory      | `condonation_of_delay`                | Condonation of Delay Application (S.5 Limitation Act)                                  | 6   | 10      | 18  | Yes         |                                     |
| civil_interlocutory      | `production_of_documents`             | Production of Documents Application (Order 11 CPC)                                     | 6   | 10      | 18  | Yes         |                                     |
| civil_interlocutory      | `receiver_appointment`                | Application for Receiver (Order 40 R.1 CPC)                                            | 6   | 10      | 18  | Yes         |                                     |
| civil_interlocutory      | `temporary_injunction_o39`            | Temporary Injunction Application (Order 39 R.1-2 CPC)                                  | 6   | 10      | 18  | Yes         |                                     |
| civil_pleading           | `plaint_declaration`                  | Plaint for Declaration (S.34 SRA)                                                      | 10  | 16      | 30  | Yes         |                                     |
| civil_pleading           | `plaint_eviction`                     | Plaint for Ejectment (TPA S.106/111)                                                   | 10  | 16      | 30  | Yes         |                                     |
| civil_pleading           | `plaint_injunction`                   | Plaint for Permanent Injunction (S.38 SRA)                                             | 10  | 16      | 30  | Yes         |                                     |
| civil_pleading           | `plaint_partition`                    | Plaint for Partition (CPC + Hindu Succession Act)                                      | 10  | 16      | 30  | Yes         |                                     |
| civil_pleading           | `plaint_recovery`                     | Plaint for Recovery of Money (Order VII CPC)                                           | 10  | 16      | 30  | Yes         |                                     |
| civil_pleading           | `plaint_specific_performance`         | Plaint for Specific Performance (S.10-14 SRA)                                          | 10  | 16      | 30  | Yes         |                                     |
| civil_pleading           | `replication`                         | Replication (Order VIII R.9 CPC)                                                       | 10  | 16      | 30  | Yes         |                                     |
| civil_pleading           | `written_statement`                   | Written Statement (Order VIII CPC)                                                     | 10  | 16      | 30  | Yes         |                                     |
| consumer                 | `consumer_complaint`                  | Consumer Complaint                                                                     | 8   | 10      | 12  | Yes         | Hand-tuned in May 2026, limits kept |
| corporate                | `aoa`                                 | Articles of Association                                                                | 12  | 18      | 35  | No          |                                     |
| corporate                | `distribution_agreement`              | Distribution / Dealership Agreement                                                    | 12  | 18      | 35  | No          |                                     |
| corporate                | `employment_agreement`                | Employment Agreement                                                                   | 12  | 18      | 35  | No          |                                     |
| corporate                | `founders_agreement`                  | Co-Founders Agreement                                                                  | 12  | 18      | 35  | No          |                                     |
| corporate                | `franchise_agreement`                 | Franchise Agreement                                                                    | 12  | 18      | 35  | No          |                                     |
| corporate                | `loan_agreement`                      | Loan Agreement                                                                         | 12  | 18      | 35  | No          |                                     |
| corporate                | `moa`                                 | Memorandum of Association                                                              | 12  | 18      | 35  | No          |                                     |
| corporate                | `nda`                                 | Non-Disclosure Agreement (NDA)                                                         | 12  | 18      | 35  | No          |                                     |
| corporate                | `service_agreement`                   | Service / Independent Contractor Agreement                                             | 12  | 18      | 35  | No          |                                     |
| corporate                | `shareholders_agreement`              | Shareholders Agreement (SHA)                                                           | 12  | 18      | 35  | No          |                                     |
| criminal                 | `bail_anticipatory`                   | Anticipatory Bail Application                                                          | 8   | 10      | 12  | Yes         | Hand-tuned in May 2026, limits kept |
| criminal                 | `bail_regular`                        | Regular Bail Application                                                               | 7   | 10      | 12  | Yes         | Hand-tuned in May 2026, limits kept |
| criminal                 | `legal_notice_s138`                   | Legal Notice under Section 138 NI Act (Cheque Bounce)                                  | 5   | 6       | 7   | No          | Hand-tuned in May 2026, limits kept |
| criminal_appellate       | `suspension_of_sentence`              | Application for Suspension of Sentence Pending Appeal                                  | 10  | 16      | 30  | Yes         |                                     |
| criminal_bail            | `bail_before_magistrate`              | Bail Application before Magistrate (BNSS 480)                                          | 8   | 12      | 20  | Yes         |                                     |
| criminal_bail            | `bail_cancellation`                   | Application for Cancellation of Bail                                                   | 8   | 12      | 20  | Yes         |                                     |
| criminal_bail            | `default_bail`                        | Default Bail Application under BNSS 187(3)                                             | 8   | 12      | 20  | Yes         |                                     |
| criminal_bail            | `interim_bail`                        | Interim Bail Application                                                               | 8   | 12      | 20  | Yes         |                                     |
| criminal_petition        | `criminal_appeal`                     | Criminal Appeal (S.415-419 BNSS)                                                       | 8   | 14      | 25  | Yes         |                                     |
| criminal_petition        | `criminal_revision`                   | Criminal Revision (S.438 BNSS / S.442 BNSS)                                            | 8   | 14      | 25  | Yes         |                                     |
| criminal_petition        | `discharge_application`               | Discharge Application (S.250 / S.262 / S.272 BNSS)                                     | 8   | 14      | 25  | Yes         |                                     |
| criminal_petition        | `fir_quashing`                        | FIR Quashing Petition (S.528 BNSS)                                                     | 8   | 14      | 25  | Yes         |                                     |
| criminal_petition        | `quashing_528_bnss`                   | Quashing Petition (S.528 BNSS)                                                         | 8   | 14      | 25  | Yes         |                                     |
| criminal_procedural      | `surrender_application`               | Application for Surrender before Magistrate                                            | 6   | 10      | 18  | Yes         |                                     |
| family                   | `divorce_hma`                         | Divorce Petition (HMA, contested)                                                      | 10  | 15      | 25  | Yes         |                                     |
| family                   | `divorce_mutual_consent`              | Mutual Consent Divorce (s.13B HMA / s.28 SMA)                                          | 10  | 15      | 25  | Yes         |                                     |
| family                   | `divorce_sma`                         | Divorce Petition (SMA, contested)                                                      | 10  | 15      | 25  | Yes         |                                     |
| family                   | `dv_act_complaint`                    | Domestic Violence Act Application (s.12 PWDV)                                          | 10  | 15      | 25  | Yes         |                                     |
| family                   | `guardianship_petition`               | Guardianship Petition (GWA 1890 / HMGA 1956)                                           | 10  | 15      | 25  | Yes         |                                     |
| family                   | `judicial_separation`                 | Judicial Separation Petition (s.10 HMA / s.23 SMA)                                     | 10  | 15      | 25  | Yes         |                                     |
| family                   | `maintenance_bnss_144`                | Maintenance Application (s.144 BNSS)                                                   | 10  | 15      | 25  | Yes         |                                     |
| family                   | `rcr_petition`                        | RCR Petition (s.9 HMA / s.22 SMA)                                                      | 10  | 15      | 25  | Yes         |                                     |
| non_court_legal_document | `affidavit_identity`                  | Affidavit of Identity / Name / One-and-Same Person                                     | 4   | 6       | 10  | No          |                                     |
| notice                   | `legal_notice_breach_of_contract`     | Legal Notice — Breach of Contract                                                      | 5   | 8       | 14  | No          |                                     |
| notice                   | `legal_notice_consumer_deficiency`    | Legal Notice — Consumer Deficiency (Pre-Complaint under CPA 2019)                      | 5   | 8       | 14  | No          |                                     |
| notice                   | `legal_notice_copyright_infringement` | Legal Notice — Copyright Infringement (Cease & Desist + Takedown)                      | 5   | 8       | 14  | No          |                                     |
| notice                   | `legal_notice_defamation`             | Legal Notice — Defamation (Civil / Criminal BNS 356)                                   | 5   | 8       | 14  | No          |                                     |
| notice                   | `legal_notice_eviction`               | Legal Notice — Eviction / Quit Notice (State Rent Act / TPA S.106)                     | 5   | 8       | 14  | No          |                                     |
| notice                   | `legal_notice_trademark_infringement` | Legal Notice — Trademark Infringement / Passing Off (Cease & Desist)                   | 5   | 8       | 14  | No          |                                     |
| procedural               | `affidavit_in_support`                | Affidavit in Support of Petition / Application                                         | 4   | 6       | 12  | Yes         |                                     |
| procedural               | `counter_affidavit`                   | Counter-Affidavit / Reply Affidavit (Respondent)                                       | 4   | 6       | 12  | Yes         |                                     |
| procedural               | `list_of_dates`                       | List of Dates (Chronological Events Table)                                             | 4   | 6       | 12  | Yes         |                                     |
| procedural               | `memo_of_parties`                     | Memo of Parties                                                                        | 4   | 6       | 12  | Yes         |                                     |
| procedural               | `rejoinder_affidavit`                 | Rejoinder Affidavit (Petitioner's Reply to Counter)                                    | 4   | 6       | 12  | Yes         |                                     |
| procedural               | `restoration_application`             | Application for Restoration of Suit (Order 9 Rule 9 CPC)                               | 4   | 6       | 12  | Yes         |                                     |
| procedural               | `synopsis`                            | Synopsis (HC / SC Practice — 1-Page Petition Overview)                                 | 4   | 6       | 12  | Yes         |                                     |
| procedural               | `vakalatnama`                         | Vakalatnama                                                                            | 4   | 6       | 12  | Yes         |                                     |
| transactional_deed       | `gift_deed`                           | Gift Deed                                                                              | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `gpa`                                 | General Power of Attorney (GPA)                                                        | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `joint_development_agreement`         | Joint Development Agreement (JDA)                                                      | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `lease_deed`                          | Lease Deed (Registered)                                                                | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `license_agreement`                   | License Agreement                                                                      | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `mortgage_deed`                       | Mortgage Deed                                                                          | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `mou`                                 | Memorandum of Understanding                                                            | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `partition_deed`                      | Partition Deed                                                                         | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `release_deed`                        | Release Deed (Relinquishment)                                                          | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `sale_deed`                           | Sale Deed (Immovable Property)                                                         | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `spa`                                 | Special Power of Attorney (SPA)                                                        | 10  | 15      | 30  | No          |                                     |
| transactional_deed       | `will`                                | Last Will and Testament                                                                | 10  | 15      | 30  | No          |                                     |
| tribunal                 | `cat_oa`                              | CAT Original Application (S.19 ATA 1985)                                               | 8   | 14      | 25  | Yes         |                                     |
| tribunal                 | `ibc_application`                     | IBC Application (S.7/9/10) — NCLT                                                      | 8   | 14      | 25  | Yes         |                                     |
| tribunal                 | `itat_appeal`                         | ITAT Appeal (S.253 IT Act)                                                             | 8   | 14      | 25  | Yes         |                                     |
| tribunal                 | `mact_claim`                          | MACT Claim Petition (S.166 MV Act)                                                     | 8   | 14      | 25  | Yes         |                                     |
| tribunal                 | `posh_complaint`                      | POSH Complaint (SH Act 2013)                                                           | 8   | 14      | 25  | Yes         |                                     |
| tribunal                 | `rera_complaint`                      | RERA Complaint (S.31 RERA)                                                             | 8   | 14      | 25  | Yes         |                                     |
| writ                     | `certiorari`                          | Writ Petition — Certiorari (Article 226/32)                                            | 10  | 16      | 30  | Yes         |                                     |
| writ                     | `curative_petition`                   | Curative Petition before the Supreme Court (Article 137 + Order XLVIII SC Rules, 2013) | 10  | 16      | 30  | Yes         |                                     |
| writ                     | `habeas_corpus`                       | Habeas Corpus Petition                                                                 | 10  | 16      | 30  | Yes         |                                     |
| writ                     | `interim_application`                 | Interim Application (IA) for Interim Relief During Pendency                            | 10  | 16      | 30  | Yes         |                                     |
| writ                     | `mandamus`                            | Writ Petition for Mandamus (Art. 226/32)                                               | 10  | 16      | 30  | Yes         |                                     |
| writ                     | `pil`                                 | Public Interest Litigation (PIL)                                                       | 10  | 16      | 30  | Yes         |                                     |
| writ                     | `quo_warranto`                        | Writ Petition — Quo Warranto (Article 226/32)                                          | 10  | 16      | 30  | Yes         |                                     |
| writ                     | `review_petition`                     | Review Petition                                                                        | 10  | 16      | 30  | Yes         |                                     |
| writ                     | `slp`                                 | Special Leave Petition (SLP)                                                           | 10  | 16      | 30  | Yes         |                                     |
| writ                     | `writ_petition_civil`                 | Writ Petition (Civil) — WP(C)                                                          | 10  | 16      | 30  | Yes         |                                     |
| writ                     | `writ_petition_criminal`              | Writ Petition (Criminal) — WP(CRL)                                                     | 10  | 16      | 30  | Yes         |                                     |

### 6. What this means for pricing

- **Most drafts will be short.** The hand-tuned templates top out at 7 to 18 paragraphs. At 50 drops + 2 per paragraph, a 12-paragraph bail application is 74 drops and an 18-clause rent agreement is 86 drops.
- The pricing examples at 25 and 50 paragraphs will be rare. Only writs, civil pleadings, appeals, deeds and corporate documents reach 30 or more.
- Vikram should use these ranges, not 10, 25 and 50, when he checks the formula in T-004.

### 7. Two things for Arjun

- **The legal-content list is incomplete.** The drafting system prompt is built in `template-engine.service.ts` (`buildAISystemPrompt`, `buildAIUserPrompt`), and prompts are also assembled in `prompt-assembler.ts` and `template-promoter.ts`. None of the three is in `.claude/docs/legal-content-paths.md`, so a change to them would not ask for my sign-off. They should be added.
- If these limits are stored in the template config, that is legal content and needs my sign-off on the change.

### Sign-off

Ajay, 4 Oct 2026: the paragraph definition, the rule that a target length may be given to the model, and the minimums for the six hand-tuned templates are signed. The limits for the other 86 are proposed and are signed once T-004 data has been compared with them.
