# CLO Templates — Batch 1 Audit (2026-05-12)

Owner: Ajay (CLO)
Folder: `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/`
Schema mirror: `bail_anticipatory.json` (most complete reference)

10 templates filed in this batch. All Sanhita-compliant (BNS / BNSS / BSA — no IPC / CrPC / IEA throughout).

---

## 1. interim_bail.json

- Category: criminal_bail | Credits: 2
- Court levels: sessions, high_court, district, cjm, magistrate
- Form fields: 17
- Mandatory clauses: 8 (urgency, main_application_reference, duration_sought, undertakings, no_flight_risk, prayer, verification, advocate)
- BNSS sections cited: 480, 483, 528 (inherent powers)
- Key precedent: Lal Kamlendra Pratap Singh v. State of U.P. (2009) 4 SCC 437
- Validation rules: 3 (duration ≤ 30 days; urgency_details non-empty; main bail ref required)

## 2. bail_cancellation.json

- Category: criminal_bail | Credits: 2
- Court levels: sessions, high_court, district, cjm
- Form fields: 18 (including `party_role` flag — State / Informant / Accused)
- Mandatory clauses: 7
- BNSS sections cited: 480, 483, 483(3)
- Key precedents: Dolat Ram v. State of Haryana (1995) 1 SCC 349; Bhagirathsinh v. State of Gujarat (1984) 1 SCC 284
- Validation rules: 4 (party_role required; grounds non-empty; if accused → variation not cancellation)

## 3. default_bail.json

- Category: criminal_bail | Credits: 2
- Court levels: magistrate, cjm, sessions, district
- Form fields: 19 (offence_punishment_max_years drives day-count window)
- Mandatory clauses: 8 (BNSS 187(3) statutory invocation is load-bearing)
- BNSS sections cited: **187(3)** (primary), 187, 480
- Key precedents: Uday Mohanlal Acharya v. State of Maharashtra (2001) 5 SCC 453; Bikramjit Singh v. State of Punjab (2020) 10 SCC 616; Rakesh Kumar Paul v. State of Assam (2017) 15 SCC 67
- Validation rules: 6 — **hard-coded BNSS 187(3) windows**: `elapsed_days >= 60 || (elapsed_days >= 90 && offence_punishment_max_years >= 10)`
- Special flag: UAPA / NDPS / PMLA windows differ — prompt instructs to surface this

## 4. surrender_application.json

