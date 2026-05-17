# CLO Batch 7 Audit — Writ + Tribunal Templates

**Owner:** Ajay (CLO)
**Date:** 2026-05-12
**Scope:** 12 templates filed in `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/`

---

## Files filed

| #   | File                        | Lines | JSON valid | Status   |
| --- | --------------------------- | ----: | :--------: | -------- |
| 1   | writ_petition_civil.json    |   138 |    Yes     | Approved |
| 2   | writ_petition_criminal.json |   175 |    Yes     | Approved |
| 3   | habeas_corpus.json          |   179 |    Yes     | Approved |
| 4   | pil.json                    |   152 |    Yes     | Approved |
| 5   | slp.json                    |   167 |    Yes     | Approved |
| 6   | review_petition.json        |   180 |    Yes     | Approved |
| 7   | mact_claim.json             |   196 |    Yes     | Approved |
| 8   | rera_complaint.json         |   181 |    Yes     | Approved |
| 9   | posh_complaint.json         |   227 |    Yes     | Approved |
| 10  | ibc_application.json        |   199 |    Yes     | Approved |
| 11  | itat_appeal.json            |   191 |    Yes     | Approved |
| 12  | cat_oa.json                 |   219 |    Yes     | Approved |

All 12 JSON files parse cleanly through `python3 -m json.tool` / `json.load`.

---

## Legal correctness audit — per template

### 1. writ_petition_civil

- Article 226 invoked; cause-title three-tier "In the matter of" pattern.
- Whirlpool exceptions to alternative-remedy bar codified in `alternative_remedy_exhausted` field and `alternative_remedy_paragraph`.
- Maneka Gandhi, Bandhua Mukti Morcha, Olga Tellis, Tilokchand Motichand cited.
- Service-matter judicial-review scope per B.C. Chaturvedi.
- Validator: requires `writ_type` selection (mandamus/certiorari/prohibition/quo warranto/habeas).
- **Status:** Approved.

### 2. writ_petition_criminal

- WP(CRL) jurisdictional basis Article 226 read with Article 21; cause-title separates this from S.528 BNSS quashing — explicit `distinction_from_528_paragraph` clause.
- D.K. Basu (custodial torture), Nilabati Behera (compensation as constitutional remedy), Lalita Kumari (mandatory FIR), Arnesh Kumar / Joginder Kumar (arrest safeguards), PUCL (encounter), Vineet Narain / Committee for Protection of Democratic Rights (CBI transfer) cited.
- BNSS provisions S.35, S.173, S.173(4), S.175(3), S.528 used (no CrPC references in operative text).
- **Status:** Approved.

### 3. habeas_corpus

- HC + SC concurrent (`court_levels` lists both). Cause-title accommodates 226/32.
- "Great writ of liberty" — Sunil Batra cited. Locus relaxed (Sheela Barse, Mohd Ikram Hussain, Gohar Begum).
- Preventive detention branch (A.K. Roy, Rekha v. TN, Lakshman Khatik, Hadibandhu Das) covered for NSA / state preventive detention statutes.
- Private confinement (adult woman: Lata Singh; child custody: Tejaswini Gaud) explicitly addressed.
- BNSS S.58 (24-hour rule, was S.57 CrPC) and S.97 (search warrant for unlawfully confined) cited correctly.
- Urgency flag built into mandatory clauses for 24-48 hr listing.
- **Status:** Approved.

### 4. pil

- S.P. Gupta, Hussainara Khatoon, PUDR, Bandhua Mukti Morcha (locus liberalised) cited.
- Balwant Singh Chaufal mandatory disclosures hard-coded as fields: petitioner credentials, source of funds, no personal interest, non-frivolity declarations.
- BALCO Employees Union (frivolous PIL cost) + Holicow + Ashok Kumar Pandey (publicity-interest deterrence) cited.
- Environmental PIL (Vellore, MC Mehta Kamal Nath public-trust doctrine) and prison/criminal-justice PIL (Hussainara, Sunil Batra, Khatri) branches both covered.
- Continuing mandamus (Vineet Narain) included as relief option.
- Validator forces both declarations to be true before draft generation.
- **Status:** Approved.

### 5. slp

- Article 136 — Pritam Singh, Mathai, Chunilal V. Mehta, Kunhayammed (merger doctrine), N. Suriyakala cited.
- Limitation tied to Article 133 Limitation Act (90 days; 60 days from review dismissal) with delay-condonation field.
- AOR mandatory enforced as `advocate_on_record` + `aor_code` validation; AOR certificate clause added.
- SC Rules 2013 Order XX, XXI, XXII referenced; paperbook structure noted in filing checklist.
- Criminal SLP grounds (Hari Singh, Dalbir Kaur, Arunachalam) flagged.
- **Status:** Approved.

### 6. review_petition

