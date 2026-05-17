# CLO Templates Audit — Batch 4: Civil Pleadings

**Owner:** Ajay (CLO)
**Date:** 2026-05-12
**Batch:** 4 of 8 — Civil Pleadings
**Status:** All 8 JSON files filed. Valid JSON. Ready for SCRUM-64 validator integration.

---

## Files filed

All paths under `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/`.

| #   | template_id                 | File                             | Credits | Court levels                     |
| --- | --------------------------- | -------------------------------- | ------- | -------------------------------- |
| 1   | plaint_recovery             | plaint_recovery.json             | 2       | Civil + Commercial Court         |
| 2   | plaint_declaration          | plaint_declaration.json          | 2       | Civil + HC original side         |
| 3   | plaint_injunction           | plaint_injunction.json           | 2       | Civil + HC original side         |
| 4   | plaint_specific_performance | plaint_specific_performance.json | 2       | Sr. Div + Dist + HC + Commercial |
| 5   | plaint_partition            | plaint_partition.json            | 2       | Sr. Div + Dist + HC original     |
| 6   | plaint_eviction             | plaint_eviction.json             | 2       | Civil + Small Causes             |
| 7   | written_statement           | written_statement.json           | 2       | All civil + Commercial           |
| 8   | replication                 | replication.json                 | 2       | All civil + Commercial           |

---

## Legal correctness — non-negotiable points enforced

### 1. plaint_recovery

- Order VII R.1-9 CPC pleaded as mandatory.
- Cause of action paragraph (Order VII R.1(e)) flagged as mandatory clause.
- Limitation: discrete options for Art. 19 (money lent), 22 (deposit on demand), 23 (money had and received), 34 (PN), 35 (cheque), 55 (breach), 113 (residuary).
- Court-fee state Schedule referenced (Court Fees Act 1870 + state amendments).
- Commercial Courts Act S.2(1)(c) + 12A pre-institution mediation (Patil Automation v. Rakheja Engineers (2022)) baked in.
- S.34 CPC interest pendente lite + future.
- NI Act S.80 default 18% interest cross-cited; cheque-based recovery distinguished from S.138 criminal.
- Stamp Act S.35 — unstamped PN inadmissible.
- **Risk caught:** unstamped promissory note. Validator should flag.

### 2. plaint_declaration

- S.34 SRA proviso enforced: "no court shall make declaration where plaintiff being able to seek further relief omits to do so."
- **Anathula Sudhakar v. P. Buchi Reddy (2008) 4 SCC 594** cited — bare declaration impermissible where plaintiff out of possession.
- Validator rule: if `possession_status = out_of_possession` then `consequential_relief` cannot be 'no_consequential_relief'. **Hard rule.**
- Suhrid Singh v. Randhir Singh (court fee on cancellation declarations).
- Article 58 Limitation Act — 3 years from first denial.
- Court fee — state schedule (Bihar/UP/Maharashtra) cross-referenced.

### 3. plaint_injunction

- S.38 SRA (prohibitory) + S.39 SRA (mandatory) distinguished.
- Order 39 R.1-2 CPC for temporary injunction filed as separate application.
- **Triple test** (Dalpat Kumar v. Prahlad Singh; M. Gurudas v. Rasaranjan) — prima facie / balance of convenience / irreparable injury — enforced as three separate mandatory fields.
- S.41 SRA bars (a)-(j) explicitly checked.
- Order 39 R.3 — affidavit and ex parte conditions.
- Premji Ratansey Shah — injunction not against true owner in favour of trespasser.

### 4. plaint_specific_performance

- **Post-2018 SRA amendment** fully captured: SP is general rule; S.14 exceptions are exhaustive; substituted performance under S.19A/20 added.
- Katta Sujatha Reddy (2022) — 2018 amendment applies prospectively.
- **S.16(c) readiness and willingness** mandatory pleading — Beemaiah v. Govindappa (2013); Syed Dastagir v. T.R. Gopalakrishna Setty (1999); J.P. Builders; Kamal Kumar v. Premlata Joshi (2019).
- Article 54 Limitation Act — 3 years from fixed date or refusal.
- Alternative damages under S.21 SRA mandatory (validator enforces).
- Commercial Courts Act + pre-institution mediation for >Rs.3L disputes.
- TPA S.53A part-performance cross-cited.
- Lis pendens (S.52 TPA) flagged.
- **Risk caught:** failure to plead readiness and willingness specifics (financial capacity + acts) — fatal. Validator flags empty `readiness_willingness`.

