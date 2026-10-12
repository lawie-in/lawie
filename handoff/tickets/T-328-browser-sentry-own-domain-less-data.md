# T-328 — Browser error reporting through our own domain, with less data

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (spec: last section of the T-310 file, c87f43a). Ajay (ruling). Lead (build, web) |
| Mode   | Small fix (web) |
| Status | To do. Ajay ruled (T-310 Addendum 1, 93d0fcc): allowed before consent, with conditions. Arjun's spec updated (688860f). Kunal after T-310 (same files) |

## Acceptance criteria

1. Browser Sentry sends through our own domain (a tunnel), not straight to a third party, per Arjun's spec.
2. Less data goes out (Arjun's list in the spec).
3. Files: `apps/web/sentry.client.config.ts`, `apps/web/next.config.mjs`.
4. Ajay's conditions: no cookies or local ids, no session replay, no form, draft or document text, sent via our own domain, and Sentry stays listed on the privacy page. If any of these breaks, reporting moves behind Accept.
