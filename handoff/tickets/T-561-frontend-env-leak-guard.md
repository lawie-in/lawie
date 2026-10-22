# T-561: Guard against secrets reaching the browser

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (before main) |
| Owner  | Arjun (security review), a lead (build) |
| Mode   | Small fix (web, CI) |
| Status | To do. Founder concern, 22 Oct 2026. Priya |
| Source | Founder: "variables getting into the frontend from .env" |

## Facts checked 22 Oct 2026
Only two `NEXT_PUBLIC_*` variables exist in `apps/web` (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME`), both public by design. The only other variables the web app reads on the server are `SENTRY_DSN`, `NODE_ENV`, `NEXT_RUNTIME`, `CI` (server and edge config, not client code). `.env.example` holds names with empty or placeholder values, and the T-543 test fails on any secret-looking value.

## Acceptance criteria
1. A test that fails if any `NEXT_PUBLIC_*` name contains SECRET, KEY, TOKEN, PASSWORD, PASS, DSN-with-credentials or similar, or if one is added that is not on an allow-list kept in the test.
2. A CI step that builds web and greps the built client bundle (`.next/static`) for the values of known secret variables from a dummy env and for secret-shaped strings (gitleaks over the build output).
3. A gitleaks full-history scan of the repository (not only staged changes); the report lists findings by commit and path with no values; anything real is rotated by the founder.
4. A line in the leads' protocol: a variable the browser needs is `NEXT_PUBLIC_` and public; everything else is read only by backend services. Name any new `NEXT_PUBLIC_` variable in the handoff and READY.
