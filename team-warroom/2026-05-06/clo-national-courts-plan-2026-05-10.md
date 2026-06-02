# Lawie — National Court Coverage Expansion Plan
**Owner:** Ajay (CLO) · **Date:** 2026-05-10 · **Status:** Planning only — no file edits yet

---

## Headline
**Total target ≈ 1,850 court entries; 12 batches planned; current = 69 → +1,781.**

---

## 1. Universe count (honest sizing)

| Tier | Category | Count |
|---|---|---:|
| A | Supreme Court | 1 |
| B | High Courts + benches (25 HCs + ~18 benches) | 43 |
| C | District / Sessions / CJM / JMFC across 28 states + 8 UTs (~700 districts × avg 2 entries = sessions + CJM; many districts also have JMFC bench listings — we cap at sessions + CJM/MM level) | ~1,400 |
| D | Consumer Commissions (NCDRC + 36 State + ~700 District) | ~737 |
| E | Major tribunals (NCLT 17, NCLAT 2, DRT 38, DRAT 5, CAT 17, ITAT 27, Family Courts ~150 notified, Labour/Industrial ~80) | ~336 |
| **Total** | | **~2,517 entries possible** |

**Realistic Phase-2 target:** **~1,850** — we ship sessions + CJM per district (~1,200), 28 State Consumer Commissions, only metro-tier District Consumer Commissions (~120), and core tribunals (~300). Exotic / per-taluk benches deferred to Phase 3.

---

## 2. Batched execution plan

| # | Scope | File(s) touched | Entries | Priority |
|---|---|---|---:|---|
| 1 | **HIGH-PRIORITY METROS** — Mumbai, Bangalore, Chennai, Hyderabad, Pune, Kolkata, Ahmedabad, Jaipur, Lucknow, Indore, Chandigarh, Cochin, Trivandrum (HC bench + sessions + CJM + city tribunals) | indian-courts.json | ~80 | **P0 — dispatch first** |
| 2 | **All remaining High Courts + benches** (AP, Kerala, Rajasthan, P&H, MP-Jabalpur/Indore/Gwalior, HP, J&K-Ladakh, Uttarakhand, Chhattisgarh, Orissa, Sikkim, Tripura, Manipur, Meghalaya, Gauhati + Aizawl/Itanagar/Kohima, Bombay-Aurangabad/Nagpur/Panaji, Madras-Madurai, Calcutta-Port Blair/Jalpaiguri, Karnataka-Dharwad/Kalaburagi) | indian-courts.json | ~40 | P0 |
| 3 | **Maharashtra + Gujarat district/sessions/CJM** (~70 entries) + new `mh_district.json`, `gj_district.json` rule files | both | ~140 | P0 |
| 4 | **South — Karnataka, Tamil Nadu, Telangana, AP, Kerala** sessions + CJM (~140 districts × 2) + ka/tn/ts/ap/kl rule files | both | ~280 | P1 |
| 5 | **North-Central — Rajasthan, MP, Chhattisgarh, Odisha** sessions + CJM + rj/mp/cg/od rule files | both | ~330 | P1 |
| 6 | **North — Punjab, Haryana, HP, Uttarakhand, J&K, Ladakh, Chandigarh UT** sessions + CJM (HP/Sikkim/Goa/UTs ride `district_court_generic`) | both | ~190 | P1 |
| 7 | **East — West Bengal, Sikkim** sessions + CJM + `wb_district.json` | both | ~50 | P2 |
| 8 | **North-East — Assam + 7 NE states** sessions + CJM (all ride generic except Assam → `as_district.json`) | both | ~160 | P2 |
| 9 | **UTs + Goa** — A&N, Lakshadweep, Puducherry, Daman&Diu, Dadra&NH, Chandigarh, Goa | indian-courts.json | ~25 | P2 |
| 10 | **State Consumer Commissions (28) + metro District Consumer Commissions (~100)** | indian-courts.json | ~130 | P1 |
| 11 | **NCLT (17), NCLAT (2), DRT (38), DRAT (5)** — corporate/recovery tribunals | indian-courts.json + `tribunal_generic.json` | ~62 | P1 |
| 12 | **CAT (17), ITAT (27), Family Courts metros (~30), Labour/Industrial metros (~30)** | indian-courts.json + `cat.json`, `itat.json` | ~104 | P2 |

