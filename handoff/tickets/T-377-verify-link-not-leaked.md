# T-377 — The verify-email link never leaks through the referrer or access logs

| Field  | Value                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------- |
| Phase  | 4 — Polish and release                                                                            |
| Owner  | Lead (web) + Arjun (ops, nginx)                                                                   |
| Mode   | Small fix                                                                                         |
| Status | To do. Follow-up from T-223 review (Mahak, 13 Oct 2026). Next free lead after T-223 merges. Priya |
| Source | T-223 AC8 (no token or link in logs), at the infra level                                          |

## Acceptance criteria

1. `apps/web/next.config.mjs`: `/verify-email` gets the same `Referrer-Policy: no-referrer` header that T-306 gave its pages.
2. Ops (Arjun, server config): the nginx access log strips query strings for `/verify-email` and `/auth/callback`. The change is written in the ops doc or config in the repo for the founder to apply, if it lives on the server.
3. A test pins 1.
