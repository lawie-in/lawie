# CLO Review — Document Generation Smoke Test

**Reviewer:** Ajay (CLO)
**Test run:** `20260504-004605`
**Verdict:** **CHANGES REQUESTED — do not ship to users yet**

All 6 templates returned HTTP 200 and produced legible drafts with correct cause titles, prayers, verifications, and filing checklists. The drafting engine is alive and the prompt scaffolding works.

But review of legal accuracy reveals **3 filing-killer errors** and **1 major systemic gap**. Detail below.

---

## 🚨 SHOW-STOPPERS (would get the advocate sanctioned or the draft dismissed)

### S1. Wrong defendant named in body — `consumer_complaint`
- Cause title correctly names **"ElectroMart India Pvt. Ltd."** (the e-commerce seller, taken from form data).
- Para 2 of the AI body states the Opposite Party is **"Samsung India Electronics Pvt. Ltd."** — pure invention. Samsung is not a party.
- **Risk:** Complaint liable to be dismissed for non-joinder of necessary party / mis-description. Advocate may also face Section 35 CPC costs.
- **Fix:** Prompt must instruct AI to use the exact `respondent_name` from form data, never guess the manufacturer from product name.

### S2. False legal characterisation — `bail_anticipatory`
- Para 10 of body: *"the present case does not involve any grave or serious offence and the allegations are bailable in nature."*
- Form data: BNS 318(4) (cheating, value ≥ ₹1 lakh) and BNS 336(3) (forgery for cheating). **Both are non-bailable**.
- **Risk:** Stating a non-bailable offence is "bailable" in pleadings is a misrepresentation to the court. Section 340 BNSS proceedings possible against advocate.
- **Fix:** Pre-process — look up bailable/non-bailable status of each section via BNS schedule before generation; instruct AI to use the actual classification.

### S3. Fabricated case status — `bail_regular`
- Para 4 of body: *"investigation has been completed and charge sheet has already been filed"*. Neither fact appears in `form_data`.
- Para 10: claims offences are "bailable in nature" — BNS 303 (theft) and BNS 351 (criminal intimidation) are bailable for basic offences, but the assertion is made without verification of which sub-section applies.
- **Risk:** False statement of fact in a bail application. Court will discover at first hearing.
- **Fix:** Prompt must forbid AI from asserting investigation/charge sheet status unless explicitly provided.

---

## ⚠️ MAJOR SYSTEMIC GAP

### G1. The new court rules (SCRUM-50) are NOT being applied

All 6 drafts use the **legacy generic templates** for cause title, party designation, prayer language, and verification format. The 7 fields we just added to court-rule files (`cause_title_format`, `party_designation`, `case_nomenclature`, `prayer_language`, `verification_format`, etc.) are sitting unused.

**Evidence:**

| Field | What court rule says | What the draft generated |
|---|---|---|
| `bail_anticipatory` cause nomenclature | `patna_hc.json` → `"Cr. Misc. No. _____ of {year}"` | Draft used: `"Anticipatory Bail Application No. _____ of 2026"` |
| `bail_regular` party designation | `bihar_district.json` → `"Applicant"` / `"Opposite Party"` | Draft used: `"Petitioner / Accused"` / `"Respondent / State"` |
| `bail_anticipatory` state respondent | `patna_hc.json` → `"State of Bihar through the Principal Secretary, Home Department, Government of Bihar, Patna"` | Draft used: `"State of bihar Through Public Prosecutor"` |
| `bail_regular` court designation | `bihar_district.json` → `"IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA"` | Draft used literal form input: `"IN THE COURT OF Court of Sessions Judge, Patna"` (note duplicate "Court of") |
| `bail_anticipatory` court designation | `patna_hc.json` → `"IN THE HIGH COURT OF JUDICATURE AT PATNA"` | Draft used: `"IN THE COURT OF High Court of Judicature at Patna\nAT Patna"` |
| `bail_anticipatory` verification | `patna_hc.json` has full verification template per Order VI Rule 15 CPC | Draft used: generic verification, not court-specific |
| `bail_anticipatory` prayer opening | `patna_hc.json` → `"It is, therefore, most humbly prayed..."` | Draft used: `"In view of the facts and circumstances..."` |

**This is the entire point of SCRUM-50.** The court rules were built to prevent exactly this kind of generic output. The drafting engine (SCRUM-43) needs a code change to **load and inject** the court-rule fields into the prompt and template renderer.

**Filed as:** *new ticket needed for Vishal* — see end of this doc.

---

## 🐛 BUGS

### B1. Placeholder leakage — `legal_notice_s80`
- Para 1 of body: *"having its registered office at [address to be filled]"*.
- Form data did provide `applicant_address`. The address was used in the header but was not piped into the AI body context.
- **Fix:** Form data fields should be available in the AI's view, not just the template renderer's view.

### B2. Lowercase state name — `bail_regular` and `bail_anticipatory`
- Both drafts contain `"State of bihar"` (lowercase `b`). This is a placeholder substitution bug — `state` is being injected verbatim instead of being looked up against the `indian-courts.json` `name` field.
- **Fix:** Replace direct `{state}` injection with `courtsConfig.states.find(s => s.id === state).name` lookup.

### B3. Mislabelled `sectionsCited` — `consumer_complaint`
- The `done` event reports: `sectionsCited: ["BNS 35","BNS 2(7)","BNS 2(11)","BNS 2(10)","BNS 2(47)","BNS 34","BNS 69"]`.
- These are all **Consumer Protection Act, 2019** sections — not BNS. The validator is mis-tagging every section as "BNS".
- **Fix:** Section validator needs to read the document's `relevantActs` array and tag accordingly.

