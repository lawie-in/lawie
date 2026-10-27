# T-640: The persisted-ledger fill applies the non-answer rule (Ajay FR-9)

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Phase 1 prep (legal) |
| Owner  | a lead (drafting) |
| Mode   | Small fix; legal |
| Status | To do. Raised 27 Oct 2026 (Ajay FR-9, 4813ba79; T-637 applies it to the in-memory ledger). Priya |

## Acceptance criteria
1. In the persisted-ledger held-fact fill, "Not known"-type answers give no fact, and none/NA are never printed into a blank. The same list and rule as T-637.
2. Tests; Ajay byte-checks at READY.
