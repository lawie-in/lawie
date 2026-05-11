# CLO National Court Expansion — Batch 6b Audit

**Owner:** Ajay (CLO)
**Date:** 2026-05-10
**Batch:** 6b of 12 — Uttarakhand + Jammu & Kashmir (UT) + Ladakh (UT) + Chandigarh (UT)
**Status:** Approved

---

## Scope delivered

- 3 new state/UT rule JSONs created:
  - `apps/drafting/src/config/court-rules/uk_district.json`
  - `apps/drafting/src/config/court-rules/jk_district.json`
  - `apps/drafting/src/config/court-rules/ld_district.json`
- Chandigarh UT: no separate rule file (uses `district_court_generic` per scope note); 1 CJM added.
- 80 new court entries appended to `apps/drafting/src/config/courts/indian-courts.json`.
- 3 new `stateId` entries added: `uttarakhand`, `jammu_kashmir`, `ladakh`.
- `_meta.national_expansion_batch_6b` recorded; `phase_2_pending` updated (J&K + Uttarakhand removed from pending list).
- All 4 JSON files validated parse-clean via `python3 -c "json.load(...)"`.

---

## Court totals

| Metric | Before | After |
|---|---:|---:|
| Total court entries in `indian-courts.json` | 1102 | **1182** |
| States/UTs in directory | 21 | **24** |
| New entries in this batch | — | **80** |

---

## Per-jurisdiction breakdown

### Uttarakhand (13 districts × 2 + 3 CJMs = 29 + 1 verification of Nainital HC already present = 29 new)

Sessions + District pairs (13 districts):
- Almora, Bageshwar, Chamoli (Gopeshwar), Champawat, Dehradun, Haridwar, Nainital, Pauri Garhwal, Pithoragarh, Rudraprayag, Tehri Garhwal (New Tehri), Udham Singh Nagar (Rudrapur), Uttarkashi
- All use `formattingRulesRef: "uk_district"`.

CJMs (3):
- `uk_cjm_dehradun`, `uk_cjm_haridwar`, `uk_cjm_nainital` — all `formattingRulesRef: "cjm_generic"`.

Total UK entries in directory after batch: **30** (13 sessions + 13 district + 3 CJM + 1 pre-existing Nainital HC reference outside this stateId).

### Jammu & Kashmir (UT) — 20 districts × 2 + 4 CJMs = 44 new

Kashmir Division (10): Anantnag, Bandipora, Baramulla, Budgam, Ganderbal, Kulgam, Kupwara, Pulwama, Shopian, Srinagar.

Jammu Division (10): Doda, Jammu, Kathua, Kishtwar, Poonch, Rajouri, Ramban, Reasi, Samba, Udhampur.

- Designation deliberately set to `IN THE COURT OF PRINCIPAL DISTRICT & SESSIONS JUDGE` (J&K convention — "Principal District & Sessions Judge" is the senior-most district judge designation under J&K Subordinate Courts (Designation) Rules).
- Three official languages supported: `["en", "ur", "hi"]`.
- All sessions/district use `formattingRulesRef: "jk_district"`.

CJMs (4): `jk_cjm_srinagar`, `jk_cjm_jammu`, `jk_cjm_baramulla`, `jk_cjm_anantnag` — all `formattingRulesRef: "cjm_generic"`.

Total JK entries: **46** (20 sessions + 20 district + 4 CJM + 2 pre-existing — J&K HC at Srinagar/Jammu).

### Ladakh (UT) — 2 districts × 2 + 2 CJMs = 6 new

- Leh, Kargil.
- `formattingRulesRef: "ld_district"` for sessions/district; `cjm_generic` for CJMs.
- Designations follow J&K-style "Principal District & Sessions Judge" convention.
- Languages: `["en", "hi", "ur"]` (Bhoti noted in rule file `localRules` but not in `supportedLanguages` because BCP-47 `bo` would require draft-template support not yet implemented).

Total LD entries: **6**.

### Chandigarh UT — 1 new

- `chandigarh_sessions` already present (verified) — uses `sessions_generic`. Per scope: Chandigarh district court covered by existing sessions entry; no separate `chandigarh_district` created.
- Added: `chandigarh_cjm` with `formattingRulesRef: "cjm_generic"`.

Total Chandigarh entries (all types): **8** (1 sessions + 1 CJM + 1 HC + 5 tribunals — consumer/NCLT/DRT/CAT/ITAT — all pre-existing).

---

## Legal correctness — risks reviewed

