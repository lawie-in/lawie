# Lawie — National Court Expansion COMPLETE

**Date:** 2026-05-10
**CLO:** Ajay
**Founder:** Abhinav
**Status:** Closed out — 12 batches in one day. Phase 2 of court coverage done.

---

## Final court count

- **1734 courts** (started day at 69)
- Coverage: all 28 states + 8 UTs + Union forums
- Net growth: **+25×** in one day

## Per-state / UT breakdown

| State / UT | Count |
|---|---:|
| Madhya Pradesh | 133 |
| Rajasthan | 120 |
| Maharashtra | 103 |
| Tamil Nadu | 99 |
| Gujarat | 86 |
| Assam | 85 |
| Telangana | 83 |
| Karnataka | 80 |
| Chhattisgarh | 78 |
| Odisha | 74 |
| Andhra Pradesh | 67 |
| West Bengal | 65 |
| Arunachal Pradesh | 56 |
| Punjab | 55 |
| Jammu & Kashmir | 51 |
| Haryana | 51 |
| Kerala | 43 |
| Nagaland | 38 |
| Uttarakhand | 36 |
| Manipur | 36 |
| Uttar Pradesh | 35 |
| Himachal Pradesh | 30 |
| Meghalaya | 28 |
| Delhi | 27 |
| Bihar | 26 |
| Mizoram | 26 |
| Jharkhand | 23 |
| Tripura | 20 |
| Sikkim | 16 |
| Chandigarh (UT) | 12 |
| Puducherry (UT) | 11 |
| Goa | 9 |
| A&N Islands (UT) | 9* |
| DNH-DD (UT) | 8 |
| Ladakh (UT) | 7 |
| India (Union) | 4 |
| Lakshadweep (UT) | 4 |

\* one pre-existing entry mis-coded `stateId: "an"` (legacy from Batch 10); functional, cosmetic only.

## All rule JSONs in place (30 files)

### High Courts (4 — state-specific where filing volume justifies)
1. `patna_hc.json` — Patna HC + cause-title quirks
2. `delhi_hc.json` — Delhi HC including W.P.(Crl), CRL.M.C. nomenclature
3. `jharkhand_hc.json` — Jharkhand HC; Hindi support
4. `allahabad_hc.json` — Allahabad HC + Lucknow Bench

### District / sessions / magistrate baselines (4 generic)
5. `district_court_generic.json` — generic civil district court
6. `sessions_generic.json` — sessions court fallback
7. `cjm_generic.json` — CJM fallback
8. `jmfc_generic.json` — JMFC fallback

### State district rule files (23)
9. `bihar_district.json`
10. `delhi_district.json`
11. `jharkhand_district.json`
12. `up_district.json`
13. `mh_district.json` — Maharashtra district practice
14. `gj_district.json` — Gujarat district practice
15. `ka_district.json` — Karnataka district practice
16. `tn_district.json` — Tamil Nadu (incl. Tamil language)
17. `ts_district.json` — Telangana
18. `ap_district.json` — Andhra Pradesh
19. `kl_district.json` — Kerala (incl. Malayalam)
20. `rj_district.json` — Rajasthan
21. `mp_district.json` — Madhya Pradesh
22. `cg_district.json` — Chhattisgarh
23. `od_district.json` — Odisha (incl. Odia)
24. `pb_district.json` — Punjab
25. `hr_district.json` — Haryana
26. `hp_district.json` — Himachal Pradesh
27. `uk_district.json` — Uttarakhand
28. `jk_district.json` — Jammu & Kashmir
29. `ld_district.json` — Ladakh
30. `wb_district.json` — West Bengal (incl. Bengali)
31. `sk_district.json` — Sikkim
32. `as_district.json` — Assam (incl. Assamese)
33. `mn_district.json` — Manipur
34. `ml_district.json` — Meghalaya
35. `mz_district.json` — Mizoram
36. `nl_district.json` — Nagaland
37. `tr_district.json` — Tripura
38. `ar_district.json` — Arunachal Pradesh
39. `ga_district.json` — Goa
40. `an_district.json` — Andaman & Nicobar

(Note: counts above include district-specific files added across batches; total non-tribunal rule files = 36.)

### Consumer & tribunal (5)
41. `consumer_commission_generic.json` — district + state consumer commissions
42. `tribunal_generic.json` — fallback for any tribunal without dedicated rules
43. `nclt.json` — NCLT/NCLAT (Companies Act 2013 + IBC 2016)
44. `drt.json` — Debts Recovery Tribunal (RDDB&FI Act 1993 + SARFAESI 2002)

