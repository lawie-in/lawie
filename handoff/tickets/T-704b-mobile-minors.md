# T-704b: Phone layout minors

Status: backlog, P3, web (next month). From Rajesh's T-704 review, 30 Oct 2026.

1. /admin/users: the Name column wraps one word per line; give it a min-width of about 160px.
2. Admin overview: the fifth KPI card sits alone at half width; the last odd card should span both columns.
3. Document page: the Annexures row and the legacy editor toolbar are two stacked surfaces. Do this with the editor toolbar rebuild.
4. Docs: in apps/web/e2e/README, note that in the cloud container the Playwright dev server needs NODE_USE_ENV_PROXY=1 and NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt, or next/font fails.