| Item | Risk | Status |
|---|---|---|
| **J&K post-Article 370 status** | If template uses pre-2019 "State of J&K" the cause-title will be inaccurate; RPC/J&K CrPC references would also be wrong. | **Approved** — `state` field correctly designates "Union Territory of Jammu and Kashmir"; rule file `_meta.post_reorganisation_note` and `localRules` explicitly cite the J&K Reorganisation Act, 2019 and confirm BNS/BNSS/BSA apply. |
| **Ladakh UT status** | Ladakh has no legislature; Sixth Schedule under consideration. State field must designate Administrator, not Governor/CM. | **Approved** — `state` set to "Union Territory of Ladakh through the Administrator, UT of Ladakh, Leh". |
| **Uttarakhand statutory base** | Pre-2000 the territory was part of UP; civil courts run on adapted UP Civil Courts Act, 1887 / UP Zamindari Abolition. | **Acceptable** — `jurisdictionNote` and `localRules` explicitly note the UP-adapted statutory base. |
| **J&K "Principal District Judge" designation** | If we use plain "District Judge" the cause-title will be technically inaccurate. | **Approved** — all JK sessions/district designations use "Principal District & Sessions Judge" / "Principal District Judge". |
| **Common HC (J&K + Ladakh)** | The High Court is common to both UTs and follows "Darbar Move" (Srinagar/Jammu). | **Approved** — captured in `_meta.post_reorganisation_note` and `localRules` of both `jk_district.json` and `ld_district.json`. |
| **Chandigarh language support** | UT has English + Hindi + Punjabi (Gurmukhi) per UT administration. | **Approved** — `chandigarh_cjm` carries `["en", "hi", "pa"]`. |
| **BNS/BNSS/BSA application in J&K + Ladakh** | Pre-2019, Ranbir Penal Code, J&K CrPC, J&K Evidence Act applied. These stand repealed. | **Approved** — both rule files explicitly call out repeal and transitional savings under S.531 BNSS. |
| **Sixth Schedule (Ladakh)** | Currently demanded; not yet granted as of 2026-05-11. Rule file should not pre-empt. | **Approved** — `localRules` notes "Sixth Schedule status is under consideration" — neutral, accurate. |
| **Border districts security calendars** | J&K border districts (Kupwara/Bandipora/Poonch/Rajouri/Kathua/Samba) and Ladakh high-altitude sub-divisions (Zanskar/Nubra/Drass/Changthang) have seasonal/security closures. | **Acceptable** — flagged in `localRules` for both files; advocate must verify listing dates. |
| **Hindi vs Urdu in J&K cause-titles** | Urdu was the official language of record pre-2020; J&K Official Languages Act, 2020 added Hindi, English, Kashmiri, Dogri. | **Acceptable** — `supported_languages: ["en", "ur", "hi"]`; full multi-script (Kashmiri/Dogri) deferred to a future batch. |
| **Court-fee under J&K Stamp Act vs Central Court-Fees Act** | Post-reorganisation, the Central Court-Fees Act, 1870 was extended. Older J&K Court-Fees Act, Svt. 1977 stands repealed. | **Approved** — `localRules` correctly cites Court-Fees Act, 1870 extension. |

---

## Files modified / created

| Path | Change |
|---|---|
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json` | +80 court entries; +3 states (`uttarakhand`, `jammu_kashmir`, `ladakh`); `_meta.national_expansion_batch_6b` added; `phase_2_pending` updated. |
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/uk_district.json` | NEW — 7-field schema + `_meta`. |
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/jk_district.json` | NEW — 7-field schema + `_meta` + post-2019 reorganisation note. |
| `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/ld_district.json` | NEW — 7-field schema + `_meta`. |

---

## Validation

```
OK courts/indian-courts.json          (1182 courts, 24 states)
OK court-rules/uk_district.json
OK court-rules/jk_district.json
OK court-rules/ld_district.json
```

---

## Open items / next batch

- **Batch 7 candidates:** West Bengal + Assam district courts (the remaining major mainland gap). Then North-East 7 sister states (Tripura/Meghalaya/Manipur/Nagaland/Mizoram/Arunachal/Sikkim). Then specialised tribunals (NCLAT/MACT/Family/Labour). Then commercial divisions.
- **Future J&K refinement:** add Kashmiri (`ks`) and Dogri (`doi`) language support once cause-title templates exist.
- **Future Ladakh refinement:** add Bhoti (`bo`) when Sixth Schedule notification is published.
- **Sub-divisional courts** (Nubra, Zanskar in Ladakh; Leh outpost courts) deferred until Phase 2.
- **Chandigarh:** if separate `chandigarh_district` is ever needed (currently combined with sessions), one entry can be added later.

**Sign-off:** Ajay (CLO) — legally correct as of 2026-05-11.

Ready for next task.
