# T-328 — Browser error reporting through our own domain, with less data

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (spec: last section of the T-310 file, c87f43a). Ajay (ruling). Lead (build, web) |
| Mode   | Small fix (web) |
| Status | To do. Waits on Ajay's ruling: is error reporting allowed before consent? Lead after T-310 (next.config.mjs is in Kunal's claim). Raised by Arjun, 12 Oct 2026 |

## Acceptance criteria

1. Browser Sentry sends through our own domain (a tunnel), not straight to a third party, per Arjun's spec.
2. Less data goes out (Arjun's list in the spec).
3. Files: `apps/web/sentry.client.config.ts`, `apps/web/next.config.mjs`.
4. It follows Ajay's ruling on reporting before consent.
