# CLO National Batch 9 — Goa + UTs

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Scope:** Goa + remaining UTs (A&N, Lakshadweep, Puducherry, DNH-DD)

## Result

- **Courts before:** 1500
- **Courts after:** 1531 (+31)
- **States added:** 5 (goa, andaman_nicobar, lakshadweep, puducherry, dnh_dd)
- **New rule files:** 2 (ga_district.json, an_district.json)
- **JSON validity:** All 3 files parse clean (python json.load).

## Per-state tally (deliverable line)

| State / UT | Entries added | Pattern |
|---|---|---|
| Goa | **5** | 2 sessions + 2 district + 1 CJM Panaji |
| Andaman & Nicobar | **7** | 3 sessions + 3 district + 1 CJM Port Blair |
| Lakshadweep | **3** | 1 sessions + 1 district + 1 CJM Kavaratti |
| Puducherry | **9** | 4 sessions + 4 district + 1 CJM Puducherry |
| DNH & DD | **7** | 3 sessions + 3 district + 1 CJM Silvassa |
| **Total** | **31** | |

Note: Brief estimated ~25; the literal spec (sessions + district per named city + 1 CJM per UT) computes to 31. I followed the explicit spec. Flag if you want me to consolidate any UT to a leaner pattern.

## Job 1 — New rule files

### ga_district.json
- **State respondent:** "State of Goa through the Chief Secretary, Government of Goa, Porvorim"
- **Distinct feature:** Portuguese Civil Code, 1867 still in force (s.5(1) Goa, Daman and Diu (Administration) Act, 1962). Case nomenclature includes `inventory_proceedings`: "Inventory Proceedings No. ___ of ___" for succession matters (Inventário) and `matrimonial_petition` for Civil-Code matrimonial petitions.
- **Local rules flagged:** Civil Code application (uniquely overrides HSA/ISA/Muslim Personal Law/Special Marriage Act for Goan domiciles), compulsory civil registration of marriage, Inventory Proceedings forum and party-arraying convention ("Interested Parties"), Mamlatdar/Mundkar tenancy forums, CZMA/town-planning interface.
- **HC supervision:** Bombay High Court at Goa (Panaji).
- **Languages:** en, kok, mr, pt.

### an_district.json
- **State respondent:** "Union Territory of Andaman and Nicobar Islands through the Chief Secretary, UT Administration, Port Blair"
- **HC supervision:** Calcutta High Court Circuit Bench at Port Blair — flagged in jurisdictionNote and local_rules.
- **Local rules flagged:** PAT Regulation, 1956 (Jarawa/Sentinelese/Onge/Shompen/Great Andamanese reserves) entry-permit & tribal-welfare check; A&N Land Revenue and Land Reforms Regulation, 1966 (lease-only tenure outside Port Blair municipal area); Indian Forest Act + A&N Forest Conservation Regulation; admiralty matters lie in Calcutta HC; inter-island ferry delay as recognised ground for S.5 Limitation Act condonation.
- **Languages:** en, hi, bn, ta.

## Job 2 — Other UT inline (no new rule files)

For Lakshadweep, Puducherry, and DNH-DD entries, `formattingRulesRef: "district_court_generic"` and the state-respondent text is carried inline in `jurisdictionNote`:

- **Lakshadweep** — "Union Territory of Lakshadweep through the Administrator, UT of Lakshadweep, Kavaratti" (HC: Kerala HC, Ernakulam)
- **Puducherry** — "Union Territory of Puducherry through the Chief Secretary, Government of UT of Puducherry, Puducherry" (HC: Madras HC; with Mahe → Kerala HC and Yanam → AP HC enclave caveats noted in those entries)
- **DNH & DD** — "Union Territory of Dadra & Nagar Haveli and Daman & Diu through the Administrator, Silvassa" (HC: Bombay HC)

## Risks / Blockers / Acceptable

| Item | Status |
|---|---|
| Goa Civil Code case nomenclature (Inventory Proceedings) | Acceptable — captured in ga_district `case_nomenclature.inventory_proceedings` + `local_rules` |
| Mahe → Kerala HC, Yanam → AP HC enclave routing | Risk — partial mitigation via per-court `jurisdictionNote`; advocate must still verify forum for the cause of action. Recommend Vishal expose `jurisdictionNote` in the editor preview so the user sees it before signing. |
| A&N Circuit Bench (Calcutta HC) HC entry already exists at `calcutta_hc_port_blair_circuit` | Acceptable — kept under West Bengal stateId as-is (pre-existing). District-level UT entries point to new `an_district` rules. |
| Lakshadweep CJM — single-CJM, single-district reality | Acceptable — schema followed; no over-modelling. |
| Brief said ~25, delivered 31 | Risk — flagging for founder. Math from the explicit spec yields 31; the variance comes from "1 CJM per UT" + per-city sessions+district. No silent reductions. |
| Court-fee, e-filing detail | Acceptable — captured in rule files; e-filing flagged not-mandatory at all 5 UT/state levels. |

## _meta updates

Added: `"national_expansion_batch_9": "2026-05-10 — Goa + 4 UTs + 2 new state rule files, ~25 courts"` (string kept verbatim per founder direction, even though actual count is 31).

Updated: `phase_2_pending` no longer lists "remaining UTs (Puducherry, A&N, D&N Haveli, Lakshadweep)" — now only tribunals + commercial divisions.

## Files touched

- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json` (1500 → 1531 courts; +5 states; _meta updated)
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/ga_district.json` (new)
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/an_district.json` (new)

Ready for Batch 10.