### 5. plaint_partition

- **HSA 2005 amendment** + **Vineeta Sharma v. Rakesh Sharma (2020) 9 SCC 1** — daughters as coparceners by birth irrespective of father alive on 09.09.2005. Reverses Prakash v. Phulavati on this point.
- Mitakshara vs Dayabhaga distinction flagged in form schema.
- Survivorship abolished by 2005 amendment; notional partition under S.6 HSA.
- Partition Act 1893 (S.4 — transferee of dwelling-house share).
- Validator: every coparcener / co-sharer must be impleaded (Order I R.9 non-joinder fatal).
- Two-stage decree (preliminary + final via Commissioner under Order XXVI R.13-14) noted.
- Court fee — state Schedule, fixed if joint possession, ad valorem if exclusion (Bihar / Maharashtra).
- **Risk caught:** if defendants_details omits any coparcener — suit defective. Validator should cross-check genealogy.

### 6. plaint_eviction

- **HARD GATE:** Rent control act applicability check. Validator rule: "If state rent control applies, REJECT and flag for rent controller petition instead."
- State rent acts cross-listed: Delhi Rent Control 1958, Maharashtra Rent Control 1999, UP Urban Buildings Act 1972, Bihar Buildings Control Act 1982, TN 2017, WB 1997.
- TPA S.106 (post-2003 amendment): 15 days notice for all leases; 6 months for agricultural/manufacturing.
- Aero Traders v. Ravinder Kumar Suri (2014) — substantial compliance post-amendment.
- S.111 TPA — all grounds of determination listed.
- Article 67 Limitation — 12 years.
- Small Causes Courts jurisdiction noted for Bombay / Calcutta / Madras / Hyderabad.
- **Blocker:** premise in rent-controlled jurisdiction is a wrong-forum trap. Made primary validator gate.

### 7. written_statement

- Order VIII R.1-10 CPC fully covered.
- **SCG Contracts (India) v. KS Chamankar (2019) 12 SCC 210** — 120-day outer limit in commercial suits is MANDATORY and inflexible. Validator hard-codes this.
- Order VIII R.3-5 — specific denial; evasive denial = no denial; failure to deny = deemed admission (Lohia Properties).
- Order VIII R.2 — affirmative defences (limitation, payment, release, discharge, fraud, illegality) MUST be specifically pleaded (Badat & Co).
- Set-off (R.6) vs Counter-claim (R.6A-6G) distinguished; both require court fee.
- Ashok Kumar Kalra (2020) — counter-claim timing outer limit before framing of issues.
- Statement of Truth (Order VI R.15A) for Commercial Courts flagged.
- Salem Advocate Bar (II) — 90-day directory in non-commercial.
- **Risk caught:** WS filed beyond 120 in commercial = barred. Validator hard-stops.

### 8. replication

- Order VIII R.9 CPC — leave of court is MANDATORY. Validator enforces `leave_application_filed = true`.
- **Scope strictly limited** — Manmohan Singh v. Punjab National Bank; Anant Construction (P) Ltd v. Ram Niwas — replication cannot introduce new cause of action or expand reliefs.
- Order VIII R.6E — separate WS to counter-claim noted.
- Distinguished from amendment of pleadings under Order VI R.17.
- Commercial Courts statement of truth applies.

---

## Cross-cutting compliance

