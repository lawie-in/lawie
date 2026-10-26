# T-623: Admin page for sign-ups and paying users per ad campaign

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Growth (marketing measurement) |
| Owner  | a lead (auth + web admin), after Phase 0 |
| Mode   | Small fix; Rajesh one line for the admin page |
| Status | To do. Raised 26 Oct 2026 from Meera's Google Ads test (handoff/marketing/google-ads-test.md). Priya |
| Source | Meera: the end-of-test read needs sign-ups and paying users per utm_campaign |

## Problem
GET /admin/users/count-by-source (T-242, apps/auth/src/routes/admin-users.routes.ts) counts sign-ups grouped by utm_source only. No admin page shows it, and it has no paying-user count. Until this ships, Arjun pulls the counts by hand (counts only).

## Acceptance criteria
1. The endpoint also groups by utm_campaign, or takes a `by=source|campaign` parameter. Users with no source are counted under "none".
2. Each group also counts users who have made at least one paid purchase.
3. An optional date range (from, to) on account creation.
4. An admin page shows the table. It is admin-only, with counts only: no names, emails or ids.
5. Tests cover the grouping, the paying count, the date range and admin-only access.

## Out of scope
A GA conversion event (Meera may ask after the test), and utm_term, utm_content and gclid capture.
