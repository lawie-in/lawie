# CLO National Expansion Batch 1 — Audit

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**File:** `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json`

## Headline

- Courts: **69 → 174** (105 new entries; over the 80 target because Mumbai/Chennai/Kolkata/Bangalore/Hyderabad/Ahmedabad/Jaipur/Chandigarh tribunal stacks plus Indore + Kerala duo broke into more entries than estimated)
- JSON valid: `python3 -m json.tool` passed
- Duplicate courtIds: none
- `_meta.last_updated` retained `2026-05-10`; added `national_expansion_batch_1` note
- States array extended with: `rajasthan`, `madhya_pradesh`, `chandigarh`, `kerala`

## Counts by metro

| Metro | New | New courtIds |
|---|---|---|
| Mumbai | 14 | bombay_hc_aurangabad_bench, bombay_hc_nagpur_bench, bombay_hc_panaji_bench, mh_sessions_mumbai_city, mh_sessions_mumbai_suburban, mh_district_mumbai, mumbai_dccdrc, mh_state_consumer_mumbai, nclt_mumbai, drt_mumbai_1, drt_mumbai_2, drt_mumbai_3, cat_mumbai, itat_mumbai |
| Bangalore | 8 | ka_sessions_bangalore_urban, ka_sessions_bangalore_rural, bangalore_dccdrc, ka_state_consumer_bangalore, nclt_bengaluru, drt_bangalore, cat_bangalore, itat_bangalore |
| Chennai | 10 | madras_hc_madurai_bench, tn_sessions_chennai, chennai_dccdrc, tn_state_consumer_chennai, nclt_chennai, nclat_chennai_bench, drt_chennai_1, drt_chennai_2, cat_chennai, itat_chennai |
| Hyderabad | 8 | ts_sessions_hyderabad, ts_sessions_secunderabad, hyderabad_dccdrc, ts_state_consumer_hyderabad, nclt_hyderabad, drt_hyderabad, cat_hyderabad, itat_hyderabad |
| Pune | 3 | mh_sessions_pune, mh_district_pune, pune_dccdrc |
| Kolkata | 13 | calcutta_hc_jalpaiguri_circuit, calcutta_hc_port_blair_circuit, wb_sessions_kolkata, wb_district_24_parganas_north, wb_district_24_parganas_south, kolkata_dccdrc, wb_state_consumer_kolkata, nclt_kolkata, drt_kolkata_1, drt_kolkata_2, cat_kolkata, itat_kolkata |
| Ahmedabad | 8 | gj_sessions_ahmedabad_city, gj_sessions_ahmedabad_rural, ahmedabad_dccdrc, gj_state_consumer_ahmedabad, nclt_ahmedabad, drt_ahmedabad, cat_ahmedabad, itat_ahmedabad |
| Jaipur | 8 | rajasthan_hc_jodhpur, rajasthan_hc_jaipur_bench, rj_sessions_jaipur, jaipur_dccdrc, rj_state_consumer_jaipur, nclt_jaipur, cat_jaipur, itat_jaipur |
| Lucknow | 3 | up_state_consumer_lucknow, cat_lucknow, itat_lucknow |
| Indore | 8 | mp_hc_jabalpur, mp_hc_indore_bench, mp_hc_gwalior_bench, mp_sessions_indore, indore_dccdrc, mp_state_consumer_bhopal, nclt_indore, itat_indore |
| Chandigarh | 7 | punjab_haryana_hc_chandigarh, chandigarh_sessions, chandigarh_dccdrc, nclt_chandigarh, drt_chandigarh, cat_chandigarh, itat_chandigarh |
| Cochin (Ernakulam) | 8 | kerala_hc_ernakulam, kl_sessions_ernakulam_kochi, cochin_dccdrc, kl_state_consumer_ernakulam, nclt_kochi, drt_ernakulam, cat_ernakulam, itat_cochin |
| Trivandrum | 2 | kl_sessions_thiruvananthapuram, thiruvananthapuram_dccdrc |
| Standalones (appellate tribunals) | 6 | nclat_delhi, drat_mumbai, drat_chennai, drat_delhi, drat_kolkata, drat_allahabad |

