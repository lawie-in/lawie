# CLO Audit — National Court Expansion Batch 5b

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Scope:** Chhattisgarh + Odisha sessions, district & CJM courts + 2 new state rule files

---

## Headline numbers

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Total court entries in `indian-courts.json` | 843 | 977 | +134 |
| Chhattisgarh courts | 0 | 70 | +70 |
| Odisha courts | 0 | 64 | +64 |
| State-specific rule files | (existing N) | +2 | `cg_district.json`, `od_district.json` |

All three files parsed by `python3 json.load` — VALID. Zero duplicate `courtId`s in the directory.

---

## Files touched

| Path | Action |
|---|---|
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json` | edited — `_meta` updated, `states[]` extended (+chhattisgarh, +odisha), 134 court entries appended |
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/cg_district.json` | NEW — 7 standard fields + `_meta` |
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/od_district.json` | NEW — 7 standard fields + `_meta` |

---

## Job 1 — State rule files

Both files mirror the `rj_district` schema. Key per-state distinctions:

### `cg_district.json`
- **State party designation:** "State of Chhattisgarh through the Principal Secretary, Home Department, Government of Chhattisgarh, Raipur"
- **Case nomenclature:** Uses Madhya Pradesh-pedigree forms (M.Cr.C., S.T. No., M.Cr.C. (Bail), M.Cr.C. (A.B.)) — consistent with the parent MP Civil Courts Act, 1958 as adopted by CG in 2000.
- **Supported languages:** `en`, `hi`
- **Local rules covered:** Chhattisgarh Rajbhasha Adhiniyam, 2007; CG High Court Rules; CG Court-Fees Act (adopted); Special Courts for SC/ST atrocities, POCSO, NDPS; Chhattisgarh Vishesh Jan Suraksha Adhiniyam, 2005; 2022 reorganisation note (4 new districts: Khairagarh-Chhuikhadan-Gandai, Manendragarh-Chirmiri-Bharatpur, Mohla-Manpur-Ambagarh Chowki, Sakti).
- **e-Filing:** operational at Bilaspur, Raipur, Durg; not yet mandatory state-wide.

### `od_district.json`
- **State party designation:** "State of Odisha through the Principal Secretary, Home Department, Government of Odisha, Bhubaneswar"
- **Case nomenclature:** Uses Orissa HC-pedigree forms (BLAPL/ABLAPL for bail/anticipatory bail, S.T. Case, C.T. Case, C.S. No.) — consistent with the Orissa High Court Rules, 1948.
- **Supported languages:** `en`, `or` (Odia is statutory official language under the Orissa Official Language Act, 1954).
- **Local rules covered:** Bengal, Agra and Assam Civil Courts Act, 1887 (as in force); Orissa HC Rules; SC/ST Atrocities + POCSO + NDPS Special Courts; Odisha Protection of Interests of Depositors Act, 2011; Cuttack as principal HC seat.
- **e-Filing:** operational at Cuttack, Khurda, Bhubaneswar; not yet mandatory state-wide.

**Status: Approved.**

---

## Job 2 — Chhattisgarh (33 districts → 70 entries)

### Sessions + District pairs (33 × 2 = 66)

| # | District | HQ city | Sessions courtId | District courtId | Note |
|---:|---|---|---|---|---|
| 1 | Balod | Balod | `cg_sessions_balod` | `cg_district_balod` | |
| 2 | Balodabazar-Bhatapara | Baloda Bazar | `cg_sessions_baloda_bazar` | `cg_district_baloda_bazar` | |
| 3 | Balrampur-Ramanujganj | Balrampur | `cg_sessions_balrampur` | `cg_district_balrampur` | |
| 4 | Bastar | Jagdalpur | `cg_sessions_bastar_jagdalpur` | `cg_district_bastar_jagdalpur` | |
| 5 | Bemetara | Bemetara | `cg_sessions_bemetara` | `cg_district_bemetara` | |
| 6 | Bijapur | Bijapur | `cg_sessions_bijapur` | `cg_district_bijapur` | |
| 7 | Bilaspur | Bilaspur | `cg_sessions_bilaspur` | `cg_district_bilaspur` | HC seat |
| 8 | Dantewada | Dantewada | `cg_sessions_dantewada` | `cg_district_dantewada` | |
| 9 | Dhamtari | Dhamtari | `cg_sessions_dhamtari` | `cg_district_dhamtari` | |
| 10 | Durg | Durg | `cg_sessions_durg` | `cg_district_durg` | |
| 11 | Gariaband | Gariaband | `cg_sessions_gariaband` | `cg_district_gariaband` | |
| 12 | Gaurela-Pendra-Marwahi | Pendra | `cg_sessions_gaurela_pendra_marwahi` | `cg_district_gaurela_pendra_marwahi` | |
| 13 | Janjgir-Champa | Janjgir | `cg_sessions_janjgir_champa` | `cg_district_janjgir_champa` | |
| 14 | Jashpur | Jashpur | `cg_sessions_jashpur` | `cg_district_jashpur` | |
| 15 | Kabirdham | Kawardha | `cg_sessions_kabirdham` | `cg_district_kabirdham` | |
| 16 | Kanker | Kanker | `cg_sessions_kanker` | `cg_district_kanker` | |
| 17 | Khairagarh-Chhuikhadan-Gandai | Khairagarh | `cg_sessions_khairagarh` | `cg_district_khairagarh` | NEW 2022 |
| 18 | Kondagaon | Kondagaon | `cg_sessions_kondagaon` | `cg_district_kondagaon` | |
| 19 | Korba | Korba | `cg_sessions_korba` | `cg_district_korba` | |
| 20 | Koriya | Baikunthpur | `cg_sessions_koriya` | `cg_district_koriya` | |
| 21 | Mahasamund | Mahasamund | `cg_sessions_mahasamund` | `cg_district_mahasamund` | |
| 22 | Manendragarh-Chirmiri-Bharatpur | Manendragarh | `cg_sessions_manendragarh` | `cg_district_manendragarh` | NEW 2022 |
| 23 | Mohla-Manpur-Ambagarh Chowki | Mohla | `cg_sessions_mohla_manpur` | `cg_district_mohla_manpur` | NEW 2022 |
| 24 | Mungeli | Mungeli | `cg_sessions_mungeli` | `cg_district_mungeli` | |
| 25 | Narayanpur | Narayanpur | `cg_sessions_narayanpur` | `cg_district_narayanpur` | |
| 26 | Raigarh | Raigarh | `cg_sessions_raigarh` | `cg_district_raigarh` | |
| 27 | Raipur | Raipur | `cg_sessions_raipur` | `cg_district_raipur` | Capital |
| 28 | Rajnandgaon | Rajnandgaon | `cg_sessions_rajnandgaon` | `cg_district_rajnandgaon` | |
| 29 | Sakti | Sakti | `cg_sessions_sakti` | `cg_district_sakti` | NEW 2022 |
| 30 | Sarangarh-Bilaigarh | Sarangarh | `cg_sessions_sarangarh_bilaigarh` | `cg_district_sarangarh_bilaigarh` | |
| 31 | Sukma | Sukma | `cg_sessions_sukma` | `cg_district_sukma` | |
| 32 | Surajpur | Surajpur | `cg_sessions_surajpur` | `cg_district_surajpur` | |
| 33 | Surguja | Ambikapur | `cg_sessions_surguja` | `cg_district_surguja` | |

All 66 entries set `formattingRulesRef: "cg_district"`.

### CJMs (4)

`cg_cjm_raipur`, `cg_cjm_bilaspur`, `cg_cjm_durg`, `cg_cjm_bastar_jagdalpur` — all `formattingRulesRef: "cjm_generic"`.

**Status: Approved.**

---

## Job 3 — Odisha (30 districts → 64 entries)

### Sessions + District pairs (30 × 2 = 60)

| # | District | HQ city | Sessions courtId | District courtId | Note |
|---:|---|---|---|---|---|
| 1 | Angul | Angul | `od_sessions_angul` | `od_district_angul` | |
| 2 | Balangir | Balangir | `od_sessions_balangir` | `od_district_balangir` | |
| 3 | Baleswar (Balasore) | Balasore | `od_sessions_balasore` | `od_district_balasore` | |
| 4 | Bargarh | Bargarh | `od_sessions_bargarh` | `od_district_bargarh` | |
| 5 | Bhadrak | Bhadrak | `od_sessions_bhadrak` | `od_district_bhadrak` | |
| 6 | Boudh | Boudh | `od_sessions_boudh` | `od_district_boudh` | |
| 7 | Cuttack | Cuttack | `od_sessions_cuttack` | `od_district_cuttack` | HC seat |
| 8 | Deogarh | Deogarh | `od_sessions_deogarh` | `od_district_deogarh` | |
| 9 | Dhenkanal | Dhenkanal | `od_sessions_dhenkanal` | `od_district_dhenkanal` | |
| 10 | Gajapati | Paralakhemundi | `od_sessions_gajapati` | `od_district_gajapati` | |
| 11 | Ganjam | Chhatrapur | `od_sessions_ganjam` | `od_district_ganjam` | |
| 12 | Jagatsinghpur | Jagatsinghpur | `od_sessions_jagatsinghpur` | `od_district_jagatsinghpur` | |
| 13 | Jajpur | Jajpur | `od_sessions_jajpur` | `od_district_jajpur` | |
| 14 | Jharsuguda | Jharsuguda | `od_sessions_jharsuguda` | `od_district_jharsuguda` | |
| 15 | Kalahandi | Bhawanipatna | `od_sessions_kalahandi` | `od_district_kalahandi` | |
| 16 | Kandhamal | Phulbani | `od_sessions_kandhamal` | `od_district_kandhamal` | |
| 17 | Kendrapara | Kendrapara | `od_sessions_kendrapara` | `od_district_kendrapara` | |
| 18 | Kendujhar (Keonjhar) | Keonjhar | `od_sessions_kendujhar` | `od_district_kendujhar` | |
| 19 | Khordha | Bhubaneswar | `od_sessions_khordha` | `od_district_khordha` | Capital |
| 20 | Koraput | Koraput | `od_sessions_koraput` | `od_district_koraput` | |
| 21 | Malkangiri | Malkangiri | `od_sessions_malkangiri` | `od_district_malkangiri` | |
| 22 | Mayurbhanj | Baripada | `od_sessions_mayurbhanj` | `od_district_mayurbhanj` | |
| 23 | Nabarangpur | Nabarangpur | `od_sessions_nabarangpur` | `od_district_nabarangpur` | |
| 24 | Nayagarh | Nayagarh | `od_sessions_nayagarh` | `od_district_nayagarh` | |
| 25 | Nuapada | Nuapada | `od_sessions_nuapada` | `od_district_nuapada` | |
| 26 | Puri | Puri | `od_sessions_puri` | `od_district_puri` | |
| 27 | Rayagada | Rayagada | `od_sessions_rayagada` | `od_district_rayagada` | |
| 28 | Sambalpur | Sambalpur | `od_sessions_sambalpur` | `od_district_sambalpur` | |
| 29 | Subarnapur | Sonepur | `od_sessions_subarnapur` | `od_district_subarnapur` | |
| 30 | Sundargarh | Sundargarh | `od_sessions_sundargarh` | `od_district_sundargarh` | |

All 60 entries set `formattingRulesRef: "od_district"`.

### CJMs (4)

`od_cjm_bhubaneswar`, `od_cjm_cuttack`, `od_cjm_sambalpur`, `od_cjm_berhampur_ganjam` — all `formattingRulesRef: "cjm_generic"`.

**Status: Approved.**

---

## Risk register

| # | Item | Severity | Status |
|---:|---|---|---|
| 1 | District boundary changes in CG (2022 reorganisation — 4 new districts) baked in. | Risk | Acceptable. State Govt notifications cite the new HQs; revisit if Allahabad-style further subdivision occurs. |
| 2 | Odisha — Sambalpur permanent bench of Orissa HC is "under consideration"; current sole principal seat is Cuttack. | Risk | Acceptable — note added in `od_sessions_sambalpur.jurisdictionNote`; revise if HC notification issued. |
| 3 | Odia (`or`) language code added — confirm UI/PDF font support before user-facing release. | Risk | Flag for Vishal — fontset check needed for Devanagari/Odia rendering in PDF export pipeline. |
| 4 | BLAPL / ABLAPL nomenclature is Orissa HC convention; some subordinate Sessions courts retain "Crl. Misc. Case" for bail. | Risk | Acceptable — `BLAPL` is the standard prevailing form per Orissa HC Rules; advocates routinely use it at Sessions level. |
| 5 | Ganjam HQ is Chhatrapur (revenue) but Berhampur is the principal commercial/court town with high docket. We map district court at Chhatrapur and CJM at Berhampur to reflect actual practice. | Acceptable | — |
| 6 | Cause-title for Ganjam district court uses "CHHATRAPUR" — advocates filing at Berhampur sub-divisional courts must override `city` at draft time. | Risk | Acceptable — document in template guide; UI should allow override. |
| 7 | All 134 new courts are CLO-signed for cause-title rendering ONLY. Substantive practice rules (e.g., MACT, Family Court forms) are out of scope for this batch. | Acceptable | — |

---

## Acceptance

- Total court entries: **843 → 977** (+134)
- New rule files: **2** (`cg_district.json`, `od_district.json`)
- JSON validity: **all 3 files parse clean** via `json.load`
- Duplicate `courtId`: **zero**
- `_meta.national_expansion_batch_5b` recorded: 2026-05-10
- `phase_2_pending` updated to remove Odisha (now covered)

**Status: Approved. Ready for Batch 6.**

Ready for next task.