### B4. Over-triggered fact-alteration warning — `bail_regular`
- The `warning` event flagged: *"Date 16.03.2026 may not appear in the AI draft"* — but it does appear in para 4 (formatted as `16/03/2026`).
- **Fix:** Date comparator should normalise date formats before checking presence.

### B5. Date format inconsistency — across the board
- Same draft uses both `2026-03-25` (ISO) in subject lines and `25.03.2026` (DD.MM.YYYY) in body. Indian filings consistently use DD.MM.YYYY or DD-MM-YYYY.
- **Fix:** All dates rendered in any output position should pass through a single Indian-format formatter.

### B6. Outdated pecuniary jurisdiction — `consumer_complaint`
- Body para 9: *"District Commission… extends up to Rs. 1 crore."*
- After the **CPA (Jurisdiction Notification), 2021**, District Commission's pecuniary jurisdiction was reduced to **₹50 lakh** (then revised again — verify current limit). "Up to ₹1 crore" was the position pre-2021.
- **Fix:** This should be a static fact in the template, not generated. Hard-code `"up to Rs. 50 lakh"` in `consumer_complaint.json` `promptInstructions`.

### B7. Invented contractual terms — `rent_agreement`
- Para 11 invents an **18% per annum default interest rate** on overdue rent (not in form data).
- Para 11 also invents a **30-day default termination right** that contradicts the explicit 2-month notice clause already in the agreement.
- Para 14 invents a force majeure clause; Para 15 invents a 24-hour inspection notice clause.
- These are "helpful" hallucinations — AI fills standard clauses without permission. For a contract, every term has legal weight. Inventing an 18% rate could expose the landlord to challenge.
- **Fix:** Prompt must explicitly say *"Do not introduce any term not present in the form_data. Standard boilerplate may only be added if explicitly enabled via `include_boilerplate: true` form flag."*

### B8. Cause title duplication — `bail_regular`
- Cause title rendered as: `"IN THE COURT OF Court of Sessions Judge, Patna\nAT Patna"`.
- Note: "Court of" appears twice and "Patna" appears twice.
- **Root cause:** Template literally injects `court_name` (which already starts with "Court of") into a string that already has "IN THE COURT OF" prefix.
- **Fix:** Template should derive designation from `courts[].designation` field in `indian-courts.json`, not from the user's free-text `court_name` form input.

---

## ✅ WHAT WORKS WELL

- **BNS section adoption is correct.** No drafts fell back to old IPC numbering. BNS 303, 351, 318(4), 336(3) — all correctly used. SCRUM-27 mappings are paying off.
- **`bail_anticipatory` correctly cites Sushila Aggarwal v. State (2020) 5 SCC 1** — the prompt instruction worked.
- **`legal_notice_s138` is the strongest draft.** Cheque details preserved, 15-day demand clear, 30-day filing window referenced, S.142(1)(b) called out in checklist. Production-ready with one minor fix (S.141 reference where individual is the drawer).
- **`legal_notice_s80` correctly invokes 2-month notice period** and structures the demand cleanly.
- **Filing checklists are practical and well-curated** — every draft ends with a usable list. Nice touch.
- **Streaming response (SSE) works** — drafts arrived in chunks, completion event fires correctly with `mandatoryClausesComplete: true`.
- **Disclaimer footer is appended consistently** — good for compliance.

---

## 📊 SCORECARD

| # | Template | HTTP | Latency | Filing-killers | Bugs | Verdict |
|---|---|---|---|---|---|---|
| 1 | `bail_regular` | 200 | 16.0s | 1 (S3) | B2, B4, B8 | **Rework** |
| 2 | `bail_anticipatory` | 200 | 17.4s | 1 (S2) | B2 | **Rework** |
| 3 | `legal_notice_s80` | 200 | 120s* | 0 | B1 | **Minor fix** |
| 4 | `legal_notice_s138` | 200 | 120s* | 0 | minor (S.141 reference) | **Production-ready w/ tweak** |
| 5 | `rent_agreement` | 200 | 120s* | 0 | B7 | **Rework — strip invented terms** |
| 6 | `consumer_complaint` | 200 | 17.8s | 1 (S1) | B3, B6 | **Rework** |

*\*120s latency on 3 templates suggests the runner hit its 120s cURL timeout — the SSE stream may have completed, but cURL closed connection. Investigate.*

**Pass rate (legal correctness): 1 / 6 ready, 1 / 6 minor fix, 4 / 6 rework.**

---

## 🎯 ACTION ITEMS FOR VISHAL (suggested ticket)

**Priority order:**

1. **P0 — Fix S1, S2, S3 hallucinations.** Tighten prompt with explicit anti-hallucination rules:
   - Never assert facts not in `form_data` (investigation status, charge-sheet filing, party identity).
   - Look up bailable/non-bailable status of each cited BNS section before claiming.
   - Use `respondent_name` exactly — never substitute manufacturer/parent company.

2. **P0 — Wire SCRUM-50 court rules into the generation engine (G1).** This is the biggest lift. The prompt builder must:
   - Resolve `court_name` → `courts[].courtId` → `formattingRulesRef` → load court-rule JSON.
   - Inject `cause_title_format`, `party_designation`, `case_nomenclature`, `prayer_language`, `verification_format` into the template renderer (replacing the current generic strings).
   - Pass `localRules` array into the AI's system prompt as guardrails.

3. **P1 — Bug fixes (B1–B6, B8).** Each is small, but together they make the drafts look amateurish.

4. **P1 — Strip invented contractual terms (B7).** Add `include_boilerplate` flag; default `false`.

5. **P2 — Investigate 120s latency** on `legal_notice_s80`, `legal_notice_s138`, `rent_agreement`. Either streaming is slow or runner is closing too early.

6. **P2 — Add unit tests** for the 8 bugs above so they don't regress.

---

— Ajay, CLO
