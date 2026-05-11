# CLO Audit — National Batch 8b (NE States) — 2026-05-10

**Owner:** Ajay (CLO)
**Status:** Approved — JSON valid on all 7 files
**Scope:** Manipur + Meghalaya + Mizoram + Nagaland + Tripura + Arunachal Pradesh district + sessions + CJM courts. 6 new state rule files.

## Court count delta
- Before: 1314 entries in `indian-courts.json`
- After: 1500 entries (+186)

## Per-state added entries (this batch only)
| State | stateId | Sessions | District | CJM | Subtotal |
|---|---|---:|---:|---:|---:|
| Manipur | `manipur` | 16 | 16 | 1 | 33 |
| Meghalaya | `meghalaya` | 12 | 12 | 1 | 25 |
| Mizoram | `mizoram` | 11 | 11 | 1 | 23 |
| Nagaland | `nagaland` | 17 | 17 | 1 | 35 |
| Tripura | `tripura` | 8 | 8 | 1 | 17 |
| Arunachal Pradesh | `arunachal_pradesh` | 26 | 26 | 1 | 53 |
| **Total added** | | **90** | **90** | **6** | **186** |

Note: AR brief header said "25 districts" but enumerated 26; I went with the actual 26-district list (current AP roster post Pakke Kessang, Shi Yomi, Lepa Rada, Kamle reorganisations).

## New rule files (6)
All in `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/`:
- `mn_district.json` — State of Manipur, Imphal — supported_languages [en, mni]
- `ml_district.json` — State of Meghalaya, Shillong — supported_languages [en, kha, grt] — Sixth Schedule (KHADC, JHADC, GHADC) overlap note
- `mz_district.json` — State of Mizoram, Aizawl — supported_languages [en, lus] — Sixth Schedule (Chakma/Lai/Mara ADCs) overlap note
- `nl_district.json` — State of Nagaland, Kohima — supported_languages [en] — Article 371A + customary courts note
- `tr_district.json` — State of Tripura, Agartala — supported_languages [en, bn, trp] — TTAADC Sixth Schedule overlap note
- `ar_district.json` — State of Arunachal Pradesh, Itanagar — supported_languages [en] — Assam Frontier Regulation 1945 + Gaon Bura/Kebang note + ILP regime note

All 6 follow the 7-field schema + `_meta` exactly as `as_district.json` template; only state-specific jurisdiction notes and local rules vary.

## Schema compliance
Every new court entry carries:
- `courtId` (slugged: `<sl>_<type>_<district>`)
- `name`, `designation` (uppercase), `courtType` (sessions / district_court / cjm)
- `state`, `stateId`, `city` (headquarters city, not district label when they differ)
- `formattingRulesRef` (state's own `<sl>_district` file, except CJM → `cjm_generic`)
- `caseNomenclature`, `supportedLanguages`

For mismatched district / hq pairs (e.g. Dhalai → Ambassa, Anjaw → Hawai, Papum Pare → Yupia, Tirap → Khonsa, Lower Subansiri → Ziro, etc.) court name and designation include "AT <city>" form.

## _meta updates in `indian-courts.json`
- Added `national_expansion_batch_8b` entry: "2026-05-10 — 6 NE states districts + 6 new state rule files, ~200 courts"
- Updated `phase_2_pending` — removed NE states (now complete); now reads: "NCLAT/DRT/MACT/Family/Labour tribunals; commercial divisions; remaining UTs (Puducherry, A&N, D&N Haveli, Lakshadweep)"
- Added 6 state ID entries to the `states` array: manipur, meghalaya, mizoram, nagaland, tripura, arunachal_pradesh.

## JSON validity
`python3 -m json.tool` returns OK on all 7 files:
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json` — OK (1500 courts)
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/mn_district.json` — OK
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/ml_district.json` — OK
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/mz_district.json` — OK
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/nl_district.json` — OK
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/tr_district.json` — OK
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/ar_district.json` — OK

Duplicate courtId check: none.

## Legal posture risks (CLO sign-off context)
- **Risk** — Sixth Schedule customary court overlap (ML, MZ, TR) and Art. 371A customary courts (NL) and Assam Frontier Regulation 1945 (AR) mean a non-trivial share of civil / family / land matters in these states fall outside regular sessions / district court jurisdiction. The local rules note in each rule file flags this; advocate must verify forum.
- **Risk** — Newly-carved districts in AP (Kamle, Shi Yomi, Lepa Rada, Pakke Kessang) and Nagaland (Tseminyu, Niuland, Chümoukedima, Shamator, Meluri) may not yet have fully constituted sessions/district establishments — matters partly heard at parent district HQ. Acceptable for cause-title rendering; user advocate must confirm filing forum.
- **Acceptable** — Language coverage: NL and AR confined to English by State statute / convention; ML supports Khasi (kha) + Garo (grt) translation; TR supports Bengali + Kokborok (trp); MZ supports Mizo (lus); MN supports Manipuri (mni).
- **Acceptable** — No tribunal / Family / Labour / Commercial division coverage in this batch (deferred to Phase 2 per `phase_2_pending`).

## Status
- Approved for production. Vishal to run smoke test on cause-title rendering for 3 sample courts per state before Batch 9.

Ready for next task.
