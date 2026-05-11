# CLO National Court Coverage — Batch 7 Audit
**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Batch:** 7 of 12 — West Bengal + Sikkim district / sessions / CJM
**Status:** APPROVED — shipped to /apps/drafting/src/config/

---

## Scope delivered

### Job 1 — 2 new state rule JSONs
| File | State string | Status |
|---|---|---|
| `/apps/drafting/src/config/court-rules/wb_district.json` | "State of West Bengal through the Principal Secretary, Home (Police) Department, Government of West Bengal, Kolkata" | Approved |
| `/apps/drafting/src/config/court-rules/sk_district.json` | "State of Sikkim through the Principal Secretary, Home Department, Government of Sikkim, Gangtok" | Approved |

Both follow standard 7-field schema + `_meta`: `cause_title_format`, `party_designation`, `case_nomenclature`, `para_numbering`, `prayer_language`, `verification_format`, `localRules`. Both include `formattingPreferences`, `supported_languages`, `e_filing_mandatory`, `e_filing_note`, `jurisdictionNote`.

### Job 2 — West Bengal district courts (20 new districts × 2 + 4 CJM = 44 entries)

Skipped already-added from Batch 1: Kolkata (sessions), North 24 Parganas (district), South 24 Parganas (district).

| District | HQ city | Sessions courtId | District courtId |
|---|---|---|---|
| Alipurduar | Alipurduar | `wb_sessions_alipurduar` | `wb_district_alipurduar` |
| Bankura | Bankura | `wb_sessions_bankura` | `wb_district_bankura` |
| Birbhum | Suri | `wb_sessions_birbhum` | `wb_district_birbhum` |
| Cooch Behar | Cooch Behar | `wb_sessions_cooch_behar` | `wb_district_cooch_behar` |
| Dakshin Dinajpur | Balurghat | `wb_sessions_dakshin_dinajpur` | `wb_district_dakshin_dinajpur` |
| Darjeeling | Darjeeling | `wb_sessions_darjeeling` | `wb_district_darjeeling` |
| Hooghly | Chinsurah | `wb_sessions_hooghly` | `wb_district_hooghly` |
| Howrah | Howrah | `wb_sessions_howrah` | `wb_district_howrah` |
| Jalpaiguri | Jalpaiguri | `wb_sessions_jalpaiguri` | `wb_district_jalpaiguri` |
| Jhargram | Jhargram | `wb_sessions_jhargram` | `wb_district_jhargram` |
| Kalimpong | Kalimpong | `wb_sessions_kalimpong` | `wb_district_kalimpong` |
| Malda | English Bazar | `wb_sessions_malda` | `wb_district_malda` |
| Murshidabad | Berhampore | `wb_sessions_murshidabad` | `wb_district_murshidabad` |
| Nadia | Krishnanagar | `wb_sessions_nadia` | `wb_district_nadia` |
| Paschim Bardhaman | Asansol | `wb_sessions_paschim_bardhaman` | `wb_district_paschim_bardhaman` |
| Paschim Medinipur | Midnapore | `wb_sessions_paschim_medinipur` | `wb_district_paschim_medinipur` |
| Purba Bardhaman | Burdwan | `wb_sessions_purba_bardhaman` | `wb_district_purba_bardhaman` |
| Purba Medinipur | Tamluk | `wb_sessions_purba_medinipur` | `wb_district_purba_medinipur` |
| Purulia | Purulia | `wb_sessions_purulia` | `wb_district_purulia` |
| Uttar Dinajpur | Raiganj | `wb_sessions_uttar_dinajpur` | `wb_district_uttar_dinajpur` |

CJMs (4): `wb_cjm_kolkata` (Alipore), `wb_cjm_howrah`, `wb_cjm_darjeeling`, `wb_cjm_murshidabad` — all `formattingRulesRef: cjm_generic`.

All WB sessions/district entries `formattingRulesRef: wb_district`. Languages: `["en","bn"]`; Darjeeling + Kalimpong add `"ne"` (Nepali).

