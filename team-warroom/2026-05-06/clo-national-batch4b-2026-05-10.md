# CLO Audit — National Batch 4b (Telangana + Andhra Pradesh + Kerala)
**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Status:** Approved
**Scope:** TS + AP + KL district/sessions/CJM coverage; 3 new state-specific rule files.

---

## Summary
- Pre-batch courtId count: **473**
- Post-batch courtId count: **625** (+152)
- Files touched: 4 (1 directory + 3 new rule files)
- JSON validation: PASS on all 4 files (`python3 -m json.tool`)

## Per-state breakdown

### Telangana — 68 new courts
- 32 District & Sessions Courts (Hyderabad pre-existing from Batch 1 — skipped per instruction)
- 32 District Courts
- 4 CJMs/CMM (Hyderabad CMM, Warangal, Karimnagar, Nizamabad)
- `formattingRulesRef: ts_district` (new file)
- Districts: Adilabad, Bhadradri Kothagudem, Hanumakonda, Jagtial, Jangaon, Jayashankar Bhupalpally, Jogulamba Gadwal, Kamareddy, Karimnagar, Khammam, Komaram Bheem Asifabad, Mahabubabad, Mahabubnagar, Mancherial, Medak, Medchal-Malkajgiri, Mulugu, Nagarkurnool, Nalgonda, Narayanpet, Nirmal, Nizamabad, Peddapalli, Rajanna Sircilla, Rangareddy, Sangareddy, Siddipet, Suryapet, Vikarabad, Wanaparthy, Warangal, Yadadri Bhuvanagiri

### Andhra Pradesh — 56 new courts
- 26 District & Sessions Courts
- 26 District Courts
- 4 CJMs (Vijayawada, Visakhapatnam, Guntur, Tirupati)
- `formattingRulesRef: ap_district` (new file)
- Post-2022 reorganisation respected — all 26 districts mapped to their notified headquarters.
- Districts: Alluri Sitharama Raju, Anakapalli, Anantapur, Annamayya, Bapatla, Chittoor, East Godavari, Eluru, Guntur, Kakinada, Konaseema, Krishna, Kurnool, Nandyal, NTR, Palnadu, Parvathipuram Manyam, Prakasam, Sri Sathya Sai, Srikakulam, SPS Nellore, Tirupati, Visakhapatnam, Vizianagaram, West Godavari, YSR Kadapa

### Kerala — 28 new courts
- 12 District & Sessions Courts (Ernakulam + Thiruvananthapuram pre-existing — skipped)
- 12 District Courts
- 4 CJMs (Ernakulam, Thiruvananthapuram, Kozhikode, Thrissur)
- `formattingRulesRef: kl_district` (new file)
- Districts: Alappuzha, Idukki, Kannur, Kasaragod, Kollam, Kottayam, Kozhikode, Malappuram, Palakkad, Pathanamthitta, Thrissur, Wayanad

## New rule files

| File | Sessions nomenclature | Calendar/Magistrate | State authority |
|---|---|---|---|
| `ts_district.json` | Sessions Case No. / Spl.S.C. No. | C.C. No. | State of Telangana via Principal Secretary, Home Dept., Hyderabad |
| `ap_district.json` | S.C. No. / Spl.S.C. No. | C.C. No. | State of Andhra Pradesh via Principal Secretary, Home Dept., Amaravati |
| `kl_district.json` | S.C. No. / Spl. S.C. No. | C.C. No. / C.M.P. No. | State of Kerala via Principal Secretary, Home Dept., Thiruvananthapuram |

Each file carries the full 7-field schema: `_meta`, `courtId`, `designation`, `cause_title_format`, `party_designation`, `case_nomenclature`, `para_numbering`, `prayer_language`, `verification_format`, `supported_languages`, `formattingPreferences`, `localRules`, `e_filing_*`.

## States array update
Added `andhra_pradesh` (Andhra Pradesh) — was missing pre-batch. TS, Kerala already present.

## Compliance notes
- **Telangana:** retains A.P. Civil Rules of Practice & Circular Orders, 1980 (adapted). Hyderabad operates City Civil Court under adapted A.P. City Civil Court Act, 1972. Sessions cases conventionally written `Sessions Case No.`; special POCSO/NDPS/SC-ST cases as `Spl.S.C. No.` Supported languages include Urdu (Hyderabad bench).
- **AP:** post-2022 26-district reorganisation reflected. AP retains A.P. Civil Rules of Practice. Sessions = `S.C. No.`
- **Kerala:** operates under Kerala Civil Courts Act, 1957 and Kerala Civil Rules of Practice, 1971. Sessions = `S.C. No.`, calendar = `C.C. No.`, miscellaneous petition = `C.M.P. No.` Early e-Courts adopter — flagged in `e_filing_note`.

## Validation
```
courts OK
ts OK
ap OK
kl OK
courtId count: 625
```

## Status
- **Approved**
- Ready for Batch 5 (WB / Odisha / Punjab / Haryana / Assam / NE pending).

## File paths
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/ts_district.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/ap_district.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/kl_district.json`
