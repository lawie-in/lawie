# CLO Templates Batch 3 — Family Law Audit

**Owner:** Ajay (CLO) | **Date:** 2026-05-12 | **Folder:** `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/`

## Files Delivered (8)

| #   | Template ID            | File                        | Credits | Court Level             | Lines | JSON  |
| --- | ---------------------- | --------------------------- | ------- | ----------------------- | ----- | ----- |
| 1   | divorce_hma            | divorce_hma.json            | 2       | Family Court / District | 156   | Valid |
| 2   | divorce_mutual_consent | divorce_mutual_consent.json | 1       | Family Court / District | 134   | Valid |
| 3   | divorce_sma            | divorce_sma.json            | 2       | Family Court / District | 143   | Valid |
| 4   | rcr_petition           | rcr_petition.json           | 2       | Family Court / District | 122   | Valid |
| 5   | judicial_separation    | judicial_separation.json    | 2       | Family Court / District | 133   | Valid |
| 6   | maintenance_bnss_144   | maintenance_bnss_144.json   | 1       | Magistrate (CJM/JMFC)   | 145   | Valid |
| 7   | dv_act_complaint       | dv_act_complaint.json       | 2       | Magistrate (JMFC/CMM)   | 173   | Valid |
| 8   | guardianship_petition  | guardianship_petition.json  | 2       | Family Court / District | 166   | Valid |

All 8 files passed `json.load` validation. Total ≈1,172 lines of structured legal config.

## Schema Conformance

Each JSON includes the required keys: `_meta` (owner=Ajay CLO), `template_id`, `title`, `category=family`, `creditsCost`, `court_levels`, `form_schema`, `mandatory_clauses` (alias `mandatoryClauses` retained where helpful), `prompt_context`, `relevantActs`, `filing_checklist`, `validation_rules`. Each carries `prayerTemplate`, `verificationTemplate`, `key_citations`, and the standard Lawie disclaimer.

## Legal Correctness Highlights

### 1. divorce_hma

- All S.13 HMA grounds enumerated as multiselect options (cruelty, desertion, adultery, conversion, mental disorder, communicable disease, renunciation, presumption of death, plus S.13(2) wife-specific grounds).
- S.19 HMA jurisdiction options exposed.
- Citations: Naveen Kohli v. Neelu Kohli (2006) 4 SCC 558; Samar Ghosh v. Jaya Ghosh (2007) 4 SCC 511; Bipin Chandra v. Prabhavati AIR 1957 SC 176; Dastane v. Dastane (1975) 2 SCC 326.
- S.23(1) bars (collusion, condonation, delay, own wrong) pleaded as mandatory clauses.
- Validation: 1-year bar from marriage (S.14 HMA); 2-year desertion ground checked against separation_date.

### 2. divorce_mutual_consent

- 2-motion procedure documented in prompt instructions: first motion → 6 months min / 18 months max → second motion → decree.
- Amardeep Singh v. Harveen Kaur (2017) 8 SCC 746 cited as basis for waiver of cooling-off; waiver fields conditionally surfaced.
- Joint-petitioner schema (`petitioner1` / `petitioner2`) — both verify.
- Validation enforces 1-year separation (S.13B(1) HMA / S.28(1) SMA).
- Sureshta Devi v. Om Prakash and Smruti Pahariya cited — consent must subsist till second motion.

### 3. divorce_sma

- S.27 SMA grounds enumerated separately from HMA — secular framework preserved.
- 3-year residence rule (S.31 SMA) surfaced as conditional field when jurisdiction relies on petitioner residence.
- SMA marriage certificate number/date are mandatory form fields.
- S.34(1) bars analogous to HMA S.23(1) pleaded.

### 4. rcr_petition

- S.9 HMA / S.22 SMA — single template, governing_act selector.
- Explicit pleading of NO reasonable excuse for respondent's withdrawal (Explanation to S.9 places burden on withdrawing spouse, but petitioner must still plead).
- Saroj Rani v. Sudarshan Kumar (1984) 4 SCC 90 cited (constitutionality upheld).
- Prompt instructs advocate-level note that non-compliance with RCR decree → S.13(1A)(ii) HMA divorce ground after 1 year.

### 5. judicial_separation

- S.10 HMA — same grounds as S.13 (cross-reference made explicit).
- Note: marriage SUBSISTS post-decree; re-marriage = bigamy. Captured in prompt.
- S.13(1A)(i) HMA — 1-year non-resumption post-judicial separation → divorce ground.
- Hirachand Srinivas Managaonkar v. Sunanda (2001) 4 SCC 125 cited for own-wrong disqualification.

### 6. maintenance_bnss_144

