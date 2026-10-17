# T-519: Index for the Ink ledger (needed by the dashboard, T-506)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (ruled 17 Oct 2026), a billing lead (build) |
| Mode   | Full chain (billing) |
| Status | To do. Must be merged before anything goes to main. Priya |
| Source | T-506 review; Arjun's ruling |

## Problem
`inkledger` is a raw collection (insertOne in `ink-ledger.service.ts`), with no schema and no index anywhere. The dashboard's Ink total (T-506) reads it by user and date, so every dashboard load scans the collection.

## Acceptance criteria
1. Billing creates `{ userId: 1, createdAt: -1 }` on `inkledger` idempotently at startup with `createIndex` (background). No hand-run mongosh.
2. A failure to create the index is logged and does not stop billing from starting.
3. A test that startup calls `createIndex` once with that key (mocked).
4. Link: T-506 may merge and run on the test box before this lands; this ticket merges before any release to main.
