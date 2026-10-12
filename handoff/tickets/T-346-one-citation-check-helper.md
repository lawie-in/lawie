# T-346 — One shared helper for the post-draft citation check

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Lead (drafting) |
| Mode   | Small fix |
| Status | To do. Shashank after T-347, and after Mahak's T-338 frees ai.service.ts (12 Oct 2026) |

The three draft paths repeat the same three-step citation check. Move it into one helper so the paths can't drift apart.

## Acceptance criteria

1. One helper runs the check; all three draft paths call it.
2. No change in behaviour: the T-270 and T-333 tests pass unchanged, goldens don't move.

## Note (Priya, 12 Oct 2026)

While in `ai.service.ts`, fix the stale comment near line 975 ("ledger.unresolved … read by the fact verifier only"); T-338 now passes unresolved keys to the Drafter too (from Mahak).