### Job 3 — Sikkim district courts (6 districts × 2 + 1 CJM = 13 entries)

Six-district reorganisation of 2021 reflected (Pakyong + Soreng).

| District | HQ city | Sessions courtId | District courtId |
|---|---|---|---|
| Gangtok (East) | Gangtok | `sk_sessions_gangtok` | `sk_district_gangtok` |
| Gyalshing (West) | Gyalshing | `sk_sessions_gyalshing` | `sk_district_gyalshing` |
| Mangan (North) | Mangan | `sk_sessions_mangan` | `sk_district_mangan` |
| Namchi (South) | Namchi | `sk_sessions_namchi` | `sk_district_namchi` |
| Pakyong | Pakyong | `sk_sessions_pakyong` | `sk_district_pakyong` |
| Soreng | Soreng | `sk_sessions_soreng` | `sk_district_soreng` |

CJM (1): `sk_cjm_gangtok` — `formattingRulesRef: cjm_generic`.

All SK sessions/district entries `formattingRulesRef: sk_district`. Languages: `["en","ne"]`.

Pakyong and Soreng entries carry `jurisdictionNote` flagging that the sessions establishment is in formation phase (post-2021 reorg); matters partly heard at parent districts pending full notification.

---

## Legal correctness checks (CLO-signed)

| Check | Result |
|---|---|
| BNS / BNSS / BSA naming used in `localRules` (S.482, S.483 BNSS for AB and bail) | Pass |
| State-of-X cause title party designation precise (Home / Home (Police) Dept) | Pass |
| Bengali script support flagged (`bn`) for WB; Nepali (`ne`) for Sikkim + WB hills | Pass |
| Calcutta HC Civil Rules and Orders referenced for vakalatnama | Pass |
| Sikkim Article 371F preservation noted (subjects regulation, land law) | Pass |
| WB City Civil Court at Calcutta + Presidency Magistrate courts called out as separate establishments | Pass |
| 2021 Sikkim reorganisation (Pakyong + Soreng) reflected with formation-phase note | Pass |
| Court-fee state amendments referenced (WB Court-Fees Act 1972; Sikkim adaptation) | Pass |
| Special Courts (POCSO/NDPS/SC-ST Atrocities) coverage noted | Pass |

---

## Validation

- JSON parse: PASS (Python `json.load` on all 3 files)
- Duplicate `courtId` scan: 0 duplicates
- Total court count: 1182 → 1239 (delta +57)
- WB delta: +44 (20 sessions + 20 district + 4 CJM)
- SK delta: +13 (6 sessions + 6 district + 1 CJM)
- States array: added `{ "id": "sikkim", "name": "Sikkim" }` (Sikkim missing pre-batch)
- `_meta.national_expansion_batch_7` recorded
- `phase_2_pending` updated — WB removed, NE-six remain

---

## Files touched

1. `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json` — +57 court entries, +1 state entry, _meta update
2. `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/wb_district.json` — NEW
3. `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/sk_district.json` — NEW

## Risks / follow-ups

- Risk: Pakyong + Soreng sessions infrastructure is still in formation; advocate users in these districts should be advised to confirm cause-title with the local Bar before filing. Mitigated by inline `jurisdictionNote`. Acceptable.
- Risk: Kolkata's City Civil Court / City Sessions Court / Presidency Magistrate courts (Bankshall Street) are NOT modelled here — those are separate establishments under separate statutes. To be added as a dedicated micro-batch with a `wb_city_civil` rules file. Open. Will flag for Batch 8 or a parallel sweep.
- Risk: Andaman & Nicobar (Port Blair) sessions/district courts are administratively under Calcutta HC but were skipped this batch — to handle as part of UT sweep.
- Phase 2 remaining: Assam, Meghalaya, Tripura, Manipur, Mizoram, Nagaland, Arunachal (NE seven minus Sikkim). Batch 8 target.

Ready for Batch 8.
