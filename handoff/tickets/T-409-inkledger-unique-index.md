# T-409 — Unique index on the Ink ledger

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (billing); Arjun |
| Mode   | Small fix (migration) |
| Status | To do. Not assigned; after T-399. From Kunal's T-399 Explore (Arjun, 13 Oct 2026) |
| Source | T-399 Explore |

## Acceptance criteria

1. The inkledger collection gets a unique index on its idempotency key (for example, `sub_drip:<subId>:<n>` and the grant keys), so a duplicate grant can't be written even under a race.
2. A migration creates the index safely on existing data; it finds and reports any existing duplicates first, and doesn't fail on them silently.
3. A test shows that a second insert with the same key is rejected and handled.
