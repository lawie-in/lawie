# CLO Audit — National Batch 12 (FINAL)

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Status:** Approved — JSON validated, schemas mirror tribunal_generic.

## Court count

- Before: 1650
- After:  **1734** (+84 entries)

## Breakdown by job

### Job 1 — 4 new rule files (each: 7-field schema + _meta)

| File | Scope |
|---|---|
| `cat.json` | Central Administrative Tribunal — Administrative Tribunals Act 1985; O.A./R.A./C.P. nomenclature; "Union of India through Secretary, <Ministry/Department>" as respondent template |
| `itat.json` | Income Tax Appellate Tribunal — Income Tax Act 1961 §253-255; ITA/S.A./M.A. nomenclature; ACIT/DCIT respondent template; AY field in cause title |
| `family_court.json` | Family Courts Act 1984; M.J./G&WC/M.C./H.M.O.P. nomenclature; gentle prayer tone; conciliation duty under §9; tone of pleadings guard built in |
| `labour_court.json` | Industrial Disputes Act 1947 (transitioning IR Code 2020); Industrial Reference / Complaint / I.D. nomenclature; Workman vs Employer party template; §2A direct application reminder |

### Job 2 — CAT additions (8 new; total now 18)

Already in place (Batch 1): Mumbai, Bangalore, Chennai, Hyderabad, Kolkata, Ahmedabad, Jaipur, Lucknow, Chandigarh, Ernakulam (10) — all re-linked from `tribunal_generic` → `cat`.

New: **Principal Delhi, Allahabad, Cuttack, Guwahati, Jabalpur, Jammu, Jodhpur, Patna** (8).

### Job 3 — ITAT additions (23 new; total now 34)

Already in place: Mumbai, Bangalore, Chennai, Hyderabad, Kolkata, Ahmedabad, Jaipur, Lucknow, Indore, Chandigarh, Cochin (11) — all re-linked to `itat`.

New: Delhi-A, Delhi-B, Agra, Allahabad, Amritsar, Bhopal, Bilaspur, Cuttack, Dehradun, Guwahati, Jabalpur, Jodhpur, Nagpur, Panaji, Patna, Pune, Raipur, Rajkot, Ranchi, Surat, Vadodara, Varanasi, Visakhapatnam (23).

### Job 4 — Family Courts (22 new)

Delhi (4: Tis Hazari, Patiala House, Saket, Rohini); Mumbai (2: Bandra, Dindoshi); Bengaluru, Chennai, Hyderabad (Nampally), Pune, Kolkata (Alipore), Ahmedabad, Jaipur, Lucknow, Patna, Ranchi, Bhopal, Indore, Chandigarh, Cochin, Guwahati, Bhubaneswar.

Chennai uses `H.M.O.P. No.` nomenclature per Tamil Nadu HM Rules.

### Job 5 — Labour Courts / Industrial Tribunals (31 new)

State principal seats across all 28 states + 3 UTs:
MH-Mumbai, KA-Bengaluru, TN-Chennai, TS-Hyderabad, AP-Visakhapatnam, WB-Kolkata, GJ-Ahmedabad, RJ-Jaipur, UP-Lucknow, BR-Patna, JH-Ranchi, MP-Bhopal, CG-Raipur, OD-Bhubaneswar, KL-Kochi, Chd-Chandigarh (PB+HR), HP-Shimla, UK-Dehradun, JK-Srinagar, MN-Imphal, NL-Kohima, ML-Shillong, MZ-Aizawl, AR-Itanagar, TR-Agartala, AS-Guwahati, SK-Gangtok, Delhi, GA-Panaji, AN-Port Blair, PY-Puducherry.

Maharashtra entry styled as "Industrial Court / Labour Court" reflecting MRTU & PULP Act 1971 nomenclature.

## Risks reviewed

- **Acceptable** — Family Court nomenclature `H.M.O.P.` is correct only for Tamil Nadu state; for all other states the generic `M.J. No.` is used. Future tickets may add state-specific suffixes.
- **Acceptable** — Labour Court structure varies materially by state (e.g. Maharashtra has separate Industrial + Labour Courts; UP has Adhikarans). Single state-seat entry per state is sufficient for cause-title rendering; sub-jurisdictions deferred to Phase 3.
- **Acceptable** — CAT Principal Bench at New Delhi distinguished from the regional Delhi-area Allahabad bench (UP).
- **Risk (low)** — ITAT Delhi has multiple benches (A through I); only A and B encoded. Sufficient for cause-title resolution; the bench letter is editable by the advocate at draft time.
- **Approved** — All 11 pre-existing CAT/ITAT entries re-linked from `tribunal_generic` to dedicated `cat`/`itat` rule refs. No data loss.

## JSON validation

```
courts JSON OK; count= 1734
cat OK
itat OK
family OK
labour OK
```

## Files touched

- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/cat.json` (new)
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/itat.json` (new)
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/family_court.json` (new)
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/labour_court.json` (new)

Ready for next task.
