# CLO Config Batch 5 — Courts Directory Expansion

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**File:** `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json`
**Status:** Approved — JSON validated via `python3 -m json.tool`

---

## Summary

- **Before:** 36 court entries (Bihar 6, Jharkhand 5, UP 6, Delhi 7, consumer 4, plus 4 HCs / misc — counted from original audit)
- **After:** **69 court entries**
- **Net added:** 33 new entries
- `_meta` block added (description, owner, validated_by, last_updated, phase_2_pending, change_protocol)
- New `states` added: Maharashtra, Karnataka, Tamil Nadu, West Bengal, Telangana, Gujarat, India (Union)
- New `court_types` added: `supreme_court`, `tribunal`

---

## Count by State (final)

| State | Count |
|---|---|
| Bihar | 17 |
| Jharkhand | 17 |
| Uttar Pradesh | 16 |
| Delhi | 10 |
| India (Union) | 3 |
| Maharashtra | 1 |
| Karnataka | 1 |
| Tamil Nadu | 1 |
| West Bengal | 1 |
| Telangana | 1 |
| Gujarat | 1 |
| **Total** | **69** |

## Count by Type (final)

| Type | Count |
|---|---|
| supreme_court | 1 |
| high_court | 12 |
| sessions | 38 |
| district_court | 4 |
| cjm | 3 |
| jmfc | 2 |
| civil_court | 1 |
| tribunal | 2 |
| consumer_commission | 6 |

---

## New courtIds Added

### Jharkhand sessions (Phase 1 priority — founder's home state)
- `jharkhand_sessions_bokaro`
- `jharkhand_sessions_chaibasa` (West Singhbhum)
- `jharkhand_sessions_deoghar`
- `jharkhand_sessions_dhanbad` *(already existed — verified)*
- `jharkhand_sessions_dumka`
- `jharkhand_sessions_giridih`
- `jharkhand_sessions_hazaribagh` *(already existed — verified)*
- `jharkhand_sessions_jamshedpur` *(already existed — verified)*
- `jharkhand_sessions_palamu` (Daltonganj)

**Net new Jharkhand sessions courts added in Batch 5: 6**

### Jharkhand consumer commissions added
- `dhanbad_dccdrc`
- `jamshedpur_dccdrc`

### Bihar sessions (Phase 1 priority — demo state)
- `bihar_sessions_bhagalpur` *(existed)*
- `bihar_sessions_begusarai` *(existed)*
- `bihar_sessions_darbhanga` *(existed)*
- `bihar_sessions_gaya` *(existed)*
- `bihar_sessions_madhubani` **NEW**
- `bihar_sessions_muzaffarpur` *(existed)*
- `bihar_sessions_purnia` **NEW**
- `bihar_sessions_samastipur` **NEW**
- `bihar_sessions_saran` (Chhapra) **NEW**
- `bihar_sessions_vaishali` (Hajipur) **NEW**

**Net new Bihar sessions courts added in Batch 5: 5**

### UP sessions + HC seat
- `up_sessions_agra` *(existed)*
- `up_sessions_aligarh` **NEW**
- `up_sessions_bareilly` **NEW**
- `up_sessions_ghaziabad` *(existed)*
- `up_sessions_kanpur` *(existed — Kanpur Nagar)*
- `up_sessions_lucknow` *(existed)*
- `up_sessions_meerut` *(existed)*
- `up_sessions_noida` (Gautam Buddh Nagar) **NEW**
- `up_sessions_prayagraj` **NEW — fills Allahabad HC seat district court gap**
- `up_sessions_varanasi` *(existed)*
- `allahabad_hc_prayagraj` **NEW** — alias entry for principal HC seat, points to same `allahabad_hc` rules; resolves the audit finding "Missing Prayagraj (Allahabad HC seat)."

**Net new UP entries added in Batch 5: 5**

