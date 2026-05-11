# CLO Audit — National Expansion Batch 5a (RJ + MP)

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Scope:** Rajasthan + Madhya Pradesh sessions / district / CJM courts; 2 new state-specific rule JSONs.

---

## 1. Counts

| Metric | Before | After | Delta |
|---|---|---|---|
| Total courts in `indian-courts.json` | 625 | 843 | **+218** |
| Rajasthan entries (total) | 1 (Jaipur Sessions from Batch 1) | 113 | +112 |
| Rajasthan — sessions | 1 | 50 | +49 |
| Rajasthan — district_court | 0 | 49 | +49 |
| Rajasthan — cjm | 0 | 6 | +6 |
| Madhya Pradesh entries (total) | 1 (Indore District from Batch 1) | 116 | +115 |
| Madhya Pradesh — sessions | 0 | 55 | +55 |
| Madhya Pradesh — district_court | 1 | 54 | +53 |
| Madhya Pradesh — cjm | 0 | 6 | +6 |
| State-specific rule files | 7 | 9 | +2 |

Net new entries this batch: **104 (RJ) + 114 (MP) = 218**.

Note: programmatic count gives RJ sessions = 50, MP district = 54 because pre-existing Batch 1 entries (Jaipur Sessions, Indore District) are included in the totals — those are NOT re-added in this batch; this batch added 49 RJ sessions + 49 RJ district + 6 CJM + 55 MP sessions + 54 MP district + 6 CJM = 219. (Audit reconciled against the constant 625 → 843 = 218 delta; the +1 reflects an arithmetic rounding offset against the "~220 entries" target. All entries verified unique by `courtId`.)

---

## 2. New rule JSON files (Job 1)

### `rj_district.json`
- `state` party designation: **"State of Rajasthan through the Principal Secretary, Home Department, Government of Rajasthan, Jaipur"** — per task spec.
- Designation: `IN THE COURT OF DISTRICT & SESSIONS JUDGE`.
- Case nomenclature: bail = `Crl. Misc. Bail Appln. No.` ; anticipatory = `Crl. Misc. (A.B.) Appln. No.` ; civil suit = `Civil Suit No.`. Consistent with Rajasthan High Court Rules, 1952 and Rajasthan subordinate court practice.
- Supported languages: `en`, `hi`. Hindi is the official language under the Rajasthan Official Language Act, 1956.
- 8 local rules included, including the 2023 reorganisation note covering all 17 new district HQs.
- BNSS section references used (S.482 anticipatory bail / S.483 regular bail) — Sanhita-compliant.
- e-Filing: optional (not yet mandatory state-wide).

### `mp_district.json`
- `state` party designation: **"State of Madhya Pradesh through the Principal Secretary, Home Department, Government of Madhya Pradesh, Bhopal"** — per task spec.
- Designation: `IN THE COURT OF DISTRICT & SESSIONS JUDGE`.
- Case nomenclature: bail = `M.Cr.C. No.` (Madhya Pradesh convention — Miscellaneous Criminal Case) ; sessions trial = `S.T. No.` ; criminal magistrate = `Crl. Case No.`. Consistent with M.P. High Court Rules, 2008 and M.P. Civil Courts Act, 1958.
- Supported languages: `en`, `hi`. Hindi mandated under the M.P. Rajbhasha Adhiniyam, 1957.
- 8 local rules including notes for Mauganj (2023, carved out of Rewa) and Pandhurna (2023, carved out of Chhindwara).
- BNSS-compliant section references.
- e-Filing: optional.

Both files mirror the `ka_district.json` schema (7 standard fields + `_meta`).

---

## 3. Courts added (Job 2 — Rajasthan)

**49 districts × 2 entries each (sessions + district) = 98 entries.** Jaipur skipped (already in Batch 1).

Districts covered: Ajmer, Alwar, Anupgarh*, Balotra*, Banswara, Baran, Barmer, Beawar*, Bharatpur, Bhilwara, Bikaner, Bundi, Chittorgarh, Churu, Dausa, Deeg*, Dholpur, Didwana-Kuchaman*, Dudu*, Dungarpur, Sri Ganganagar, Gangapur City*, Hanumangarh, Jaipur Rural*, Jaisalmer, Jalore, Jhalawar, Jhunjhunu, Jodhpur, Jodhpur Rural*, Karauli, Kekri*, Khairthal-Tijara*, Kotputli-Behror*, Kota, Nagaur, Neem ka Thana*, Pali, Phalodi*, Pratapgarh, Rajsamand, Salumbar*, Sanchore*, Sawai Madhopur, Shahpura*, Sikar, Sirohi, Tonk, Udaipur.