- Category: criminal_procedural | Credits: 2
- Court levels: magistrate, cjm, district
- Form fields: 16
- Mandatory clauses: 6
- BNSS sections cited: 478, 479, 480
- Key precedent: Niranjan Singh v. Prabhakar (1980) 2 SCC 559 (surrender = custody for bail purposes)
- Validation rules: 4 — **prayer must NOT contain protection-from-arrest language** (that's anticipatory bail)
- CLO note: surrender ≠ anticipatory bail — prompt expressly distinguishes

## 5. suspension_of_sentence.json

- Category: criminal_appellate | Credits: 2
- Court levels: sessions, high_court, district
- Form fields: 17
- Mandatory clauses: 8
- BNSS sections cited: **430** (primary), 431, 415
- Key precedents: Atul Tripathi v. State of U.P. (2014) 9 SCC 177; Kashmira Singh v. State of Punjab (1977) 4 SCC 291 (long-pending appeal)
- Validation rules: 4 — application not maintainable without filed appeal

## 6. bail_before_magistrate.json

- Category: criminal_bail | Credits: 2
- Court levels: magistrate, cjm (intentionally narrow)
- Form fields: 20
- Mandatory clauses: 8
- BNSS sections cited: 478, **480** (primary — distinguished from BNSS 483 Sessions/HC bail), 481, 482
- Key precedents: Sushila Aggarwal v. State (NCT of Delhi) (2020) 5 SCC 1; P. Chidambaram v. Directorate of Enforcement (2019) 9 SCC 24 (triple test)
- Validation rules: 5 — flags if offence carries death/life and applicant outside special category (recommend BNSS 483 instead)

## 7. vakalatnama.json

- Category: procedural | Credits: 1
- Court levels: all (magistrate → Supreme Court)
- Form fields: 19 (includes `variant` selector)
- Variants: 4 — criminal_district, civil_district, high_court, supreme_court (each with distinct scope language in `scopeLanguage` map)
- Mandatory clauses: 7
- Acts cited: Advocates Act 1961 s.30; BCI Rules Rule 39 (engagement) + Rule 36 (no advertising); BNSS s.340
- Court-fee schedule encoded in form help text: Bihar/Jharkhand ₹2-₹10, UP ₹5-₹10, Delhi ₹10, HC ₹10-₹25, SC ₹25
- Validation rules: 5 (variant required; enrolment format; court fee > 0; client_role aligned to variant)

## 8. affidavit_in_support.json

- Category: procedural | Credits: 1
- Court levels: all
- Form fields: 16
- Mandatory clauses: 9 (with **source-classification** clause — knowledge / information & belief / records)
- Acts cited: CPC Order XIX (esp. Rule 3); Notaries Act 1952 s.8; BSA 2023 (oaths schedule)
- Key precedent: A.K.K. Nambiar v. UoI (1969) 3 SCC 864 (don't mix sources within a paragraph)
- Validation rules: 5 — `para_knowledge_basis` mandatory; information-paragraphs must disclose source

## 9. affidavit_identity.json

- Category: non_court_legal_document | Credits: 1
- Court levels: notary_only (no court filing — non-court document)
- Form fields: 14
- Purposes covered: 7 (same person / KYC / name correction / PAN-Aadhaar match / change of name / address / other)
- Mandatory clauses: 8 (incl. name-reconciliation block when alternate_names present)
- Acts cited: Notaries Act 1952 s.8; **BNS 229 / BNS 230** (false evidence — replacing IPC 191/193 and 192/194); Indian Stamp Act 1899
- Validation rules: 5

## 10. memo_of_parties.json

- Category: procedural | Credits: 1
- Court levels: high_court, supreme_court, district
- Form fields: 13
- Mandatory clauses: 6
- State-specific HC nomenclature encoded in prompt: Patna (CWJC / Cr. Misc.); Jharkhand (W.P.(Cr) / B.A.); Delhi (W.P.(Crl.)); Allahabad (Cr. Misc.)
- Acts cited: BNSS s.528 (inherent powers); Constitution Art. 226, 227; state HC Rules referenced
- Validation rules: 5

---

## Sanhita compliance — confirmed across all 10

- No IPC references anywhere
- No CrPC references anywhere (one passing parenthetical noting "successor to CrPC 167(2) / 437 / 389" in `prompt_context` only — for advocate orientation; explicit instruction in `promptInstructions` to cite BNSS in output)
- No Indian Evidence Act references — BSA cited where relevant
- BNS sections 229/230 substituted for false-evidence references in affidavit templates

## BCI Rule 36 compliance

- Vakalatnama and Memo of Parties prompts expressly instruct: no advertising language about advocate qualifications beyond enrolment number
- Templates do not contain or generate solicitation copy

## State-aware notes

- All templates accept `state` field with Bihar / Jharkhand / UP / Delhi options
- Memo of Parties — HC nomenclature encoded per state
- Vakalatnama — court fee schedule encoded per state
- Affidavit of Identity — stamp paper value parameterised by state

## Status

- All 10 files written
- All JSON files are self-contained, do not depend on cross-imports
- Schema mirrors `bail_anticipatory.json` (the reference) — `_meta`, `template_id`, `title`, `category`, `creditsCost`, `court_levels`, `form_schema`, `mandatory_clauses`, `prompt_context`, `relevantActs`, `filing_checklist`, `validation_rules` all present
- Each file 200-300 lines as specified

**Marking: Approved.**

Ready for Batch 2.