- Court-levels span SC, HC (writ/civil/criminal), district civil — `review_court_jurisdiction` enum drives prompt branching.
- **Critical correctness:** Bar on criminal HC review under S.413 BNSS (was S.362 CrPC) flagged explicitly — validator warns advocate that substantive criminal review is BARRED; SLP is the proper route. Only clerical/arithmetical correction permitted.
- Northern Railway, Kamlesh Verma, Lily Thomas, Parsion Devi, Smt Meera Bhanja, Aribam Tuleshwar Sharma — review-vs-rehearing distinction enforced via `what_is_NOT_being_argued` field.
- Merger doctrine (Kunhayammed) addressed; curative-petition (Rupa Ashok Hurra) flagged as alternative after SC review dismissal.
- Death-penalty review oral-hearing rule (Mohd Arif) noted.
- Limitation Article 124 / S.5 condonation.
- **Status:** Approved.

### 7. mact_claim

- S.166 MV Act 1988; jurisdiction per S.166(2) triple options encoded.
- **Multiplier method per Sarla Verma + Pranay Sethi** — full multiplier table inserted into prompt, future-prospects percentages (50/30/15 for permanent salaried; 40/25/10 self-employed; 30/20/10 fixed salary), personal-expense deductions, conventional heads (loss of estate ₹15k, consortium ₹40k/spouse, funeral ₹15k, 10% triennial enhancement) — all per Pranay Sethi.
- Non-earning member / housewife (Lata Wadhwa, Arun Kumar Agrawal, Kirti v. Oriental Insurance) covered.
- Pay & Recover principle (Swaran Singh) covered.
- BNS sections used: S.281 (rash driving — was IPC 279), S.106 (death by negligence — was IPC 304A), S.125 (was IPC 336/337/338). Validator warns if IPC references detected.
- S.164 MV Amendment Act 2019 (no-fault ₹5L death / ₹2.5L grievous) referenced.
- **Status:** Approved.

### 8. rera_complaint

- S.31 RERA Act 2016 + ancillary sections S.11, S.12, S.13, S.14, S.18, S.19.
- **NOTE FOR `indian-courts.json` MAPPING:** State RERA authorities (Bihar RERA-Patna, Jharkhand RERA-Ranchi, UP RERA-Lucknow + Gautam Buddh Nagar bench, Delhi RERA-Delhi, MahaRERA-Mumbai, K-RERA-Bengaluru, etc.) need to be added to `indian-courts.json` — flagged in prompt instructions for Vishal/data team to address. Filing must be at RERA where project is located.
- Pioneer Urban, Newtech Promoters, Imperia Structures, Forum for People's Collective Efforts — concurrent-remedy doctrine cited.
- Interest rate (SBI MCLR + 2%) per state Rules referenced.
- Appeal route — Appellate Tribunal (S.43-44, 60 days), HC on QoL (S.58, 60 days).
- Penalty branch S.59-72 included.
- **Status:** Approved with action item to ops/data.

### 9. posh_complaint

- **Confidentiality (S.16) baked in:** caption "CONFIDENTIAL" on every page mandatory clause; validator requires `confidentiality_invoked` = true.
- ICC vs LC distinction encoded as `committee_type` enum (workplace ≥10 employees vs unorganised / <10 / against employer).
- S.2(n) categories + S.3(2) circumstances all enumerated in `nature_of_harassment` multi-select.
- Rule 6 (who can file when woman unable / deceased) enumerated in `filed_by_self_or_authorised` enum.
- Limitation S.9(1): 3 months + 3-month extension proviso encoded in validation.
- S.14 (malicious complaint — penalty only after inquiry) caution included in prompt.
- BNS S.74-79 + S.63 cross-references for criminal-track companion action.
- Vishaka heritage cited.
- **Status:** Approved.

### 10. ibc_application

- Three branches encoded as `section_invoked` enum: S.7 FC / S.9 OC / S.10 corporate applicant.
- **Threshold ₹1 crore** validator hard-codes `debt_amount >= 10000000`.
- S.9 branch enforces S.8 demand-notice precondition + 10-day waiting period + Mobilox pre-existing-dispute test.
- Innoventive Industries, Mobilox, Swiss Ribbons, Pioneer Urban (homebuyers), B.K. Educational Services (limitation Art. 137), Vidarbha Industries (NCLT discretion in admission), Bishal Jaiswal (S.18 acknowledgment), Macquarie Bank (strict S.8/S.9 compliance) cited.
- Form 1 (S.7) / Form 5 (S.9) / Form 6 (S.10) per CIRP Regulations referenced.
- IRP Form 2 written consent — checkbox required by validator.
- Moratorium S.14 effects spelled out.
- **Status:** Approved.

### 11. itat_appeal