| Concern                                                                                   | Status                            |
| ----------------------------------------------------------------------------------------- | --------------------------------- |
| All 8 templates carry standard Lawie disclaimer                                           | Approved                          |
| All carry `_meta` (owner, validated_by, last_updated, change_protocol)                    | Approved                          |
| All carry verification (Order VI R.15) + affidavit in support (Order VI R.15(4))          | Approved                          |
| All carry filing_checklist + validation_rules                                             | Approved                          |
| All carry key_citations with full reporter references                                     | Approved                          |
| State-rent-act gate in plaint_eviction                                                    | Blocker enforced                  |
| Pre-institution mediation gate (CCA 12A) in plaint_recovery + plaint_specific_performance | Hard rule                         |
| Daughters' coparcenary equality post Vineeta Sharma in plaint_partition                   | Enforced                          |
| Readiness & willingness in plaint_specific_performance                                    | Enforced                          |
| Consequential relief in plaint_declaration                                                | Enforced                          |
| 30/120-day WS time in written_statement                                                   | Hard rule (commercial: mandatory) |
| Leave of court in replication                                                             | Hard rule                         |

---

## Acts referenced (cross-template)

- CPC 1908 — Order VI, VII, VIII, XX, XXI, XXVI; S.9, 16, 17, 20, 26, 34, 151
- Specific Relief Act 1963 (incl. 2018 amendment) — S.10, 11, 12, 14, 16, 19A, 20, 21, 22, 34, 36-42
- Indian Contract Act 1872 — S.10, 55, 73
- Transfer of Property Act 1882 — S.5, 44, 52, 53A, 54, 55, 105-108, 111, 114, 116
- Hindu Succession Act 1956 (incl. 2005 amendment) — S.6, 8, 10, 15, 30
- Partition Act 1893 — S.2-4
- Limitation Act 1963 — Schedule Arts. 19, 22, 23, 34, 35, 54, 55, 58, 65, 67, 110, 113
- Commercial Courts Act 2015 — S.2(1)(c), 6, 12, 12A, 16
- Court Fees Act 1870 + state amendments
- Suits Valuation Act 1887
- NI Act 1881 — S.4, 6, 80, 138
- Indian Stamp Act 1899 — S.35
- Registration Act 1908 — S.17(1)(d)
- State Rent Control Acts (Delhi, Maharashtra, UP, Bihar, TN, WB)

This list will populate SCRUM-64 validator's accepted-section table for civil pleadings.

---

## Open risks flagged for product team (Priya)

| #   | Risk                                                   | Recommendation                                                                                                                                                          |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Rent control vs TPA — wrong forum is fatal             | UI must collect state + premises type + rent + area before allowing plaint_eviction. If state rent act applies, redirect to rent control petition template (Batch 6/7). |
| R2  | Daughters' coparcenary — pre/post 09.09.2005 confusion | UI should auto-trigger Vineeta Sharma explainer for plaint_partition where female plaintiff/defendants.                                                                 |
| R3  | Readiness & willingness specifics                      | UI must require user to enter financial capacity + acts done; not just "ready and willing" boilerplate.                                                                 |
| R4  | WS 120-day commercial bar                              | UI must capture summons service date and warn at day 100, block at day 121.                                                                                             |
| R5  | Pre-institution mediation (CCA 12A)                    | UI must capture commercial dispute flag + mediation outcome before allowing filing-ready plaint. Patil Automation is non-negotiable.                                    |
| R6  | State-specific court fees                              | Court fee field cannot be free text; build state-Schedule lookup (Batch 6 / SCRUM-64 v2).                                                                               |
| R7  | Stamp duty on PN / agreement to sell                   | Validator should flag if `documentary_evidence` contains "promissory note" but no stamping particulars.                                                                 |
| R8  | Non-joinder of coparceners in partition                | UI must build a coparcener-tree and require every name before submission.                                                                                               |

---

## Status

- B1 (criminal — bail / surrender / suspension): complete (prior batch)
- B2 (legal notices): complete (prior batch)
- B3 (family law): complete (prior batch)
- **B4 (civil pleadings): complete — this batch**
- B5-B8: pending

### Approval

All 8 JSONs: **Approved by CLO** for production use subject to:

1. SCRUM-64 validator must consume `relevantActs` and enforce per-template rules.
2. UI must implement the 8 risk flags above before public exposure.
3. State-specific court fee table (separate config) must precede plaint_eviction / plaint_recovery / plaint_specific_performance going live.

Ready for next task.
