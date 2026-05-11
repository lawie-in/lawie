# CLO National Court Coverage — Batch 8a Audit

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Scope:** Assam sessions / district / CJM courts + `as_district` formatting rule file
**Status:** Approved

---

## 1. Files touched

| File | Action |
|---|---|
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json` | Updated — `_meta.batch_8a` entry added, `assam` added to `states[]`, 75 court entries appended |
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/as_district.json` | NEW — full 7-field schema + `_meta` |

---

## 2. Court entry counts

| Metric | Value |
|---|---|
| Total courts (before) | 1239 |
| Total courts (after)  | 1314 |
| Delta                 | +75 |
| Assam entries added   | 75 (35 sessions + 35 district + 5 CJM) |
| Pre-existing Assam HC | 1 (Gauhati HC, unchanged) |
| Assam total in registry | 76 |

JSON validity — both files parse successfully via `python3 -c json.load`.

---

## 3. Districts covered (35, post-2022 reorganisation)

| # | District | HQ city | sessions courtId | district courtId | Notes |
|---|---|---|---|---|---|
| 1 | Bajali | Pathsala | as_sessions_bajali | as_district_bajali | 2021 carve-out from Barpeta |
| 2 | Baksa | Mushalpur | as_sessions_baksa | as_district_baksa | BTR — Bodo recognised |
| 3 | Barpeta | Barpeta | as_sessions_barpeta | as_district_barpeta | Parent of Bajali |
| 4 | Biswanath | Biswanath Chariali | as_sessions_biswanath | as_district_biswanath | 2015 carve-out from Sonitpur |
| 5 | Bongaigaon | Bongaigaon | as_sessions_bongaigaon | as_district_bongaigaon | |
| 6 | Cachar | Silchar | as_sessions_cachar | as_district_cachar | Barak Valley — Bengali |
| 7 | Charaideo | Sonari | as_sessions_charaideo | as_district_charaideo | 2015 carve-out from Sivasagar |
| 8 | Chirang | Kajalgaon | as_sessions_chirang | as_district_chirang | BTR — Bodo |
| 9 | Darrang | Mangaldoi | as_sessions_darrang | as_district_darrang | |
| 10 | Dhemaji | Dhemaji | as_sessions_dhemaji | as_district_dhemaji | |
| 11 | Dhubri | Dhubri | as_sessions_dhubri | as_district_dhubri | International border — FT references |
| 12 | Dibrugarh | Dibrugarh | as_sessions_dibrugarh | as_district_dibrugarh | Upper Assam tea/oil belt |
| 13 | Dima Hasao | Haflong | as_sessions_dima_hasao | as_district_dima_hasao | Sixth Schedule autonomous |
| 14 | Goalpara | Goalpara | as_sessions_goalpara | as_district_goalpara | |
| 15 | Golaghat | Golaghat | as_sessions_golaghat | as_district_golaghat | |
| 16 | Hailakandi | Hailakandi | as_sessions_hailakandi | as_district_hailakandi | Barak Valley — Bengali |
| 17 | Hojai | Hojai | as_sessions_hojai | as_district_hojai | 2015 carve-out from Nagaon |
| 18 | Jorhat | Jorhat | as_sessions_jorhat | as_district_jorhat | Parent of Majuli |
| 19 | Kamrup | Amingaon | as_sessions_kamrup | as_district_kamrup | Rural Kamrup, distinct from Metro |
| 20 | Kamrup Metropolitan | Guwahati | as_sessions_kamrup_metropolitan | as_district_kamrup_metropolitan | Principal sessions seat |
| 21 | Karbi Anglong | Diphu | as_sessions_karbi_anglong | as_district_karbi_anglong | Sixth Schedule autonomous |
| 22 | Karimganj | Karimganj | as_sessions_karimganj | as_district_karimganj | Barak Valley + border |
| 23 | Kokrajhar | Kokrajhar | as_sessions_kokrajhar | as_district_kokrajhar | BTR HQ — Bodo |
| 24 | Lakhimpur | North Lakhimpur | as_sessions_lakhimpur | as_district_lakhimpur | |
| 25 | Majuli | Garamur | as_sessions_majuli | as_district_majuli | 2016 carve-out from Jorhat; seasonal |
| 26 | Morigaon | Morigaon | as_sessions_morigaon | as_district_morigaon | |
| 27 | Nagaon | Nagaon | as_sessions_nagaon | as_district_nagaon | Parent of Hojai |
| 28 | Nalbari | Nalbari | as_sessions_nalbari | as_district_nalbari | |
| 29 | Sivasagar | Sivasagar | as_sessions_sivasagar | as_district_sivasagar | Parent of Charaideo |
| 30 | Sonitpur | Tezpur | as_sessions_sonitpur | as_district_sonitpur | Parent of Biswanath |
| 31 | South Salmara-Mankachar | Hatsingimari | as_sessions_south_salmara_mankachar | as_district_south_salmara_mankachar | 2016 carve-out from Dhubri |
| 32 | Tamulpur | Tamulpur | as_sessions_tamulpur | as_district_tamulpur | 2022 BTR carve-out from Baksa |
| 33 | Tinsukia | Tinsukia | as_sessions_tinsukia | as_district_tinsukia | Easternmost Upper Assam |
| 34 | Udalguri | Udalguri | as_sessions_udalguri | as_district_udalguri | BTR — Bodo |
| 35 | West Karbi Anglong | Hamren | as_sessions_west_karbi_anglong | as_district_west_karbi_anglong | 2016 carve-out from Karbi Anglong |

