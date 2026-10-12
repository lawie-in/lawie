# T-339 — Splash survives blocked storage; drop the unused browser Sentry DSN

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish |
| Owner  | Lead (web) |
| Mode   | Small fix (web only) |
| Status | To do. Follow-up from T-328 + T-332 (Kunal's reviewer, 12 Oct 2026) |

Two leftovers from T-328 + T-332:

- `apps/web/src/components/marketing/LogoSplash.tsx` calls `sessionStorage.getItem` without a guard. With storage blocked (private mode, site data off) it throws. The consent card still shows.
- T-328 deleted browser Sentry, so `NEXT_PUBLIC_SENTRY_DSN` is now unused in the web example env files (four of them).

## Acceptance criteria

1. With `sessionStorage` blocked (getter or `getItem` throws), the splash renders and ends normally and nothing throws.
2. `NEXT_PUBLIC_SENTRY_DSN` is removed from the web example env files and any setup doc that lists it; no code reads it.
3. A test for AC1. Web build and tests green.
