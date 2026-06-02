# CLO Audit — National Batch 6a (PB + HR + HP)
**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Status:** Approved

## Scope
Punjab, Haryana, Himachal Pradesh district court coverage.
PB + HR share the common Punjab & Haryana High Court at Chandigarh; HP has its own High Court at Shimla.

## Counts
- Courts before: 977
- Courts after: **1102**
- New entries: **125**

| State | Sessions | District | CJM | Subtotal |
|-------|----------|----------|-----|----------|
| Punjab | 23 | 23 | 4 | 50 |
| Haryana | 22 | 22 | 4 | 48 |
| Himachal Pradesh | 12 | 12 | 3 | 27 |
| **Total** | **57** | **57** | **11** | **125** |

Unique IDs: 1102 / 1102 (no collisions).

## New state rule files (3)
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/pb_district.json` — Punjab; state line = "State of Punjab through the Principal Secretary, Home Department, Government of Punjab, Chandigarh"; languages en/pa/hi.
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/hr_district.json` — Haryana; state line = "State of Haryana through the Principal Secretary, Home Department, Government of Haryana, Chandigarh"; languages en/hi.
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/hp_district.json` — Himachal Pradesh; state line = "State of Himachal Pradesh through the Principal Secretary, Home Department, Government of Himachal Pradesh, Shimla"; languages en/hi.

All three use the 7-field schema (_meta + cause_title + party_designation + case_nomenclature + para_numbering + prayer_language + verification_format + localRules) consistent with prior batches.

## States array additions
Added 3 entries to `states[]`:
- `{ "id": "punjab", "name": "Punjab" }`
- `{ "id": "haryana", "name": "Haryana" }`
- `{ "id": "himachal_pradesh", "name": "Himachal Pradesh" }`

## _meta update
Added:
```
"national_expansion_batch_6a": "2026-05-10 — PB + HR + HP districts + 3 new state rule files, ~130 courts"
```
`phase_2_pending` revised to drop PB/HR (now done), still pending: WB / Assam / NE / J&K / Uttarakhand district courts; specialty tribunals.

## Legal correctness notes
- **Punjab cause titles** — Punjabi (Gurmukhi) is statutory subordinate-court language under the Punjab Official Language Act, 1967 + Punjab State Language Act, 2008; pleadings before P&H HC remain English. Encoded as supportedLanguages = [en, pa, hi].
- **Haryana cause titles** — Hindi is statutory subordinate-court language under the Haryana Official Language Act, 1969. en/hi.
- **HP cause titles** — Hindi under the Himachal Pradesh Official Language Act, 1975. en/hi.
- **BNSS references** — All three rule files cite S.482 BNSS (anticipatory bail) and S.483 BNSS (regular bail), consistent with the post-2024 Sanhita stack.
- **Vakalatnama / court-fee** — PB & HR reference P&H High Court Rules and Orders Vol V; HP references HP HC Rules, 1952.
- **CJM picks** — PB: Amritsar, Ludhiana, Patiala, Jalandhar (top 4 by docket). HR: Gurugram, Faridabad, Rohtak, Hisar (NCR + western Haryana). HP: Shimla, Dharamshala (Kangra dist HQ), Mandi.

## Validation
`python3 -m json.tool` run against all 4 files — all VALID JSON.
```
indian-courts.json          VALID JSON
pb_district.json            VALID JSON
hr_district.json            VALID JSON
hp_district.json            VALID JSON
```

## Status: Approved
Ready for Vishal to wire formattingRulesRef lookups for `pb_district`, `hr_district`, `hp_district`.

## Files touched (absolute paths)
- /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json
- /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/pb_district.json (new)
- /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/hr_district.json (new)
- /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/hp_district.json (new)

Next: Batch 6b (likely WB + Assam + NE or J&K + Uttarakhand).
