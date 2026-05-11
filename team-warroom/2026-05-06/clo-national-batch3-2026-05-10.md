# CLO National Court Expansion — Batch 3 of 12

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Scope:** Maharashtra + Gujarat sessions / district / CJM courts
**Status:** Complete. JSON valid (3/3).

---

## Headline

- `indian-courts.json`: **191 -> 331** entries (+140 net additions).
- 2 new state-specific rule files created: `mh_district.json`, `gj_district.json`.
- All 3 modified files pass `python3 -m json.tool`.

---

## Files touched

| File | Change |
|---|---|
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json` | +140 court entries; `_meta.national_expansion_batch_3` stamped; `phase_2_pending` trimmed (MH + GJ removed) |
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/mh_district.json` | NEW — Maharashtra district & sessions rules |
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/gj_district.json` | NEW — Gujarat district & sessions rules |

---

## Maharashtra — 71 new entries

### Sessions (33 new)
Thane, Palghar, Raigad (Alibag), Ratnagiri, Sindhudurg (Oros), Satara, Sangli, Kolhapur, Solapur, Ahmednagar, Nashik, Dhule, Jalgaon, Nandurbar, Aurangabad (Chh. Sambhajinagar), Jalna, Beed, Latur, Dharashiv (Osmanabad), Nanded, Hingoli, Parbhani, Buldhana, Akola, Washim, Amravati, Yavatmal, Wardha, Nagpur, Bhandara, Gondia, Chandrapur, Gadchiroli.

### District (33 new)
Same 33 districts above, mirrored as `mh_district_<city>` entries.

### CJM (5 new)
Mumbai (CMM Esplanade), Pune, Nagpur, Aurangabad (Chh. Sambhajinagar), Nashik.

### Skipped (already in file from Batch 1)
- `mh_sessions_mumbai_city`
- `mh_sessions_mumbai_suburban`
- `mh_district_mumbai`
- `mh_sessions_pune`
- `mh_district_pune`

### Sanhita renaming notes embedded
- Aurangabad -> Chhatrapati Sambhajinagar (2023 notification) — `jurisdictionNote` flags both names.
- Osmanabad -> Dharashiv (2023 notification) — same treatment.

---

## Gujarat — 69 new entries

### Sessions (32 new)
Gandhinagar, Mehsana, Patan, Banaskantha (Palanpur), Sabarkantha (Himatnagar), Aravalli (Modasa), Mahisagar (Lunawada), Panchmahal (Godhra), Dahod, Vadodara, Chhota Udaipur, Bharuch, Narmada (Rajpipla), Surat, Tapi (Vyara), Navsari, Valsad, Dang (Ahwa), Anand, Kheda (Nadiad), Botad, Bhavnagar, Amreli, Junagadh, Gir Somnath (Veraval), Porbandar, Devbhumi Dwarka (Khambhalia), Jamnagar, Rajkot, Morbi, Surendranagar, Kutch (Bhuj).

### District (32 new)
Same 32 districts above, mirrored as `gj_district_<city>` entries.

### CJM (5 new)
Ahmedabad (CMM), Surat, Vadodara, Rajkot, Bhavnagar.

### Skipped (already in file from Batch 1)
- `gj_sessions_ahmedabad_city`
- `gj_sessions_ahmedabad_rural`

---

## New rule files — what's inside

### `mh_district.json`
- 7-field schema: `_meta`, `party_designation`, `case_nomenclature`, `para_numbering`, `prayer_language`, `verification_format`, `localRules` (plus formatting prefs, supported languages, e-filing note).
- Party designations: Petitioner / Respondent / Applicant / Plaintiff / Defendant / Complainant / Accused.
- State party: "State of Maharashtra through the Principal Secretary, Home Department, Government of Maharashtra, Mumbai".
- Case nomenclature includes Maharashtra-specific forms: **R.C.S. No.** (Regular Civil Suit), **S.C.S. No.** (Special Civil Suit), **Sessions Case No.**, **Darkhast No.** (execution), Atrocities / NDPS / POCSO Special Cases.
- Local rules cover: S.483 BNSS bail disclosure, S.482 BNSS anticipatory bail, Bombay City Civil Court Act, Marathi translation insistence, designated Special Courts.
- Supported languages: en, mr, hi.

### `gj_district.json`
- Same 7-field schema + `_meta` block with CLO ownership.
- Party designations standard set.
- State party: "State of Gujarat through the Principal Secretary, Home Department, Government of Gujarat, Gandhinagar".
- Case nomenclature: **Regular Civil Suit No.**, **Special Civil Suit No.**, **Spl. Case No.**, **NDPS / POCSO / Atrocity Spl. Case No.**, **Regular Darkhast No.** (execution), **Land Revenue Appeal No.**
- Local rules cover: S.483 / S.482 BNSS, Bombay Court Fees Act 1959 (as in force in Gujarat), Gujarat Official Language Act 1960 (Gujarati at subordinate courts), PMLA Special Court at Ahmedabad.
- Supported languages: en, gu, hi.

Both files carry the standard `change_protocol`: CLO sign-off required; Vishal raises Jira tickets, never edits unilaterally.

---

## `_meta` update

Added line in `indian-courts.json`:
```
"national_expansion_batch_3": "2026-05-10 — MH + GJ districts + 2 new state-specific rule files, ~140 courts"
```
`phase_2_pending` updated to drop Maharashtra and Gujarat from the queue. Remaining: Karnataka, Tamil Nadu, West Bengal, Telangana district courts; tribunals (NCLAT/DRT/MACT/Family/Labour); commercial divisions.

---

## Validation

```
python3 -m json.tool indian-courts.json      -> OK
python3 -m json.tool mh_district.json        -> OK
python3 -m json.tool gj_district.json        -> OK
```

---

## Risks / open items for Batch 4

- **Risk:** Vishal's renderer must learn the new `mh_district` and `gj_district` refs. Existing Mumbai/Pune entries from Batch 1 still point to `sessions_generic` / `district_court_generic` / `consumer_commission_generic` — they should be re-pointed to `mh_district` in a follow-up sweep so MH cause-titles are consistent.
- **Risk:** CMM (metropolitan magistrate) is treated as `courtType: "cjm"` for routing simplicity; the renderer should map "cjm" + designation containing "METROPOLITAN" appropriately. Flagged for Vishal.
- **Recommended action:** Batch 4 should cover Karnataka + Tamil Nadu districts with `karnataka_district` and `tamil_nadu_district` rule files (Kannada and Tamil language support).

Ready for next task.