**Per-batch agent time estimate:** 8–25 min depending on size; total ≈ 4 hrs of agent execution across 12 dispatches.

---

## 3. New court-rule JSONs needed

| Need own rule file | Ride `district_court_generic` / `sessions_generic` |
|---|---|
| `mh_district.json`, `gj_district.json`, `ka_district.json`, `tn_district.json`, `ts_district.json`, `ap_district.json`, `kl_district.json`, `rj_district.json`, `mp_district.json`, `pb_hr_district.json` (shared P&H), `wb_district.json`, `as_district.json`, `od_district.json`, `cg_district.json` | HP, Sikkim, Goa, Tripura, Manipur, Meghalaya, Mizoram, Nagaland, Arunachal, Uttarakhand, J&K, Ladakh, all UTs |
| `cat.json`, `itat.json`, `nclt.json`, `drt.json` | `tribunal_generic` for the rest |

**~14 new rule files.** Rationale: states with regional-language cause titles, distinct case-numbering, or seal/header conventions get their own; small/uniform states ride generic.

---

## 4. Court-ID naming convention (LOCK)

`<stateId>_<type>_<city>` — **keep existing**. Refinements:
- HC benches → `<hc_id>_bench_<city>` (e.g. `bombay_hc_bench_nagpur`).
- Tribunals → `<tribunal>_<city>` (e.g. `nclt_mumbai`, `drt_chennai`, `itat_delhi`).
- Consumer → `<stateId>_consumer_state` for state commission; `<stateId>_consumer_<city>` for district.
- CJM → `<stateId>_cjm_<city>`; JMFC → `<stateId>_jmfc_<city>`.
- All lowercase, snake_case, ASCII only.

---

## 5. HIGH-PRIORITY 100 (Batch 1 contents)

Mumbai (Bombay HC + sessions + Dindoshi + city civil + NCLT-Mum + DRT-Mum + ITAT-Mum + state consumer), Bangalore (KA HC + sessions + city civil + NCLT-Blr + ITAT-Blr), Chennai (Madras HC + sessions + NCLT-Che + ITAT-Che + DRT-Che), Hyderabad (TS HC + sessions + NCLT-Hyd + ITAT-Hyd), Pune (sessions + DRT), Kolkata (Cal HC + sessions + NCLT-Kol + ITAT-Kol), Ahmedabad (GJ HC + sessions + NCLT-Ahm + ITAT-Ahm), Jaipur (RJ HC + sessions + NCLT-Jpr), Lucknow (Allahabad-Lkw + ITAT-Lkw), Indore (MP-Indore bench + NCLT-Indore), Chandigarh (P&H HC + sessions + CAT-Chd + ITAT-Chd), Cochin (NCLT-Kochi + ITAT-Kochi), Trivandrum (Kerala HC + sessions). → ~80–100 entries.

---

## 6. Phase 3 — DEFER

Railway Claims Tribunal, CESTAT (Customs/Excise/GST Appellate), AFT (Armed Forces), TDSAT (telecom), NGT benches beyond principal, Waqf Tribunals, Cooperative Tribunals, small NE district CJM courts, Lok Adalat slots, commercial division courts beyond metros, taluk-level JMFC entries, Gram Nyayalayas.

---

## Recommended dispatch sequence

**Send Batch 1 first** (high-priority metros). It unlocks ~80 entries that cover where most of our paying advocates will actually file, validates the schema across HC-bench + sessions + tribunal types in one pass, and lets us catch schema gaps **before** we 20× the dataset. Then Batch 2 (remaining HCs) → Batch 3 (MH+GJ).

**Blocker flag:** Batches 3–8 require Vishal to confirm `formattingRulesRef` keys are resolved at runtime — if a missing key crashes the renderer, we need a safe fallback to `district_court_generic` before mass-loading.

Status: **Approved for Founder review** — recommend kicking off Batch 1.

Ready for next task.
