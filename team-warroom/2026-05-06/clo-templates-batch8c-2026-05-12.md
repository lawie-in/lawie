# CLO Template Batch 8c — Audit Log

**Date:** 2026-05-12
**Owner:** Ajay (CLO)
**Batch:** 8c — FINAL (5 procedural templates)
**Folder:** `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/`

---

## Templates Delivered (5)

| #   | template_id               | Title                                               | Court Levels                  | Credits | Status   |
| --- | ------------------------- | --------------------------------------------------- | ----------------------------- | ------- | -------- |
| 1   | `counter_affidavit`       | Counter-Affidavit / Reply Affidavit (Respondent)    | district / HC / SC / tribunal | 1       | Approved |
| 2   | `rejoinder_affidavit`     | Rejoinder Affidavit (Petitioner's Reply to Counter) | district / HC / SC / tribunal | 1       | Approved |
| 3   | `synopsis`                | Synopsis (HC / SC 1-Page Petition Overview)         | HC / SC                       | 1       | Approved |
| 4   | `list_of_dates`           | List of Dates (Chronological Events Table)          | HC / SC                       | 1       | Approved |
| 5   | `restoration_application` | Application for Restoration of Suit (O.IX R.9 CPC)  | district / HC original side   | 1       | Approved |

---

## Legal Correctness Anchors

### counter_affidavit.json

- Para-wise admit/deny structure mandated: "ad para X" formula for every petition para
- Verification clause splits paras into personal knowledge vs records (Order VI R.15 CPC)
- Preliminary objections before merits; additional pleadings after para-wise reply
- Deponent authority pleaded (officer / GPA / party in person)
- Cited: Order XIX CPC, SC Rules 2013 Order III, Notaries Act 1952, Oaths Act 1969

### rejoinder_affidavit.json

- Scope strictly limited to NEW pleas in counter — not re-arguing petition
- Leave of court ordinarily required (analogous Order VIII R.9 CPC)
- Reaffirmation of petition pleadings in one consolidated para
- Validation rule flags impermissible fresh grounds
- Cited: _Manmohan Singh v. PNB_ (2005) — limits of rejoinder

### synopsis.json

- Four mandatory sections fixed order: Issues / Brief Facts / Points of Law / Reliefs
- Maximum 1-2 pages enforced via length-check validation rule
- Issues framed as "Whether ...?" questions
- Cross-references petition paragraph numbers
- Cited: SC Rules 2013 Order XV, Bombay HC OS Rules, Delhi HC Rules, Allahabad HC Rules Ch. XXII

### list_of_dates.json

- Strictly chronological two-column table (Date | Event)
- Cause of action row highlighted; filing date final row
- For appeals/SLPs: impugned order date + certified copy receipt date both included (s.12 Limitation Act exclusion)
- BNS/BNSS/BSA citations for events post 01.07.2024
- Validation rule enforces ascending chronological order

### restoration_application.json

- Order IX R.9 CPC — plaintiff's non-appearance only (not ex-parte decree against defendant — that is R.13)
- 30-day limitation from dismissal (Limitation Act Art. 122)
- Beyond 30 days: separate s.5 Limitation Act condonation prayer
- "Sufficient cause" must be specific + documented (cited _Parimal v. Veena_ (2011) 3 SCC 545)
- Affidavit in support mandatory
- Notice to defendant before restoration (O.IX R.9(2))

---

## JSON Validity

All 5 files written as valid JSON. Structure conforms to schema (\_meta, template_id, title, category, creditsCost, court_levels, form_schema, mandatory_clauses, prompt_context, relevantActs, filing_checklist, validation_rules).

## Credits Cost

All 5 templates marked `creditsCost: 1` — procedural templates are short, formulaic, low-token relative to petitions.

## Open Items for Vishal (SCRUM-64 validator)

- All `relevantActs` strings are whitelist-ready
- Validation rules use ERROR / WARN / INFO severity (consistent with prior batches)
- No new field types introduced

---

**Batch 8c: COMPLETE. All 8 batches of the template universe shipped.**