- S.253 IT Act 1961; **Form 36** strict compliance enforced in mandatory clauses.
- Time-bar 60 days (S.253(3)); condonation (S.253(5)); validator auto-calculates `delay_days = appeal_filing_date - service_of_order_date - 60`.
- Court fee per S.253(6) graduated schedule documented.
- PAN format validation regex.
- Stay applications under Rule 35A + S.254(2A) + Pepsi Foods Constitution Bench (third-proviso struck down) cited.
- Rule 29 additional-evidence ITAT Rules referenced.
- Common-grounds laundry list seeded: S.68/69 additions, S.40(a)(ia), S.43B, S.92CA TP, S.147/148 reassessment + GKN Driveshafts + Ashish Agarwal, S.263 + Malabar Industrial, S.270A/271(1)(c) penalty.
- Cross-objection Form 36A referenced.
- Onward appeal under S.260A HC (120 days, SQOL) referenced.
- **Status:** Approved.

### 12. cat_oa

- S.19 ATA 1985; **Form 1** under CAT (Procedure) Rules 1987.
- Jurisdictional gating: validator requires Central Govt civilian employee category; excludes armed forces (AFT), SC/HC staff, Parliament Secretariat per S.2 exclusions.
- Bench (Rule 6) — posting / cause / residence — codified.
- S.20 departmental-remedy exhaustion enforced via `departmental_remedy_status` enum (6-month no-reply branch built in).
- S.21 limitation — 1 year from final order / 1 year after 6-month expiry on representation — flagged with condonation prayer.
- L. Chandra Kumar (HC writ post-CAT) noted — direct writ against original cause not maintainable.
- Branch reliefs covered: promotion (Bachan Singh), disciplinary (B.C. Chaturvedi, Roop Singh Negi), compulsory retirement (Baikuntha Nath Das), pension (D.S. Nakara), ACR (Dev Dutt), compassionate appointment (Umesh Nagpal), transfer (J.K. Bansal / Somesh Tiwari).
- S.P. Sampath Kumar constitutional history cited.
- **Status:** Approved.

---

## Cross-cutting compliance items

- **BNS/BNSS/BSA hygiene:** Where criminal provisions appear (writ_petition_criminal, habeas_corpus, mact_claim, fir_quashing cross-references, posh_complaint cross-references), BNS / BNSS sections used uniformly. No live IPC / CrPC references in operative text — only parenthetical "(was IPC ...)" for advocate familiarity. Validators on `mact_claim` and `writ_petition_criminal` warn against legacy section numbers.
- **Disclaimer:** Standard Lawie disclaimer present at end of every template.
- **BCI Rule 36 advertising rule:** Templates are professional-tool drafts, not promotional content; nothing in any of these 12 violates Rule 36.
- **DPDP Act:** posh_complaint and habeas_corpus carry sensitive personal data — confidentiality + minimal-retention guidance is in prompt instructions; DPDP-grade encryption posture sits at infra layer (not template layer).
- **Advocate-responsibility line:** "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing." in every file's `disclaimer` field.

---

## Risk / blocker / open items

| Severity        | Item                                                                                                                                                                                                  | Action                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Action item** | State RERA authorities not yet in `indian-courts.json`.                                                                                                                                               | Flag to Priya / data team — map 30+ State RERAs with addresses and bench mapping for `rera_complaint.json` to function in production. |
| **Risk**        | Per-state HC writ Rules (Allahabad / Patna / Jharkhand / Delhi) have differing paperbook + affidavit + court-fee specifics for writ filings. Template references "per HC rules" generically.          | Phase 2: state-specific writ overlays for the four launch states. Not blocking Phase 1.                                               |
| **Risk**        | MV Act S.166(3) limitation — pre-2019 had been deleted; 2019 Amendment reintroduced 6 months but notification-dependent across states. Template carries a 6-month assumption with condonation prayer. | Acceptable. Advocate-validated on review.                                                                                             |
| **Acceptable**  | CAT pre-deposit nuances: generally none, but cross-check service rules per case.                                                                                                                      | Advocate's responsibility per disclaimer.                                                                                             |
| **Acceptable**  | IBC pre-pack (Ch. III-A, 2021) for MSMEs not separately templated.                                                                                                                                    | Out-of-scope for B7; Phase 3 if user demand.                                                                                          |

---

## Schema conformance

Every JSON contains, in order:

1. `_meta` (description, owner=Ajay CLO, validated_by, last_updated=2026-05-12, change_protocol)
2. `template_id`, `docType`, `title`, `displayName`
3. `category` (writ for items 1-6; tribunal for items 7-12)
4. `creditsCost: 2` (all substantive)
5. `court_levels`
6. `causeTitle` (format + partyDesignations + caseNomenclature)
7. `form_schema.fields`
8. `mandatory_clauses`
9. `prayerTemplate`, `verificationTemplate`
10. `prompt_context.promptInstructions`
11. `relevantActs`
12. `filing_checklist`
13. `validation_rules`
14. `key_citations`
15. `disclaimer`

All conform.

---

## Files

- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/writ_petition_civil.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/writ_petition_criminal.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/habeas_corpus.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/pil.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/slp.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/review_petition.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/mact_claim.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/rera_complaint.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/posh_complaint.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/ibc_application.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/itat_appeal.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/cat_oa.json`

Ready for next task.