- **Section number is 144 BNSS** — explicit prompt warning never to use S.125 CrPC (legacy).
- Categories of claimant exposed: wife / divorced wife not remarried / minor legitimate / minor illegitimate / major disabled / unable father / unable mother.
- S.144(4) BNSS bars surfaced (wife in adultery, refusal to live with husband without reason, mutual consent separation) as conditional mandatory clause for wife claimants.
- Rajnesh v. Neha (2020) SCC OnLine SC 903 — uniform framework + affidavit of assets and liabilities embedded in filing checklist.
- Court level = Magistrate. Family Court concurrent jurisdiction noted.
- Interim maintenance (proviso to S.144(1)) handled with conditional field.

### 7. dv_act_complaint

- Three statutory ingredients enforced as separate mandatory clauses: aggrieved person (S.2(a)), domestic relationship (S.2(f)), shared household (S.2(s)).
- Hiral P. Harsora v. Kusum Narottamdas Harsora (2016) 10 SCC 165 captured — S.2(q) "adult male" struck down; female respondents permissible.
- Satish Chander Ahuja v. Sneha Ahuja (2021) 1 SCC 414 captured — overrules S.R. Batra v. Taruna Batra on shared household; ownership by respondent not a prerequisite.
- Indra Sarma v. V.K.V. Sarma; D. Velusamy v. D. Patchaiammal cited for live-in eligibility tests.
- Multi-relief schema: separate boolean flags for S.18 / S.19 / S.20 / S.21 / S.22 reliefs, each with its own specifics field; validation requires at least one relief selected.
- S.27 jurisdiction options; S.23(2) ex-parte interim flag.
- Rajnesh v. Neha cross-applied for S.20 monetary relief quantum.

### 8. guardianship_petition

- Dual statute support: GWA 1890 (secular) and HMGA 1956 (Hindu) — governing_act selector with `both_concurrent` option.
- **Welfare of minor doctrine** elevated to a mandatory clause and emphasised at the top of prompt instructions (Gaurav Nagpal v. Sumedha Nagpal; Nil Ratan Kundu v. Abhijit Kundu).
- Githa Hariharan v. RBI (1999) 2 SCC 228 captured — mother as natural guardian during father's lifetime when he is absent/incapable.
- S.9 GWA jurisdictional anchor — "ordinarily resides" — surfaced as mandatory field. Ruchi Majoo v. Sanjeev Majoo cited for inter-country guidance.
- S.17 GWA factors (capacity, character, kinship, religious affinity, age, sex, minor's preference) baked into petitioner_suitability field and prompt instructions.
- Roxann Sharma v. Arun Sharma — under-5 custody preference for mother (S.6(a) proviso HMGA) — referenced.
- Type of guardianship: person / property / both — discrete selection.
- S.19 GWA restriction (no appointment where father living and fit) flagged in prompt.

## Cross-Cutting Compliance

- **BNS/BNSS/BSA stack:** Maintenance template uses S.144 BNSS — not S.125 CrPC. No legacy CrPC/IPC references in any template. PWDV procedural backstop noted as CrPC/BNSS via S.28 PWDV.
- **Advocate disclaimer:** Every template carries the standard line — "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing." — both inside `prompt_context.promptInstructions` and as a `disclaimer` field.
- **Filing checklists** include the Lawie disclaimer slip line item.
- **State-specific court fee** flagged in filing checklist for divorce_hma and guardianship_petition (Bihar / Jharkhand / UP / Delhi differ).
- **Bar Council enrollment number** validation reference present in all 8 templates.

## Risk / Watch Items

| Item                                                         | Status     | Note                                                                                                                                   |
| ------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Court fee schedule variance across states                    | Risk       | Templates flag in checklist but do not auto-compute. Recommend Vishal expose a `state_court_fee_table` config in next sprint.          |
| 1-year marriage bar (S.14 HMA) — exceptional hardship leave  | Risk       | Currently a `validation_rules` line but no UI hint for the exceptional hardship application. Acceptable for B1 launch; flag for Priya. |
| PWDV monetary relief quantum vs Rajnesh affidavit            | Acceptable | Filing checklist requires the affidavit; quantum left to advocate.                                                                     |
| Live-in relationship inclusion in DV template                | Approved   | Indra Sarma / D. Velusamy tests cited; advocate must plead facts; template does not gatekeep.                                          |
| Foreign-domicile cases (NRI divorce / inter-country custody) | Risk       | Not in scope of B3. Recommend separate template family for B5+.                                                                        |
| Anti-advertising (BCI Rule 36)                               | Approved   | Templates are professional output tools; no consumer-facing language.                                                                  |

## Deliverable Status

**B3 complete. 8 family-law templates filed. All JSON valid. Ready for B4.**

Filed at:

- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/divorce_hma.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/divorce_mutual_consent.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/divorce_sma.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/rcr_petition.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/judicial_separation.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/maintenance_bnss_144.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/dv_act_complaint.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/guardianship_petition.json`
