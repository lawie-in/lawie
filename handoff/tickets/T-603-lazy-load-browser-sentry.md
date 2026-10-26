# T-603: Lazy-load the browser Sentry SDK after load, keep the early-error buffer

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (performance follow-up to T-586; web only, no UI) |
| Owner  | Arjun (design), a lead (build) |
| Mode   | Small fix (web only) |
| Status | To do. Raised by Arjun, 26 Oct 2026, from Kunal's T-601 measurement. Priya |
| Source | Kunal's T-601 report: the Sentry browser chunk is about 126 KB gzipped and loads on every route; total landing JS is 335 KB |

## Acceptance criteria
1. Load the browser Sentry SDK after the window `load` event (or on first user interaction), not in the initial route chunks. It cuts about 126 KB from every route.
2. Keep an early-error buffer: errors and unhandled rejections raised before the SDK loads are captured and replayed into Sentry once it is ready (a tiny inline listener; no PII, same scrub applies).
3. The DSN guard, the shared scrub, release and environment from T-586 are unchanged; no DSN means no SDK load at all.
4. Tests: error before load is delivered after load; no DSN means no load; scrub still applies. Web tests and build green; record the First Load JS before and after.

## Files
apps/web/instrumentation-client.ts and its tests. Claimed by Priya when a lead takes it; after T-601 merges (same web area).