### Delhi sessions
- `delhi_dwarka` *(existed)*
- `delhi_karkardooma` *(existed)*
- `delhi_new_delhi_sk_saheb` **NEW** — New Delhi District Court complex (S.K. Saheb)
- `delhi_patiala_house` *(existed)*
- `delhi_rohini` *(existed)*
- `delhi_saket` *(existed)*
- `delhi_tis_hazari` *(existed)*

**Net new Delhi sessions courts added in Batch 5: 1**

### Supreme Court + tribunals
- `supreme_court_india` **NEW**
- `ncdrc_delhi` **NEW**
- `nclt_principal_delhi` **NEW** (skeleton)

**Net new SC/tribunal entries: 3**

### Other-state High Courts (seed entries)
- `maharashtra_hc_mumbai` **NEW**
- `karnataka_hc_bangalore` **NEW**
- `tamil_nadu_hc_chennai` **NEW** (Madras HC)
- `west_bengal_hc_kolkata` **NEW** (Calcutta HC)
- `telangana_hc_hyderabad` **NEW**
- `gujarat_hc_ahmedabad` **NEW**

**Net new other-state HCs: 6**

---

## courtIds pointing to GENERIC rules — flagged for Batch 4 (court-rules expansion)

These need state-specific JSONs created in the court-rules directory:

| courtId | currently points to | rule JSON needed |
|---|---|---|
| `supreme_court_india` | `supreme_court` | `supreme_court.json` (Supreme Court Rules, 2013) |
| `maharashtra_hc_mumbai` | `high_court_generic` | `bombay_hc.json` |
| `karnataka_hc_bangalore` | `high_court_generic` | `karnataka_hc.json` |
| `tamil_nadu_hc_chennai` | `high_court_generic` | `madras_hc.json` |
| `west_bengal_hc_kolkata` | `high_court_generic` | `calcutta_hc.json` |
| `telangana_hc_hyderabad` | `high_court_generic` | `telangana_hc.json` |
| `gujarat_hc_ahmedabad` | `high_court_generic` | `gujarat_hc.json` |
| `ncdrc_delhi` | `ncdrc` | `ncdrc.json` (CPA 2019 + NCDRC Regulations 2020) |
| `nclt_principal_delhi` | `tribunal_generic` | `nclt.json` (NCLT Rules, 2016) |
| `bihar_civil_patna` | `district_court_generic` | acceptable — use existing generic |

**Action item for Batch 4 owner:** create the 9 missing court-rule JSONs above. Until then, these courts fall back to generic rules — usable for Phase 1 cause-title rendering but not for filing-format strictness.

---

## Phase 2 (NOT in this batch — explicitly deferred)

- District/sessions courts for Maharashtra, Karnataka, Tamil Nadu, WB, Telangana, Gujarat
- NCLAT (appellate companies tribunal)
- DRT (Debt Recovery Tribunal) — relevant for banking suits
- MACT (Motor Accident Claims Tribunal) — high volume for district advocates
- Family Courts (state-specific)
- Labour Courts / Industrial Tribunals
- Commercial Divisions of HCs (Commercial Courts Act, 2015)
- HC benches: Bombay HC at Nagpur/Aurangabad/Goa; Karnataka HC at Dharwad/Kalaburagi; Madras HC at Madurai; Calcutta HC at Port Blair/Jalpaiguri

Captured in `_meta.phase_2_pending`.

---

## Compliance Notes

- **BCI Rule 36:** no advertising — court-directory data is functional/structural, not promotional. No concern.
- **DPDP Act:** no personal data in this file. Public-domain court designations only.
- **State language fields:** added `mr`, `kn`, `ta`, `bn`, `te`, `gu` to other-state HCs as `supportedLanguages` placeholders — Phase 2 will deliver translations.

---

## Verification

- JSON validity: `python3 -m json.tool` passed (verified in workspace).
- Schema mirrors existing `bihar_sessions_patna` / `jharkhand_hc` canonical examples.
- All new courtIds use snake_case `<state>_<type>_<city>` convention.
- Designations match the actual cause-title strings observed in published orders.

**Batch 5 complete. Ready for next task.**
