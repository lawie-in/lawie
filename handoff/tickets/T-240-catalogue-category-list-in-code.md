# T-240 — Template category comes from one list in code, not the rule files

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Matter context |
| Owner          | Lead (build). Ajay (confirms the category names). Anushka (checks the library filters) |
| Mode           | Full chain |
| Status         | Building: tanvi (12 Oct 2026) |
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
4. Re-filing, signed by Ajay on 12 Oct 2026:
   - `legal_notice_s138` → Cheque bounce / NI Act;
   - `rent_agreement` → Rent control and tenancy;
   - `posh_complaint` → Service and labour;
   - Supreme Court review and curative petitions → Writs and constitutional;
   - civil review (O.47) → Civil: appeals, revision, review, execution;
   - all bail values → Criminal: bail and custody.
   
   Category names as in T-239.

## Follow-ups folded in (from shashank, T-227)

5. `PRICE_ALIASES` (credits.service.ts) duplicates `DOC_TYPE_TO_RULE` (prompt-assembler.ts, not exported). Export one map and use it in both places.
6. The rule files still carry a `creditsCost` that is now ignored, and a `category` that this ticket makes ignored. Removing them touches legal paths: Ajay decides whether to remove them, and signs that diff.
7. Settle one list of `court_levels` values. Packs use different names today (`magistrate` vs `magistrate_jmfc`, `sessions` vs `sessions_court`). Ajay, 12 Oct 2026.
8. Check the price at the top of each generate handler in documents.routes.ts, the lines outside T-227's range (shashank, 12 Oct 2026).

## Per-batch files, so leads don't collide (Priya, 12 Oct 2026)

Every new template touches the category list and the price list (T-227), and two leads building at once would both edit them. So:
9. The category list and the price list are each split into one file per batch under `apps/drafting/src/config/catalogue/` (for example `batch1-civil.ts`), merged when loaded. The existing 92 ids go in `base.ts`.
10. The tests from T-227 and this ticket still apply to the merged list: every rule file has exactly one category and an explicit price, and a missing entry fails CI.
11. A lead claims only their own batch file, so builds run in parallel.
