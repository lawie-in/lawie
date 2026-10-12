# T-320 — Follow-ups from T-315: tests, billing webhook parse, email-worker CI

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build). Arjun glance |
| Mode   | Small fix |
| Status | Merged into develop_staging (d34a5d7, 12 Oct 2026). Nothing to test in the UI |

## Acceptance criteria

1. The t315 leak checks are case-insensitive. The email-worker tests run in both prod and dev env. The gateway test targets only the T-315 error layer (today it calls every layer, which is brittle; corrected by Tanvi). The shared code map is frozen (`Object.freeze`).
2. The billing webhook wraps `JSON.parse(req.body)`, after the signature check, in a try/catch and answers a plain 400. Nothing from the body is logged.
3. email-worker gets a CI job in `.github/workflows/ci.yml` (build plus test). CI files are root config, held by one lead at a time.
