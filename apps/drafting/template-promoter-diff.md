# Template promoter diff report (SCRUM-81)

Compares each template's `docs/templates/<id>.json` override against the SCRUM-78 promoter output from `apps/drafting/src/config/document-rules/<id>.json`. Verdict: **retire** = override safe to delete (max drift ≤ 0.05), **keep** = override required (one or more dimensions exceed tolerance).

| Template             | Verdict  | Max drift | Form fields | Doc structure | Validation | Metadata |
| -------------------- | -------- | --------- | ----------- | ------------- | ---------- | -------- |
| `bail_anticipatory`  | **keep** | 1.00      | 1.00        | 0.00          | 1.00       | 0.33     |
| `bail_regular`       | **keep** | 1.00      | 1.00        | 0.00          | 1.00       | 0.33     |
| `consumer_complaint` | **keep** | 1.00      | 1.00        | 0.00          | 0.88       | 0.67     |
| `legal_notice_s138`  | **keep** | 1.00      | 1.00        | 0.00          | 0.63       | 0.33     |
| `legal_notice_s80`   | **keep** | 1.00      | 1.00        | 0.00          | 0.63       | 0.33     |
| `rent_agreement`     | **keep** | 1.00      | 1.00        | 0.00          | 0.63       | 0.33     |

## `bail_anticipatory` — keep

**Reason:** formFields drift 1.00 exceeds tolerance (0/16 field ids shared · only-in-override: fir_number, fir_date, police_station, sections_charged, currently_in_custody…)

- form_fields (drift 1.00): 0/16 field ids shared · only-in-override: fir_number, fir_date, police_station, sections_charged, currently_in_custody…
- doc_structure (drift 0.00): 7/7 section ids shared
- validation_rules (drift 1.00): allowed=1.00 reject=1.00 mandatory=1.00 flags=1.00
- metadata (drift 0.33): icon: "shield" vs "file-text"

## `bail_regular` — keep

**Reason:** formFields drift 1.00 exceeds tolerance (0/17 field ids shared · only-in-override: fir_number, fir_date, police_station, sections_charged, currently_in_custody…)

- form_fields (drift 1.00): 0/17 field ids shared · only-in-override: fir_number, fir_date, police_station, sections_charged, currently_in_custody…
- doc_structure (drift 0.00): 7/7 section ids shared
- validation_rules (drift 1.00): allowed=1.00 reject=1.00 mandatory=1.00 flags=1.00
- metadata (drift 0.33): icon: "scales" vs "file-text"

## `consumer_complaint` — keep

**Reason:** formFields drift 1.00 exceeds tolerance (0/19 field ids shared · only-in-override: state, court_type, court_name, applicant_name, father_name…)

- form_fields (drift 1.00): 0/19 field ids shared · only-in-override: state, court_type, court_name, applicant_name, father_name…
- doc_structure (drift 0.00): 7/7 section ids shared
- validation_rules (drift 0.88): allowed=1.00 reject=1.00 mandatory=1.00 flags=0.50
- metadata (drift 0.67): category: "civil" vs "consumer"; icon: "alert-triangle" vs "file-text"

## `legal_notice_s138` — keep

**Reason:** formFields drift 1.00 exceeds tolerance (0/20 field ids shared · only-in-override: state, applicant_name, applicant_address, respondent_name, respondent_address…)

- form_fields (drift 1.00): 0/20 field ids shared · only-in-override: state, applicant_name, applicant_address, respondent_name, respondent_address…
- doc_structure (drift 0.00): 5/5 section ids shared
- validation_rules (drift 0.63): allowed=1.00 reject=0.00 mandatory=1.00 flags=0.50
- metadata (drift 0.33): icon: "file-warning" vs "file-text"

## `legal_notice_s80` — keep

**Reason:** formFields drift 1.00 exceeds tolerance (0/11 field ids shared · only-in-override: state, applicant_name, applicant_address, respondent_name, respondent_address…)

- form_fields (drift 1.00): 0/11 field ids shared · only-in-override: state, applicant_name, applicant_address, respondent_name, respondent_address…
- doc_structure (drift 0.00): 5/5 section ids shared
- validation_rules (drift 0.63): allowed=1.00 reject=0.00 mandatory=1.00 flags=0.50
- metadata (drift 0.33): icon: "mail" vs "file-text"

## `rent_agreement` — keep

**Reason:** formFields drift 1.00 exceeds tolerance (0/27 field ids shared · only-in-override: state, execution_place, execution_date, applicant_name, applicant_address…)

- form_fields (drift 1.00): 0/27 field ids shared · only-in-override: state, execution_place, execution_date, applicant_name, applicant_address…
- doc_structure (drift 0.00): 4/4 section ids shared
- validation_rules (drift 0.63): allowed=1.00 reject=0.00 mandatory=1.00 flags=0.50
- metadata (drift 0.33): icon: "home" vs "file-text"

---

**Summary:** retire 0 · keep 6 · missing-source 0 (total 6)
