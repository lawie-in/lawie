# T-348 — Scrub the web server and edge Sentry events

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (condition 3 of T-242). Lead (web) |
| Mode   | Small fix (web) |
| Status | To do. BEFORE PROD (Ajay's T-242 condition 3). Kunal next, right after T-242. Raised by Kunal's T-242 round 3 review, 12 Oct 2026 |

`apps/web/sentry.server.config.ts` and `sentry.edge.config.ts` (tracesSampleRate 0.2) have no scrub. Any landing URL like `/?utm_source=x` reaches Sentry with its query. This predates T-242 (T-229: "apps/web Sentry: no beforeSend scrub today") but breaks Ajay's condition 3: UTM never to GA, Sentry or logs. Auth and gateway were fixed in T-242.

## Acceptance criteria

1. Web server and edge Sentry scrub events and transactions the same way as auth and gateway: no query string, no query in URLs or span data (`http.url`, `http.query`), emails masked.
2. A SENTINEL test: a request with `?utm_source=SENTINEL` produces no Sentry payload containing `SENTINEL`.
3. Ajay sees the diff.
