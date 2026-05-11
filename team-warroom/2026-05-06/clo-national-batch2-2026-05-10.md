# CLO National Court Expansion — Batch 2 Audit

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**File:** /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json
**Result:** 174 -> 191 courts (+17). JSON validated via `python3 -m json.tool`.

## HCs added (13)

1. `andhra_pradesh_hc_amaravati` — High Court of Andhra Pradesh at Amaravati (post-2019 bifurcation)
2. `himachal_pradesh_hc_shimla` — HP HC, sole seat Shimla
3. `jk_ladakh_hc_srinagar` — Common HC for UTs of J&K and Ladakh (principal/summer seat)
4. `uttarakhand_hc_nainital` — UK HC, sole seat Nainital
5. `chhattisgarh_hc_bilaspur` — CG HC, sole seat Bilaspur
6. `orissa_hc_cuttack` — Odisha HC, sole seat Cuttack
7. `sikkim_hc_gangtok` — Sikkim HC, sole seat Gangtok
8. `tripura_hc_agartala` — Tripura HC (carved out of Gauhati, 2013)
9. `manipur_hc_imphal` — Manipur HC (carved out of Gauhati, 2013)
10. `meghalaya_hc_shillong` — Meghalaya HC (carved out of Gauhati, 2013)
11. `gauhati_hc_guwahati` — Gauhati HC principal seat (Assam + NL + MZ + AR)

## HC benches added (6)

1. `jk_ladakh_hc_jammu_wing` — Jammu winter wing of J&K and Ladakh HC
2. `gauhati_hc_kohima_bench` — Nagaland
3. `gauhati_hc_aizawl_bench` — Mizoram
4. `gauhati_hc_itanagar_bench` — Arunachal Pradesh
5. `karnataka_hc_dharwad_bench`
6. `karnataka_hc_kalaburagi_bench`

## Note on count vs. target

Brief targeted ~40; the explicit list in the brief enumerates 17 entries and that is what has been added. Any further HC benches (e.g. permanent vs circuit at smaller HCs) appear to already be covered by Batch 1 entries or do not exist as separate filing forums. Confirm if more entries are expected; otherwise national HC coverage is complete.

## Patna HC alias check

Existing `patna_hc` entry covers principal seat. Patna HC has no separate benches — no alias needed. Already present at line 55 of file. Acceptable.

## HC rule files still needed (Batch 4 — rendering rules expansion)

Today only the following HCs have dedicated rule JSONs: `patna_hc`, `jharkhand_hc`, `allahabad_hc` (+ Lucknow bench), `delhi_hc`. All other HCs currently fall back to `district_court_generic` via `formattingRulesRef`. The following need their own rule JSONs for proper cause-title / margins / case-numbering:

**High priority (Batch 4):**
- `bombay_hc` (Mumbai + Aurangabad/Nagpur/Panaji benches share rule)
- `madras_hc` (Chennai + Madurai bench)
- `calcutta_hc` (Kolkata + Jalpaiguri/Port Blair circuits)
- `karnataka_hc` (Bengaluru + Dharwad/Kalaburagi benches)
- `kerala_hc` (Ernakulam)
- `gujarat_hc` (Ahmedabad)
- `telangana_hc` (Hyderabad)
- `rajasthan_hc` (Jodhpur + Jaipur bench)
- `mp_hc` (Jabalpur + Indore/Gwalior benches)
- `punjab_haryana_hc` (Chandigarh)

**Medium priority (Batch 5):**
- `andhra_pradesh_hc` (Amaravati)
- `gauhati_hc` (shared rule across Guwahati + Kohima/Aizawl/Itanagar benches)
- `jk_ladakh_hc` (shared rule across Srinagar + Jammu wing)
- `orissa_hc`
- `chhattisgarh_hc`
- `uttarakhand_hc`
- `himachal_pradesh_hc`

**Lower priority (Batch 6):**
- `sikkim_hc`
- `tripura_hc`
- `manipur_hc`
- `meghalaya_hc`

Total HC rule files outstanding: **21**. Phasing should track Phase 1 user base (Bihar/Jharkhand/UP/Delhi already done) plus next-wave state expansion priorities decided by founder + Priya.

## Risk flags

- **Risk:** All 17 new HCs currently render through `district_court_generic` rules. This is acceptable for an internal lookup directory and for early-stage drafts but will produce cause-title formatting that any HC registry can reject on filing. Mark all 17 entries as "draft-only — not filing-ready" in product UI until matching rule JSONs ship.
- **Risk:** `jammu_kashmir` (and `jammu_kashmir`/`ladakh` UTs), `assam`, `odisha`, `nagaland`, `mizoram`, `arunachal_pradesh`, `sikkim`, `tripura`, `manipur`, `meghalaya`, `himachal_pradesh`, `uttarakhand`, `chhattisgarh`, `andhra_pradesh` are referenced as `stateId` values but are NOT yet declared in the top-level `states[]` array (lines 11-27). Will need a Batch 2.1 patch to add those state declarations so the FE state-dropdown can resolve them. Flagging as a **Blocker** for any UI that filters by state.
- **Acceptable:** `caseNomenclature` defaults chosen are the most commonly used criminal-side filing forms per HC (sourced from each HC's own e-filing / case-status portal terminology). Civil-side equivalents to be added when civil templates ship.

## Status

- JSON valid: yes (json.tool exit 0)
- Total courts: 191
- _meta.national_expansion_batch_2 marker added
- CLO sign-off: Approved for merge to main, gated on Batch 2.1 state-declaration patch before any state-filter UI is wired.
