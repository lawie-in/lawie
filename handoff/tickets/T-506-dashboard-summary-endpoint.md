# T-506: Dashboard summary endpoint

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design or review), a lead (build) |
| Mode   | Full chain |
| Status | To do. V1 (Priya, 17 Oct 2026). Unassigned until Priya claims a lead |
| Files  | apps/drafting (new route + service + test) |
| Source | V1 UI checklist, Arjun's code scan (17 Oct 2026) |

## Problem

The new dashboard needs month drafts, drafts by type, draft vs finalised counts, Ink used this month and failed-generation count in one call. Today /documents/usage is shaped for the free-tier limit and uses server time.

## Acceptance criteria

1. `GET /api/drafting/dashboard/summary` returns, for the signed-in user only: draftsThisMonth, byType, statusCounts (draft, finalised, exported), inkUsedThisMonth, failedCount.
2. The month boundary is the calendar month in India time (IST), not server time.
3. Excludes test-run fixtures (runOrigin=fixture).
4. Index on `{userId, createdAt}` for Generation and Document if missing.
5. No personal data or document content in logs; the gateway allowlist includes the route.
6. Tests: boundary at month change (IST), fixtures excluded, other users' rows never returned.