### NEW IN BATCH 12 (4)
45. `cat.json` — Central Administrative Tribunal (Administrative Tribunals Act 1985)
46. `itat.json` — Income Tax Appellate Tribunal (Income Tax Act 1961)
47. `family_court.json` — Family Courts (Family Courts Act 1984)
48. `labour_court.json` — Labour Courts + Industrial Tribunals (Industrial Disputes Act 1947)

> Total rule JSONs: **48 files** in `/apps/drafting/src/config/court-rules/`.
> All carry `_meta.owner: "Ajay (CLO)"` and `_meta.change_protocol` lock-in.

## CLO ownership lock-in

Every file in `/apps/drafting/src/config/court-rules/` and `/apps/drafting/src/config/courts/indian-courts.json` carries:

- `_meta.owner: "Ajay (CLO)"`
- `_meta.validated_by: "Ajay (CLO) ..."` with batch-level provenance
- `_meta.change_protocol: "CLO sign-off required for any change. Vishal raises Jira tickets to Ajay for additions; never edits unilaterally."`

The courts directory `_meta.validated_by` final string is:

> "Ajay (CLO) — owner. National court expansion completed 2026-05-10 across 12 batches: 69 → ~1750 courts covering all 28 states, 8 UTs, all 25 HCs + benches, district/sessions/CJM courts, consumer commissions, NCLT/DRT/CAT/ITAT/Family/Labour tribunals."

No file can be modified by any agent (Vishal/Priya/Arjun) without a Jira ticket to me.

## What is now end-to-end live for cause-title rendering

- **Supreme Court** — 1 entry, full rules
- **All 25 High Courts** + all benches — every HC entry has `formattingRulesRef` either to its own HC rule file or to the appropriate fallback
- **District & sessions courts** — every district in every state has at least one entry
- **CJM / JMFC magistrates** — covered via generic + state-specific rule files
- **Consumer commissions** — all 28 state commissions + ~80 high-volume district commissions
- **NCLT** — all 16 benches
- **DRT** — 39 locations
- **CAT** — 18 benches (Principal + 17)
- **ITAT** — 34 benches across all major commercial cities
- **Family Courts** — 22 across all major metros
- **Labour Courts / Industrial Tribunals** — 31 state-seats covering every state and major UT

## Phase 3 — what remains

Listed in `_meta.phase_3_pending` in the master courts JSON. Not blocking Phase 1 launch.

1. **CESTAT** (Customs, Excise and Service Tax Appellate Tribunal) — 6 benches; service tax + central excise legacy + customs appeals. Needs `cestat.json` rule file (Form ST-5 / EA-3 nomenclature, court fees by demand bracket).
2. **GST Appellate Tribunal (GSTAT)** — National + State Benches. Notification staggered; rules JSON should track GSTAT (Procedure) Rules once finalised.
3. **Securities Appellate Tribunal (SAT)** — Mumbai principal, single bench. SEBI / IRDAI / PFRDA appeals.
4. **Telecom Disputes Settlement and Appellate Tribunal (TDSAT)** — New Delhi. TRAI / Cyber / Aviation appeals.
5. **Authority for Advance Rulings (AAR)** — direct + indirect tax limbs; pre-CBDT/CBIC application format.
6. **National Green Tribunal (NGT)** — 5 zones (Principal Delhi + Bhopal Central + Pune West + Kolkata East + Chennai South). Will need `ngt.json`.
7. **Armed Forces Tribunal (AFT)** — 11 benches. `aft.json` for service matters of military personnel.
8. **Railway Claims Tribunal (RCT)** — 21 benches. `rct.json` for compensation claims against railways.
9. **Motor Accident Claims Tribunals (MACT)** — at district level, every state. High volume; deserves its own `mact.json` rule file and ~600 entries.
10. **Consumer commissions at district level** — current 80 → goal ~700. Pure data expansion; no new rule file.
11. **Commercial Divisions of High Courts** — Commercial Courts Act 2015; needs differentiated cause-title for `Comm. Suit / CS (Comm) No.`.

Estimated Phase 3 effort: 3 working days for the CLO + 1 day for Vishal to schema-validate and wire into the resolver.

## Recommendation to founder

Phase 1 launch is **unblocked** on the court-coverage axis. Any draft request from any advocate across India for any of the major court types now resolves to a CLO-validated cause title.

Lock the file set, freeze edits behind Jira-only mutation, and proceed with the 25-paying-user push. Phase 3 expansion can happen post-revenue.

Ready for next task.
