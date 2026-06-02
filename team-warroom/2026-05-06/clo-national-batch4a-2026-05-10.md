# CLO National Batch 4a — Karnataka + Tamil Nadu

**Owner:** Ajay (CLO)
**Date:** 2026-05-10
**Scope:** KA + TN sessions/district/CJM coverage + 2 new state rule files

---

## Summary

| Metric | Value |
|---|---|
| Courts before | 331 |
| Courts after | 473 |
| Net added | 142 |
| New state rule files | 2 (ka_district, tn_district) |
| Duplicate courtIds | 0 |
| JSON valid (all 3 files) | Yes |

---

## Files touched

| Path | Action |
|---|---|
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json` | 142 entries appended; `_meta.national_expansion_batch_4a` added; validated_by refreshed |
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/ka_district.json` | **NEW** — Karnataka 7-field schema + `_meta` (CLO) |
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/tn_district.json` | **NEW** — Tamil Nadu 7-field schema + `_meta` (CLO) |

---

## Karnataka — 63 entries (formattingRulesRef: ka_district / cjm_generic)

- **Sessions courts:** 29 (Bagalkote, Ballari, Belagavi, Bidar, Chamarajanagar, Chikballapur, Chikkamagaluru, Chitradurga, Dakshina Kannada at Mangaluru, Davangere, Dharwad, Gadag, Hassan, Haveri, Kalaburagi, Kodagu at Madikeri, Kolar, Koppal, Mandya, Mysuru, Raichur, Ramanagara, Shivamogga, Tumakuru, Udupi, Uttara Kannada at Karwar, Vijayanagara at Hosapete, Vijayapura, Yadgir)
- **District courts:** 29 (parallel pairs to above)
- **CJM courts:** 5 (Bengaluru as CMM; Mysuru; Mangaluru / Dakshina Kannada; Belagavi; Dharwad / Hubballi-Dharwad)
- **Bengaluru Urban / Bengaluru Rural:** skipped (already in Batch 1)

### KA rule highlights
- party_designation.state: "State of Karnataka through the Principal Secretary, Home Department, Government of Karnataka, Bengaluru"
- case nomenclature: C.C. No. (Calendar Case, magistrate level), S.C. No. (Sessions), Crl. Misc. (bail), O.S. No. (suits) — standard Karnataka usage
- supportedLanguages: en, kn, hi
- localRules: Karnataka Civil Rules of Practice, Karnataka Civil Courts Act 1964, Karnataka Official Language Act 1963

---

## Tamil Nadu — 79 entries (formattingRulesRef: tn_district / cjm_generic)

- **Sessions courts:** 37 (Ariyalur, Chengalpattu, Coimbatore, Cuddalore, Dharmapuri, Dindigul, Erode, Kallakurichi, Kanchipuram, Kanyakumari at Nagercoil, Karur, Krishnagiri, Madurai, Mayiladuthurai, Nagapattinam, Namakkal, Nilgiris at Udhagamandalam, Perambalur, Pudukkottai, Ramanathapuram, Ranipet, Salem, Sivaganga, Tenkasi, Thanjavur, Theni, Thiruvallur, Thiruvarur, Thoothukudi, Tiruchirappalli, Tirunelveli, Tirupathur, Tiruppur, Tiruvannamalai, Vellore, Viluppuram, Virudhunagar)
- **District courts:** 37 (parallel pairs)
- **CJM courts:** 5 (Chennai as CMM Egmore; Coimbatore; Madurai; Tiruchirappalli; Salem)
- **Chennai sessions:** skipped (already in Batch 1)

### TN rule highlights
- party_designation.state: "State of Tamil Nadu represented by the Public Prosecutor / Inspector of Police (as applicable) through the Principal Secretary, Home Department, Government of Tamil Nadu, Chennai"
- case nomenclature: S.C. No. (Sessions), Spl. Sessions Case No. (atrocity/POCSO/NDPS), Crl. M.P. No. (criminal misc), Crl. O.P. (A.B.) for anticipatory bail, O.S. No. (suits), E.P. No. (execution) — standard Madras HC / TN usage
- supportedLanguages: en, ta
- localRules: Madras HC Original/Appellate Side Rules, Tamil Nadu Civil Rules of Practice, Tamil Nadu Civil Courts Act 1873, Tamil Nadu Official Language Act 1956

---

## Verification commands run

```
python3 -m json.tool indian-courts.json   # VALID — 473 courts
python3 -m json.tool ka_district.json     # VALID
python3 -m json.tool tn_district.json     # VALID
# Duplicate courtId check: 0
```

---

## Risk register

| Item | Severity | Note |
|---|---|---|
| District nomenclature (e.g. Bellary → Ballari, Mysore → Mysuru) | Acceptable | Used post-2014 official names; legacy names kept in narrative |
| Bengaluru = "Court of CMM" not "CJM" | Acceptable | S.16 BNSS metropolitan area; jurisdictionNote added |
| Chennai = "Court of CMM Egmore" | Acceptable | Same — metropolitan, Egmore is the actual seat |
| Madras HC original-side suit numbering not modelled (C.S. No.) | Risk | Out of scope — HC entry separate; only district covered here |
| Local-language vakalatnama variants | Acceptable | localRules captures vakalatnama requirement; sample form not in scope this batch |
| Tirupathur vs Tirupattur spelling | Acceptable | Used official 2019-spelt district name "Tirupathur" |

---

## Pending for next batches

- **4b:** West Bengal + Telangana districts + state rule files
- **4c:** Rajasthan + Madhya Pradesh districts + state rule files
- **4d:** Kerala + Andhra Pradesh + Odisha
- **4e:** Punjab + Haryana + Himachal + Uttarakhand
- **4f:** NE states (Assam, Tripura, Meghalaya, Manipur, Nagaland, Mizoram, Arunachal, Sikkim)
- **5:** UTs + remaining (J&K, Ladakh, A&N, Lakshadweep, Puducherry, Daman & Diu, D&NH, Chandigarh districts)

---

**Status:** Approved.
Ready for next task.
