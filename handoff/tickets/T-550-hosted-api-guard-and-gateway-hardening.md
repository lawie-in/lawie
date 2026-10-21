# T-550: Keep tests off hosted APIs, and two gateway hardenings

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a lead (build) |
| Mode   | Full chain (web build config, gateway, test tooling) |
| Status | To do. Items 1 and 2 before main. Priya, 21 Oct 2026 |
| Source | Arjun, incident 21 Oct 2026 (`handoff/ops/incident-2026-10-21-stray-e2e-traffic.md`) |

1. Local builds and test scripts default `NEXT_PUBLIC_API_URL` to a local URL; a build-time check fails if a test run's URL is a hosted host. Playwright (T-523) denies every non-local request by default.
2. Gateway: pin `jwt.verify` to `algorithms: ['HS256']`.
3. Per-IP rate limit on `POST /consent` (there is none today).

4. E2E never writes to a real consent log: stub the endpoint or tag test traffic (Ajay, 21 Oct 2026). On prod, consent rows are only marked invalid with a reason, never deleted.

Acceptance: tests for each; the T-523 smoke fails if it tries a non-local request.