**Subtotal new = 105**

## Court-type rollup (new entries)

| Type | Count |
|---|---|
| high_court (incl. benches) | 9 |
| sessions | 16 |
| district_court | 2 |
| consumer_commission (DCDRC + State) | 21 |
| tribunal (NCLT/NCLAT/DRT/DRAT/CAT/ITAT) | 57 |

## Duplicates skipped (already in file from Batch 5)

- `supreme_court_india`, `ncdrc_delhi`, `nclt_principal_delhi`
- `maharashtra_hc_mumbai` (= bombay_hc_bombay request), `karnataka_hc_bangalore`, `tamil_nadu_hc_chennai`, `west_bengal_hc_kolkata`, `telangana_hc_hyderabad`, `gujarat_hc_ahmedabad`
- `allahabad_hc_lucknow` (Lucknow bench already present as `allahabad_hc_lucknow`)
- `up_sessions_lucknow`, `lucknow_dccdrc`

## Naming-convention notes / deviations

- Mumbai HC: founder asked for `bombay_hc_bombay`. Existing file uses `maharashtra_hc_mumbai`. Did **not** create alias to avoid drift. Recommend renaming in a follow-up cleanup batch (state-prefix vs court-prefix style is inconsistent across file).
- Benches kept as `<hc>_bench_<city>` per convention: `bombay_hc_aurangabad_bench`, `bombay_hc_nagpur_bench`, `bombay_hc_panaji_bench`, `mp_hc_indore_bench`, `mp_hc_gwalior_bench`, `rajasthan_hc_jaipur_bench`, `madras_hc_madurai_bench`.
- Calcutta circuit benches named with `_circuit` suffix since they are circuit (not permanent) benches: `calcutta_hc_jalpaiguri_circuit`, `calcutta_hc_port_blair_circuit`.
- Tribunals named `<tribunal>_<city>` as instructed: `nclt_mumbai`, `drt_chennai_1` etc.

## formattingRulesRef debt (flag for Batch 11)

All 57 new tribunal entries use `formattingRulesRef: "tribunal_generic"`. **File does not yet exist** — must be created before tribunal templates can render. Suggest separate sub-rules:
- `tribunal_nclt` (cause-title "BEFORE THE NCLT, ... BENCH"; pecuniary fields)
- `tribunal_drt` (O.A. format, RDDB Act)
- `tribunal_cat` (service jurisdiction)
- `tribunal_itat` (ITA No. nomenclature, AY field)
- `tribunal_consumer_state` (First Appeal format)

Also flagged: `sessions_generic` and `district_court_generic` and `consumer_commission_generic` are referenced — confirm these exist (Batch 5 used `bihar_district`, `delhi_district` etc.; the generics may not). If missing, add Batch 11 stubs.

## State additions to `states` array

- `rajasthan` — Rajasthan
- `madhya_pradesh` — Madhya Pradesh
- `chandigarh` — Chandigarh (UT)
- `kerala` — Kerala

## Outstanding (for Batch 2)

- Madras HC bench at Madurai is in; per convention `madras_hc_madurai_bench` (not `madras_hc_bench_madurai`) — chose the cleaner reading form
- DRAT Lucknow exists alongside DRAT Allahabad in some references — used Allahabad per founder's list
- ITAT has Pune, Surat, Patna, Lucknow, Visakhapatnam benches — defer to Batch 2

## Risks

| Item | Status |
|---|---|
| Generic tribunal formatting rules missing | **Risk** — templates referencing tribunal courts will fail until Batch 11 ships rule files |
| `maharashtra_hc_mumbai` vs `bombay_hc_bombay` naming drift | **Risk** — recommend rename in cleanup batch; founder confirm |
| State Commission `kl_state_consumer_ernakulam` actually sits at Thiruvananthapuram | Captured in `jurisdictionNote`; **Acceptable** |
| All cause-title strings English-only | **Acceptable** — vernacular variants are Phase 2 |
| BCI Rule 36 advertising | **N/A** for this batch (internal config) |

Ready for next task.
