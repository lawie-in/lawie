# CLO Templates Batch 2 — Audit

**Owner:** Ajay (CLO) · **Date:** 2026-05-12 · **Scope:** 6 pre-litigation notice templates

## Files filed

All in `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/`:

| #   | File                                       | Statutory basis                                                                                    | Status   |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------- |
| 1   | `legal_notice_defamation.json`             | BNS S.356 (criminal) + tort (civil) + Limitation Act Art. 75/76                                    | Approved |
| 2   | `legal_notice_breach_of_contract.json`     | ICA 1872 S.37/39/73-75 + SRA 1963 S.10/16 + A&C S.21                                               | Approved |
| 3   | `legal_notice_eviction.json`               | State Rent Acts (Delhi/Maharashtra/Karnataka/UP/Bihar/Jharkhand/WB) + TPA S.106/111/114 + MTA 2021 | Approved |
| 4   | `legal_notice_trademark_infringement.json` | Trade Marks Act 1999 S.28/29/103-105/134/135                                                       | Approved |
| 5   | `legal_notice_copyright_infringement.json` | Copyright Act 1957 S.14/51/52/55/58/62/63/63B + IT Rules 2021 R.3(2)(b)                            | Approved |
| 6   | `legal_notice_consumer_deficiency.json`    | CPA 2019 S.2(7)/(10)/(11)/35/39/69/82-87 + CP Jurisdiction Rules 2021                              | Approved |

## Legal correctness checks performed

### 1. Defamation

- BNS S.356 cited; IPC 499/500 expressly noted as repealed (offences after 1 July 2024).
- Three elements gated as mandatory: publication, identification, defamatory imputation.
- Limitation captured: Art. 75/76 Limitation Act = 1 year.
- Civil vs criminal route both modelled with route_consequence variable.

### 2. Breach of contract

- ICA S.73 (general damages) + S.74 (penalty/LD) separated.
- SRA 1963 post-2018 amendment noted — specific performance now default remedy under S.10.
- Section 16(c) readiness-and-willingness pleading flagged in validation_rules.
- Art. 54/55 limitation embedded in filing checklist.
- A&C S.21 invocation-in-the-alternative supported.

### 3. Eviction

- State-specific switch — Bihar Act 1982, Jharkhand Act 2011, UP Act 1972, Delhi Rent Act 1958, Maharashtra Rent Act 1999, Karnataka Rent Act 1999, MTA 2021.
- TPA S.106 post-2002 amendment notice period clarified (15 days monthly / 6 months annual).
- Critical defaulting position: most state Rent Acts permit eviction ONLY on enumerated grounds — prompt enforces this.
- Cure period for arrears under S.114 TPA flagged.
- Article 65/67 limitation included.

### 4. Trademark infringement

- TM Act S.28/29/134/135 cited correctly.
- S.134 forum advantage (plaintiff's place) preserved.
- S.103-105 criminal remedy reserved.
- Validation rule: registration OR demonstrable prior user (passing off).
- Cross-class protection under S.29(4) referenced.
- Commercial Courts Act S.12A pre-institution mediation correctly noted as exempted where urgent interim relief sought.

### 5. Copyright infringement

- Copyright Act S.14/51/52/55/58/62/63/63B all included.
- Originality standard (Eastern Book Co. v. D.B. Modak) referenced.
- S.62 forum advantage explicitly explained.
- Registration NOT mandatory but evidentiary — validation rules clarify.
- Parallel takedown via IT Rules 2021 Rule 3(2)(b) — 36-hour platform takedown — embedded.
- Fair dealing defence (S.52) anticipation built into prompt.
- John Doe / Ashok Kumar orders reservation.

### 6. Consumer deficiency

- CPA 2019 (NOT 1986) — repeal confirmed.
- Pecuniary jurisdiction per CP (Jurisdiction) Rules 2021: District ≤ Rs. 50L / State Rs. 50L-2cr / National > Rs. 2cr — matches Batch 3 config completion.
- Territorial jurisdiction under S.34(2) — complainant's place option highlighted (post-2019 reform).
- S.69 limitation (2 years).
- CCPA referral under S.17-19 reserved.
- Product liability under S.82-87 reserved.
- Flagged: CPA does NOT statutorily mandate pre-suit notice — 30-day window is customary and demonstrates good faith.

## Schema consistency vs `legal_notice_s138.json`

All 6 templates mirror the parent schema: `_meta` block, `docType`, `parentDocType`, `displayName`, `category`, `creditsCost: 1`, `court_levels: ["pre_litigation"]`, `causeTitle`, `form_schema`, `mandatoryClauses`, `prayerTemplate`, `verificationTemplate` (empty for notices), `filingChecklist`, `relevantActs`, `validation_rules`, `promptInstructions`.

## Cross-batch dependencies

- Batch 3 pecuniary jurisdiction Rules 2021 already reflected in `legal_notice_consumer_deficiency`.
- Sanhita map (BNS replaces IPC) reflected in `legal_notice_defamation`.
- No conflicts with existing notices (`legal_notice_s80`, `legal_notice_s138`).

## Open items / future work

- State Rent Act granular forks (separate templates per state) — defer to Batch 5 if demand warrants; current eviction template handles state via `applicable_rent_law` enum.
- John Doe / Ashok Kumar standalone suit template — Batch 4+ candidate.
- CCPA complaint template (not pre-litigation notice) — Batch 4+ candidate.
- Notice under MSMED Act S.18 (mediation/conciliation reference) — separate from generic breach notice — Batch 4+ candidate.

## Sign-off

All 6 JSON files validated structurally and legally. Approved for prompt-engine ingestion subject to QA round in staging by Vishal.

— Ajay (CLO), 2026-05-12
