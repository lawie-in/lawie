# CLO National Batch 10 Audit — Consumer Commissions

**Owner:** Ajay (CLO)
**Date:** 2026-05-10
**Scope:** State + UT Consumer Disputes Redressal Commissions + District Consumer Commissions
**Status:** Approved

---

## Headline
- Courts: **1531 → 1619** (+88)
- Schema: existing `consumer_commission` courtType + `consumer_commission_generic` formatting rules — no new rule files required.
- JSON validated.

## Counts

| Category | Added | Skipped (duplicates) | Total now in file |
|---|---:|---:|---:|
| State Consumer Commissions (28 states) | 18 | 10 | 28 |
| UT Consumer Commissions | 8 | 0 | 8 (within state_consumer count) |
| District Consumer Commissions (DCDRCs) | 62 | 18 | 80 |
| **TOTAL NEW** | **88** | **28** | — |

Final `state_consumer` ids in file: 36 (28 states + 8 UTs).
Final `_dccdrc` ids in file: 80.

## State Commissions added (18)
ap_state_consumer_vijayawada, ar_state_consumer_itanagar, as_state_consumer_guwahati, bihar_state_consumer_patna, cg_state_consumer_raipur, ga_state_consumer_panaji, hr_state_consumer_panchkula, hp_state_consumer_shimla, jh_state_consumer_ranchi, mn_state_consumer_imphal, ml_state_consumer_shillong, mz_state_consumer_aizawl, nl_state_consumer_kohima, od_state_consumer_cuttack, pb_state_consumer_chandigarh, sk_state_consumer_gangtok, tr_state_consumer_agartala, uk_state_consumer_dehradun.

## State Commissions skipped (already in earlier batches — 10)
mh_state_consumer_mumbai, ka_state_consumer_bangalore, tn_state_consumer_chennai, ts_state_consumer_hyderabad, wb_state_consumer_kolkata, gj_state_consumer_ahmedabad, rj_state_consumer_jaipur, up_state_consumer_lucknow, mp_state_consumer_bhopal, kl_state_consumer_ernakulam.

## UT Commissions added (8)
ut_chd_state_consumer_chandigarh, dl_state_consumer_delhi, py_state_consumer_puducherry, an_state_consumer_port_blair, dnh_dd_state_consumer_silvassa, ld_state_consumer_kavaratti, jk_state_consumer_jammu, la_state_consumer_leh.

## DCDRCs added (62)
- **MH (4):** thane, nashik, nagpur, aurangabad
- **KA (4):** mysuru, mangaluru, hubballi, belagavi
- **TN (4):** coimbatore, madurai, tiruchirappalli, salem
- **TS (3):** warangal, karimnagar, nizamabad
- **AP (4):** visakhapatnam, vijayawada, tirupati, guntur
- **KL (3):** kozhikode, thrissur, kollam
- **GJ (3):** surat, vadodara, rajkot
- **RJ (3):** jodhpur, kota, udaipur
- **MP (3):** bhopal, jabalpur, gwalior
- **UP (6):** kanpur, varanasi, agra, ghaziabad, noida, meerut
- **Bihar (3):** gaya, muzaffarpur, bhagalpur
- **JH (1):** bokaro
- **WB (4):** howrah, durgapur, asansol, siliguri
- **OD (2):** bhubaneswar, cuttack
- **CG (3):** raipur, bilaspur, durg
- **PB (3):** amritsar, ludhiana, jalandhar
- **HR (2):** gurugram, faridabad
- **UK (2):** dehradun, haridwar
- **AS (2):** guwahati, dibrugarh
- **JK (2):** srinagar, jammu
- **GA (1):** panaji

## DCDRCs skipped (18 — already present in Batches 1, 4a/b, 5a/b)
patna_dccdrc, ranchi_dccdrc, dhanbad_dccdrc, jamshedpur_dccdrc, delhi_dccdrc, lucknow_dccdrc, mumbai_dccdrc, bangalore_dccdrc, chennai_dccdrc, hyderabad_dccdrc, pune_dccdrc, kolkata_dccdrc, ahmedabad_dccdrc, jaipur_dccdrc, indore_dccdrc, chandigarh_dccdrc, cochin_dccdrc, thiruvananthapuram_dccdrc.

## Legal correctness notes (CLO)
- All State Commissions: pecuniary jurisdiction **Rs. 50 lakh to Rs. 2 crore** under CPA 2019 + Consumer Protection (Jurisdiction of the District Commission, State Commission and National Commission) Rules, 2021.
- All District Commissions: pecuniary jurisdiction **up to Rs. 50 lakh** under the same Rules.
- `caseNomenclature` set to "First Appeal No." for State Commissions (appellate origination from District) and "Consumer Complaint No." for District Commissions (originating complaint) — matches actual cause-title practice.
- `designation` strings follow the established BEFORE THE … format with all-caps state/city, consistent with the 18 existing consumer_commission entries.
- `formattingRulesRef` = `consumer_commission_generic` (already in repo) — no new rule files required.
- `supportedLanguages` chosen per state's official language(s); UTs include Hindi as cohabiting official language where applicable.

## _meta update
Added entry:
```
"national_expansion_batch_10": "2026-05-10 — 28 state consumer commissions + ~80 district consumer commissions, ~130 courts"
```

## Files touched
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json`

## Sign-off
Approved. Ready for Batch 11.
