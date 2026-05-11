# CLO National Expansion — Batch 11 Audit (2026-05-10)

Owner: Ajay (CLO)
Scope: NCLT benches + DRT locations + 3 new tribunal rule files; re-link existing tribunal entries.

---

## 1. New rule files created

| File | Path | Purpose |
|---|---|---|
| `tribunal_generic.json` | `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/tribunal_generic.json` | Fallback rules for any tribunal without a dedicated file (CAT, ITAT, AAR, CESTAT, SAT, TDSAT until Batch 12) |
| `nclt.json` | `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/nclt.json` | NCLT + NCLAT — Companies Act 2013, IBC 2016 nomenclature (CP, CP(IB), IA) |
| `drt.json` | `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/drt.json` | DRT + DRAT — RDB Act 1993, SARFAESI 2002 nomenclature (O.A., S.A., Appeal) |

All three use the standard 7-field schema (cause_title_format, party_designation, case_nomenclature, para_numbering, prayer_language, verification_format, supported_languages) + `_meta`, `formattingPreferences`, `localRules`, `e_filing_mandatory`.

## 2. NCLT benches added (8 new in Batch 11)

| courtId | Bench | State |
|---|---|---|
| nclt_allahabad | Allahabad | UP |
| nclt_cuttack | Cuttack | Odisha |
| nclt_guwahati | Guwahati | Assam (NE region) |
| nclt_amaravati | Amaravati | AP |
| nclt_delhi_bench_ii | New Delhi Bench-II | Delhi |
| nclt_delhi_bench_iii | New Delhi Bench-III | Delhi |
| nclt_delhi_bench_iv | New Delhi Bench-IV | Delhi |
| nclt_delhi_bench_v | New Delhi Bench-V | Delhi |

NCLT total now in system: 19 benches (11 from Batch 1 + 8 new).
NCLAT total: 2 (Principal Delhi + Chennai bench) — unchanged.

## 3. DRT locations added (23 new in Batch 11)

| courtId | Location | State |
|---|---|---|
| drt_allahabad | Allahabad | UP |
| drt_aurangabad | Aurangabad | MH |
| drt_bhopal | Bhopal | MP |
| drt_chandigarh_2 | Chandigarh-II | Chd |
| drt_coimbatore | Coimbatore | TN |
| drt_cuttack | Cuttack | Odisha |
| drt_delhi_1 | Delhi-I | Delhi |
| drt_delhi_2 | Delhi-II | Delhi |
| drt_delhi_3 | Delhi-III | Delhi |
| drt_dehradun | Dehradun | UK |
| drt_guwahati | Guwahati | Assam |
| drt_hyderabad_2 | Hyderabad-II | TS |
| drt_jaipur_2 | Jaipur-II | RJ |
| drt_jabalpur | Jabalpur | MP |
| drt_lucknow | Lucknow | UP |
| drt_madurai | Madurai | TN |
| drt_nagpur | Nagpur | MH |
| drt_patna | Patna | Bihar |
| drt_pune | Pune | MH |
| drt_ranchi | Ranchi | Jharkhand |
| drt_siliguri | Siliguri | WB |
| drt_vijayawada | Vijayawada | AP |
| drt_visakhapatnam | Visakhapatnam | AP |

Skipped (already exist from Batch 1): Mumbai-I/II/III, Bangalore, Chennai-I/II, Hyderabad, Ahmedabad, Jaipur, Ernakulam, Chandigarh, Kolkata-I/II.

DRT total now in system: 35.
DRAT total: 5 (Mumbai, Chennai, Delhi, Kolkata, Allahabad) — unchanged.

## 4. Re-link summary (Job 2)

27 existing tribunal entries previously pointing at `tribunal_generic` (which didn't exist) re-linked:

- NCLT (11) → `formattingRulesRef: "nclt"`: nclt_principal_delhi, nclt_mumbai, nclt_bengaluru, nclt_chennai, nclt_hyderabad, nclt_kolkata, nclt_ahmedabad, nclt_jaipur, nclt_indore, nclt_chandigarh, nclt_kochi.
- NCLAT (2) → `formattingRulesRef: "nclt"`: nclat_delhi, nclat_chennai_bench.
- DRT (9) → `formattingRulesRef: "drt"`: drt_mumbai_1, drt_mumbai_2, drt_mumbai_3, drt_bangalore, drt_chennai_1, drt_chennai_2, drt_hyderabad, drt_kolkata_1, drt_kolkata_2, drt_ahmedabad, drt_chandigarh, drt_ernakulam.
- DRAT (5) → `formattingRulesRef: "drt"`: drat_mumbai, drat_chennai, drat_delhi, drat_kolkata, drat_allahabad.

**Total re-linked: 27 entries** (11 NCLT + 2 NCLAT + 9 DRT + 5 DRAT).

CAT and ITAT entries (21 total) intentionally left on `tribunal_generic` — Batch 12 will give them dedicated rule files.

## 5. Counts

- Courts before Batch 11: **1619**
- Courts after Batch 11: **1650** (+31: 8 NCLT + 23 DRT)
- New rule files: 3
- Re-linked entries: 27

## 6. Rule-file distribution among `courtType: tribunal`

| Rule file | Tribunal entries pointing to it |
|---|---|
| drt | 40 |
| nclt | 21 |
| tribunal_generic | 21 (CAT + ITAT — Batch 12 work) |
| ncdrc | 1 |

## 7. Tribunal entries still on `tribunal_generic` — Batch 12 reference list

CAT benches (9): cat_mumbai, cat_bangalore, cat_chennai, cat_hyderabad, cat_kolkata, cat_ahmedabad, cat_jaipur, cat_lucknow, cat_chandigarh, cat_ernakulam.

ITAT benches (11): itat_mumbai, itat_bangalore, itat_chennai, itat_hyderabad, itat_kolkata, itat_ahmedabad, itat_jaipur, itat_lucknow, itat_indore, itat_chandigarh, itat_cochin.

**Batch 12 must create:** `cat.json`, `itat.json` (and ideally `aar.json`, `cestat.json`, `sat.json`, `tdsat.json` if those tribunals get added). Re-link CAT entries → `cat`, ITAT entries → `itat`.

## 8. JSON validity

All four files parsed successfully via `python3 -c "json.load(open(...))"`:
- indian-courts.json — VALID
- tribunal_generic.json — VALID
- nclt.json — VALID
- drt.json — VALID

## 9. `_meta` log entry added

```
"national_expansion_batch_11": "2026-05-10 — NCLT benches + DRT locations + 3 new tribunal rule files; existing tribunal entries re-linked from tribunal_generic to nclt/drt where applicable"
```

## 10. Risk register

- **Risk (Acceptable):** Delhi NCLT Bench-II through V — MCA has notified multiple Principal-Bench rooms in Delhi; exact roster names may be Bench A/B/C in court use. Cause-title still resolves correctly because all map to `formattingRulesRef: "nclt"`. Advocate can override the literal designation string at draft time.
- **Risk (Acceptable):** DRT Chandigarh-II and Hyderabad-II, Jaipur-II — included per founder list; some may be additional benches at same registry. Functionally identical rule-binding.
- **Blocker (next batch):** 21 CAT/ITAT entries still on fallback `tribunal_generic` — works but suboptimal (CAT uses O.A. nomenclature with CAT-Rules 1987 verification language; ITAT uses ITA nomenclature with Income Tax Appellate Tribunal Rules 1963 procedure). Batch 12 must produce `cat.json` and `itat.json`.

## Status: Approved

Files at:
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/tribunal_generic.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/nclt.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/drt.json`

Ready for next task.
