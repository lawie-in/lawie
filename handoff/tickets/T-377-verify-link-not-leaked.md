# T-377 — The verify-email link never leaks through the referrer or access logs

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web) + Arjun (ops, nginx) |
| Mode   | Small fix |
| Status | Merged into develop_staging 846ad85 (Mahak, 15 Oct 2026): Referrer-Policy header, nginx.prod.conf query stripping, docs/nginx-access-log.md, test. Follow-up pending: widen the map to the Google callback (Arjun). Priya |
| Source | T-223 AC8 (no token or link in logs), at the infra level |

## Acceptance criteria

1. `apps/web/next.config.mjs`: `/verify-email` gets the same `Referrer-Policy: no-referrer` header that T-306 gave its pages.
2. Ops (Arjun, server config): the nginx access log strips query strings for `/verify-email` and `/auth/callback`. The change is written in the ops doc or config in the repo for the founder to apply, if it lives on the server.
3. A test pins 1.