All 70 (35 sessions + 35 district) entries use `formattingRulesRef: "as_district"`.

---

## 4. CJMs added (5)

| courtId | City | formattingRulesRef |
|---|---|---|
| as_cjm_guwahati | Guwahati | cjm_generic |
| as_cjm_dibrugarh | Dibrugarh | cjm_generic |
| as_cjm_silchar | Silchar | cjm_generic |
| as_cjm_jorhat | Jorhat | cjm_generic |
| as_cjm_tezpur | Tezpur | cjm_generic |

---

## 5. `as_district.json` rule file — key fields

- **State party (verified per spec):** "State of Assam through the Principal Secretary, Home Department, Government of Assam, Dispur (Guwahati)"
- **Designation:** "IN THE COURT OF DISTRICT & SESSIONS JUDGE"
- **Jurisdiction note:** Cites Bengal, Agra and Assam Civil Courts Act 1887 + Gauhati HC Practice Directions; flags 35-district post-2022 structure; languages (Assamese / English / Bengali in Barak Valley / Bodo in BTR).
- **Case nomenclature:** Crl. Misc. (Bail), Crl. Misc. (A.B.), Sessions Case, G.R. Case, Title Suit, etc. — Sanhita-stack compliant (BNSS references in localRules).
- **Para numbering:** numeric `1.`
- **Prayer language:** respectful, standard north-east convention.
- **Verification format:** standard solemn affirmation with knowledge / information split.
- **Languages:** `en`, `as`, `bn`.
- **localRules (11):** language regime (Asm/En/Bn/Brx by district group), bail S.483 BNSS disclosure, AB S.482 BNSS, vakalatnama under Gauhati HC Rules, court-fee under Assam (Amendment) Act, SC/ST + POCSO + NDPS special courts, Sixth Schedule autonomous council customary courts (Dima Hasao, Karbi Anglong, BTR), formation-phase districts caveat, Foreigners' Tribunal references in border districts.
- **e-Filing:** not mandatory; operational at major HQs.

---

## 6. Risks / open items

| Item | Severity | Action |
|---|---|---|
| 8 sessions establishments are in "formation phase" (Bajali, Charaideo, Hojai, Majuli, Pakyong-equivalents, South Salmara-Mankachar, Tamulpur, West Karbi Anglong) — matters often heard at parent district | **Risk** | jurisdictionNote captures this; UI should surface caveat to advocate on selection |
| Sixth Schedule autonomous councils (Karbi Anglong, West Karbi Anglong, Dima Hasao, BTR districts) have parallel customary courts | **Risk** | localRules flag; advocate must confirm forum before filing |
| Bodo language (`brx`) added to `supportedLanguages` on 5 BTR districts; downstream renderer should not break on unrecognised ISO code | **Risk** | Vishal to confirm renderer tolerates `brx` — file as Jira if needed |
| Foreigners' Tribunal references in Dhubri / Karimganj / South Salmara-Mankachar are quasi-judicial — outside regular sessions roster | **Acceptable** | localRules note; not in scope of district court schema |
| Sub-divisional courts (e.g., Bilasipara in Dhubri, Bokakhat in Golaghat) not added | **Acceptable** | Phase 2 — file under tribunals/sub-divisional pass |

---

## 7. `_meta` update

Appended:
```
"national_expansion_batch_8a": "2026-05-10 — Assam districts + as_district rule file, ~80 courts"
```
`phase_2_pending` updated to drop Assam from the NE list.

---

## 8. Sign-off

- JSON parse: PASS (both files)
- Schema completeness: PASS (7-field party_designation, full case_nomenclature map, 11 localRules)
- State party designation: matches spec verbatim
- Counts: 1239 → 1314 (+75); A=35, B=35, CJM=5
- **Status: Approved.**

Ready for Batch 8b (remaining NE: Meghalaya, Tripura, Manipur, Mizoram, Nagaland, Arunachal).
