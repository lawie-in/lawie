# T-307 — Drafting has no JSON-error handler

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build, drafting). Arjun glance |
| Mode   | Small fix (drafting app.ts) |
| Status | Merged into develop_staging (002d7bd, 12 Oct 2026). Nothing to test in the UI |

A malformed JSON body to drafting gets Express's default 400 page. In development it echoes about 12 characters of the body. Production must return a plain JSON 400 that echoes nothing.

## Acceptance criteria

1. One error handler in `apps/drafting/src/app.ts` turns a JSON parse error into `400 {"error": "Bad Request"}`, echoing no part of the body, in every environment.
2. Check whether Sentry captures it; if it does, it must carry no body text.
3. A test sends a malformed body and checks the response.
