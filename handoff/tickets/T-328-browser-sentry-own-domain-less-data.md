# T-328 — Browser error reporting through our own domain, with less data

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (spec: last section of the T-310 file, c87f43a). Ajay (ruling). Lead (build, web) |
| Mode   | Small fix (web) |
| Status | Building: kunal, with T-332 (12 Oct 2026) |

## Acceptance criteria

1. Browser Sentry sends through our own domain (a tunnel), not straight to a third party, per Arjun's spec.
2. Less data goes out (Arjun's list in the spec).
3. Files: `apps/web/sentry.client.config.ts`, `apps/web/next.config.mjs`.
4. Ajay's conditions: no cookies or local ids, no session replay, no form, draft or document text, sent via our own domain, and Sentry stays listed on the privacy page. If any of these breaks, reporting moves behind Accept.

## Arjun (12 Oct 2026): browser Sentry is not running; option (B)

Kunal found that with Next 16 Turbopack, `sentry.client.config.ts` is never loaded (no built chunk has the client init), so the browser sends nothing to Sentry today. My T-310 note assumed it ran; it does not.

**Decision: (B).** Keep browser Sentry off and delete the dead `apps/web/sentry.client.config.ts`. Do not add `instrumentation-client.ts`, and do not add `tunnelRoute` (nothing would use it). Server and edge Sentry stay as they are. Reason: turning it on pre-v1 is a new data flow (URLs with OAuth codes, Referer, UA) for little gain while we have few users; server-side errors are already captured.
- AC: no built web chunk contains `Sentry.init` for the client; `/` with no consent makes no request to any host but our own (same check as T-310 AC6).
- Ajay's T-310 Addendum 1 stays valid for a future switch-on; it needs no re-rule now. **If anyone turns browser Sentry on later**, it is a new ticket with: all of Kunal's settings (tunnel, traces 0, no replay, `sendDefaultPii: false`, no BrowserSession, `beforeSend` scrub) plus query strings stripped from `request.url` and from navigation breadcrumbs' `from`/`to`, `Referer` and `User-Agent` headers dropped, and Ajay re-confirming against his conditions.
