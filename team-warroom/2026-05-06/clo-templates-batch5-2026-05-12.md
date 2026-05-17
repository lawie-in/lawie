# CLO Templates Batch 5 — Civil Interlocutory + Criminal Petitions

**Owner:** Ajay (CLO) | **Date:** 2026-05-12 | **Status:** Approved

## Scope

10 templates filed in `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/`.

| #   | File                            | Category            | Credits | Forum                        | Lines | JSON  |
| --- | ------------------------------- | ------------------- | ------- | ---------------------------- | ----- | ----- |
| 1   | `temporary_injunction_o39.json` | civil_interlocutory | 1       | Any civil court / commercial | 156   | valid |
| 2   | `receiver_appointment.json`     | civil_interlocutory | 1       | Senior civil judge / DJ / HC | 165   | valid |
| 3   | `condonation_of_delay.json`     | civil_interlocutory | 1       | Any court / tribunal         | 163   | valid |
| 4   | `amendment_of_pleadings.json`   | civil_interlocutory | 1       | Any civil court / commercial | 173   | valid |
| 5   | `production_of_documents.json`  | civil_interlocutory | 1       | Any civil court / commercial | 173   | valid |
| 6   | `quashing_528_bnss.json`        | criminal_petition   | 2       | HC only                      | 189   | valid |
| 7   | `discharge_application.json`    | criminal_petition   | 2       | Sessions / Magistrate        | 184   | valid |
| 8   | `criminal_revision.json`        | criminal_petition   | 2       | HC / Sessions                | 179   | valid |
| 9   | `criminal_appeal.json`          | criminal_petition   | 2       | HC / Sessions                | 207   | valid |
| 10  | `fir_quashing.json`             | criminal_petition   | 2       | HC only                      | 216   | valid |

All files validated with `python3 -c "import json; json.load(...)"` — no syntax errors.

## Schema Compliance

Each file carries: `_meta`, `template_id`, `title`, `displayName`, `category`, `creditsCost`, `court_levels`, `form_schema`, `mandatory_clauses`, `prompt_context.promptInstructions`, `relevantActs`, `filing_checklist`, `validation_rules`, `key_citations`, `disclaimer`. Mirrors Batch 4 plaint schema.

## Legal Correctness — Highlights

### Civil Interlocutory

- **Temporary injunction (O.39):** Tripod test (prima facie / balance of convenience / irreparable injury) embedded as mandatory clauses. Dalpat Kumar + M. Gurudas cited. O.39 R.3 proviso for ex parte (reasons recorded; 30-day disposal under R.3A). Commercial Courts Act S.12A pre-institution mediation flagged.
- **Receiver (O.40):** "Just and convenient" standard; T. Krishnaswamy Chetty 5 principles. Cautioned as last resort (Maharwal Khewaji Trust). O.40 R.3 security + R.2 remuneration mandatory.
- **Condonation (S.5 Limitation):** Mst. Katiji liberal approach; Esha Bhattacharjee 15 principles; Basawaraj due diligence. Day-by-day explanation mandatory beyond 30 days. NOT applicable to suits (only appeals/applications) — explicitly flagged. Time-bar validation rule.
- **Amendment (O.6 R.17):** Proviso post-trial due diligence (Salem Advocate Bar Assn). Revajeetu 6-factor test. Withdrawal of admissions ordinarily not permitted (Heeralal). Limitation/relation-back flagged.
- **Production (O.11):** R.12 discovery / R.14 production / R.15 inspection / R.21 adverse inference. BSA privileges referenced (S.139 replaces S.126 IEA; S.134 replaces S.123). Bankers' Books Evidence Act S.4 for bank documents. Commercial Courts Order XI noted.

### Criminal Petitions

- **Quashing (S.528 BNSS):** Bhajan Lal 7 categories cited; Madhu Limaye, R.P. Kapur, Gian Singh, Parbatbhai Aahir, Neeharika Infra all included. HC-only court level enforced.
- **Discharge:** Section mapping rigorous — S.250 BNSS (Sessions, was S.227 CrPC); S.262 BNSS (warrant case before Magistrate, was S.239); S.272 BNSS (summons case, was S.245). Prafulla Kumar Samal sift-and-weigh; not a mini-trial. Debendra Nath Padhi (chargesheet material only) + Nitya Dharmananda refinement.
- **Revision (S.438 / S.442 BNSS):** Supervisory not appellate — flagged. S.438(2) interlocutory bar (Madhu Limaye / Amar Nath / Rajendra Kumar Sitaram Pande). S.438(3) bar on second revision (Krishnan v. Krishnaveni). Time-bar 90 days (Art. 131 Limitation Act).
- **Criminal appeal (S.415-S.419 BNSS):** Forum mapping: S.415 Sessions to HC; S.416 State acquittal appeal; S.418 Magistrate to Sessions; S.419 complainant with leave. Chandrappa 5 principles for acquittal interference. Sentence: Bachan Singh + Machhi Singh + Soman. S.430 BNSS suspension as separate application. Time-bar validation rule (30/60/90 days).
- **FIR quashing:** Bhajan Lal 7 categories quoted **verbatim** in `promptInstructions` (mandatory per spec). Preeti Gupta / Geeta Mehrotra / Kahkashan Kausar on matrimonial omnibus implication. Neeharika Infra on investigation stay (rarest cases). T.T. Antony second FIR bar. Indian Oil v. NEPC + G. Sagar Suri on civil-criminal colour.

## Sanhita Compliance

- All criminal templates use BNS / BNSS / BSA section numbers.
- Validation rules warn if IPC sections detected in `offences_alleged` / `offences_charged` / `offences_convicted`.
- BSA privilege references (S.132, S.134, S.136, S.137, S.139) used in production-of-documents — not Evidence Act 1872 numbers.
- Pre-1 July 2024 FIR transition noted in quashing prompts.

## Risks / Open Items

- **Risk:** S.272 BNSS for summons case discharge — provision is not a direct one-to-one with CrPC S.245 (which is warrant case on complaint). Advocates should verify forum-specific procedure with state BNSS rules. Flagged in `promptInstructions`.
- **Risk:** Some recent SC citations under S.528 BNSS will accumulate post-2024; advocate to update key_citations as case-law develops. Noted in `criminal_revision.json` and `quashing_528_bnss.json` prompts.
- **Acceptable:** Court fee references kept state-Schedule-agnostic; state-specific values to be added in Madhuri/Vishal's state-config pass.
- **Acceptable:** Suspension of sentence (S.430 BNSS) is filed as a SEPARATE application — flagged in criminal_appeal prayer template and checklist; standalone template may follow in Batch 6 or later.

## Status

**Approved** — Ready for B6.

## Files

- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/temporary_injunction_o39.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/receiver_appointment.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/condonation_of_delay.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/amendment_of_pleadings.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/production_of_documents.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/quashing_528_bnss.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/discharge_application.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/criminal_revision.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/criminal_appeal.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/fir_quashing.json`

Ready for next task.
