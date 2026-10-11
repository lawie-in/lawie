# T-240 — Template category comes from one list in code, not the rule files

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Matter context |
| Owner          | Lead (build). Ajay (confirms the category names). Anushka (checks the library filters) |
| Mode           | Full chain |
| Status         | To do. Unassigned. Needed before T-239 batch 1. Starts after T-227 merges (same pattern, nearby files) |
| Depends on     | T-227 |

## Problem

The category sits inside each signed rule file, and the values are inconsistent:
- `legal_notice_s138` is filed under criminal;
- `rent_agreement` is under civil;
- `posh_complaint` is under tribunal;
- review and curative petitions are under writ;
- bail is split across three values.

Fixing this inside the rule files means touching signed legal content, and scaling to 500 templates would make it worse.

## Acceptance criteria

1. One catalogue list in code maps every template id to one of the 26 categories in T-239. `category` in the rule files is ignored. `document-rules/` is not touched.
2. The library, filters and seed read the category from that list.
3. Test: every rule file has exactly one category in the list. A new rule file without one fails CI.
4. Ajay confirms the category names and the re-filing (e.g. `legal_notice_s138` → Cheque bounce / NI Act).
