# T-704: Drafting page and admin panel work at phone width

Status: MERGED into develop_staging 34e3e36c (30 Oct 2026; Playwright at 390px: 14/14 on 11 pages; web sanity 289/289; CI was still running at merge). Rajesh reviews the screenshots after merge. Was: building (arjun). Raised 30 Oct 2026 by Priya on the founder's order via Arjun (13:40 UTC). Built by Arjun directly with crew agents; no dev lead.

Scope: the drafting page and the admin panel break at phone width. Make both usable on a phone with no horizontal scroll.

Gates: Rajesh signs off any visual change (.claude/docs/ui-quality.md).

## Rajesh review (30 Oct 2026)
Fix now (Arjun):
- The document page header title and back arrow are invisible: slate text on the Night header. Check at 1280 too.
- The /dashboard/new folio heading has no inner padding at 390, so the h1 touches the viewport edge.

Deferred (T-704b, next month):
- The admin Users name column needs a min-width of about 160px.
- The odd last KPI card on the admin overview spans both columns.
- The document page's Annexures row and the legacy toolbar are two stacked surfaces; this waits for the toolbar rebuild.

Note for the e2e README: in the cloud container the dev server needs NODE_USE_ENV_PROXY=1 and NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt, or next/font cannot fetch Google Fonts.
