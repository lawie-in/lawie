# T-282 — Pin Ajay's exact signed strings in the t237 tests

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Lead (build). Ajay sees the diff |
| Mode           | Small fix (drafting tests only) |
| Status         | To do. Unassigned. Raised by Vishal's reviewer (T-237), 12 Oct 2026 |
| Depends on     | T-237 merged. Best done with T-241 (same packs) |

The reviewer's should-fix on T-237, not taken so the approved commit stayed unchanged: the `t237-*` tests do not pin Ajay's exact signed strings. If someone edits the wording later, no test fails.

## Acceptance criteria

1. The `t237` tests assert, word for word from `handoff/legal/T-237-pack-text-signed.md`: the new clause descriptions, the new `promptInstructions` entries, and anticipatory entry 5.
2. A one-character change to any of these makes a test fail.
3. Test edits only; Ajay sees the diff.