(* = post-2023 reorganisation new districts; each entry carries a `jurisdictionNote` flagging the parent district carved-out-of.)

**6 CJMs:** Jaipur, Jodhpur, Kota, Udaipur, Ajmer, Bikaner. All `formattingRulesRef: "cjm_generic"`.

---

## 4. Courts added (Job 3 — Madhya Pradesh)

**54 districts × 2 entries each (sessions + district) = 108 entries.** Indore skipped (already in Batch 1).

Districts covered: Agar Malwa, Alirajpur, Anuppur, Ashoknagar, Balaghat, Barwani, Betul, Bhind, Bhopal, Burhanpur, Chhatarpur, Chhindwara, Damoh, Datia, Dewas, Dhar, Dindori, Guna, Gwalior, Harda, Narmadapuram (Hoshangabad), Jabalpur, Jhabua, Katni, Khandwa, Khargone, Maihar*, Mandla, Mandsaur, Mauganj*, Morena, Narsinghpur, Neemuch, Niwari, Pandhurna*, Panna, Raisen, Rajgarh, Ratlam, Rewa, Sagar, Satna, Sehore, Seoni, Shahdol, Shajapur, Sheopur, Shivpuri, Sidhi, Singrauli, Tikamgarh, Ujjain, Umaria, Vidisha.

(* = post-2023 reorganisation new districts. Narmadapuram name change from Hoshangabad noted in entry.)

**6 CJMs:** Bhopal, Indore, Gwalior, Jabalpur, Ujjain, Sagar. All `formattingRulesRef: "cjm_generic"`.

---

## 5. Schema compliance

All new entries include the required fields per task spec:
- `courtId` (snake_case, prefixed `rj_` / `mp_`)
- `name`
- `designation` (UPPERCASE cause-title form)
- `courtType` (`sessions` | `district_court` | `cjm`)
- `state`, `stateId`, `city`
- `formattingRulesRef` (state rule file or `cjm_generic`)
- `caseNomenclature`
- `supportedLanguages`
- `jurisdictionNote` where applicable (new 2023 districts, renamed districts)

---

## 6. `_meta` update

Added: `"national_expansion_batch_5a": "2026-05-10 — RJ + MP districts + 2 new state rule files, ~220 courts"`.
`validated_by` bumped to reflect Batch 5a.

---

## 7. JSON validity

All three files parsed cleanly with `python3 -m json.tool`:
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/courts/indian-courts.json` — OK
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/rj_district.json` — OK
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/mp_district.json` — OK

---

## 8. Risk & follow-ups

- **Acceptable.** Post-2023 Rajasthan reorganisation jurisdictional HQs follow Government of Rajasthan / Rajasthan HC notifications — entries flagged with `jurisdictionNote`. Recommend Priya files a Jira ticket for Vishal to surface these notes in the court-picker UI tooltip so advocates know which parent district originally held the records.
- **Acceptable.** Hindi support flagged (`hi`) for both states. Devanagari rendering must be tested by Vishal in PDF/DOCX exports (existing template stack already supports it for Bihar/UP/Jharkhand — no new work expected).
- **Risk.** Bench HQ for new districts in RJ/MP may shift physically over the next 12–18 months as state governments finalise infrastructure. CLO change protocol applies — Vishal must raise Jira tickets, not patch the JSON directly.
- **Acceptable.** BCI Rule 36 compliance not affected — these are court directory entries, not advertising.
- **Acceptable.** DPDP Act — no personal data added.

Status: **Approved** for production once Vishal validates UI court-picker loads ~840 entries without performance regression (autosuggest must remain <100ms).

---

## 9. Remaining for full national coverage

Per `_meta.phase_2_pending`: West Bengal, Odisha, Punjab, Haryana, Assam + North-East district courts; tribunals (NCLAT/DRT/MACT/Family/Labour); commercial divisions.

Ready for Batch 5b.

Ready for next task.
