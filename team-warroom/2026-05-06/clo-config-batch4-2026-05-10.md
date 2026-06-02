# CLO Config Hardening — Batch 4 Audit Log

**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**Scope:** 13 court-rules JSON files under `/apps/drafting/src/config/court-rules/`

## Summary

- `_meta` block added: **13/13** files
- 7-field schema gaps: **0** (all files already had the 7 required fields from SCRUM-50 baseline; `supported_languages` defaulted where needed — none needed)
- State-specific enhancements: **4 HCs**, **2 districts**, **0 generics (party_designation only)**; **13/13** got `e_filing_mandatory`
- JSON validity: **13/13 PASS** (`python3 -m json.tool` per file)

## Per-file audit

| File | _meta | 7-field complete | Fields added |
|------|-------|------------------|--------------|
| allahabad_hc.json | ADDED | YES | _meta, e_filing_mandatory, e_filing_effective_from (2024-01-01), state_capital_default_respondent (UP/Lucknow), local_rules (canonical alias) |
| delhi_hc.json | ADDED | YES | _meta, e_filing_mandatory, e_filing_effective_from (2021-09-01), state_capital_default_respondent (NCT Delhi), local_rules (alias) |
| jharkhand_hc.json | ADDED | YES | _meta, e_filing_mandatory, e_filing_effective_from (2024-01-01), state_capital_default_respondent (Jharkhand/Ranchi), local_rules (alias) |
| patna_hc.json | ADDED | YES | _meta, e_filing_mandatory, e_filing_effective_from (2024-01-01), state_capital_default_respondent (Bihar/Patna), local_rules (alias) |
| bihar_district.json | ADDED | YES | _meta, e_filing_mandatory=false (party labels already Applicant/OP — correct) |
| delhi_district.json | ADDED | YES | _meta, e_filing_mandatory=false, party_designation refined (Plaintiff/Defendant civil; Applicant/OP criminal) |
| jharkhand_district.json | ADDED | YES | _meta, e_filing_mandatory=false (party labels correct) |
| up_district.json | ADDED | YES | _meta, e_filing_mandatory=false, party_designation refined (Plaintiff/Defendant civil; Applicant/OP criminal) |
| cjm_generic.json | ADDED | YES | _meta, e_filing_mandatory=false (BNSS s.16 jurisdiction noted in jurisdictionNote) |
| jmfc_generic.json | ADDED | YES | _meta, e_filing_mandatory=false (BNSS s.17 — preserved minimal nature) |
| sessions_generic.json | ADDED | YES | _meta, e_filing_mandatory=false |
| district_court_generic.json | ADDED | YES | _meta, e_filing_mandatory=false |
| consumer_commission_generic.json | ADDED | YES | _meta, e_filing_mandatory=false (SCRUM-50 Round 4 baseline preserved) |

## Notes

- Existing `eFilingMandatory` (camelCase) preserved in HCs for backwards compatibility; new canonical `e_filing_mandatory` (snake_case) added per Batch-4 spec.
- `localRules` (camelCase) preserved; `local_rules` snake_case alias added on HCs for ≥3 jurisdictional rules requirement.
- UP/Delhi district `party_designation` updated to combined civil/criminal labels; bihar/jharkhand left at Applicant/OP per earlier SCRUM-50 sign-off.
- JSON files written via Python `json.dump` with `indent=2`; `_meta` placed as first key in every file.

## Validation

```
$ for f in *.json; do python3 -m json.tool "$f" > /dev/null && echo "OK $f"; done
OK allahabad_hc.json
OK bihar_district.json
OK cjm_generic.json
OK consumer_commission_generic.json
OK delhi_district.json
OK delhi_hc.json
OK district_court_generic.json
OK jharkhand_district.json
OK jharkhand_hc.json
OK jmfc_generic.json
OK patna_hc.json
OK sessions_generic.json
OK up_district.json
```

Batch 4 complete. Ready for next task.
