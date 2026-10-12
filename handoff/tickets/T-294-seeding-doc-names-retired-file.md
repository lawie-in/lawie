# T-294 — docs/seeding.md still names the retired bns-bailability.json

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (doc-only) |
| Mode   | Small fix (docs) |
| Status | Merged into develop_staging (205e199, 12 Oct 2026). Nothing to test in the UI |

`docs/seeding.md` (about line 41) still names `bns-bailability.json`, which T-277 retires (bailability is now derived from `bns-offences.json` at load time).

## Acceptance criteria

1. The line describes the current source (`bns-offences.json`, derived at load time). No other change.

## Rides along (Priya, 12 Oct 2026, from T-297 review)

Widen the t297 term-guard regex in `apps/drafting/src/__tests__/t297-jurisdiction-notes.test.ts` to also catch "more than / less than / below / above" and "N years or more". Nothing matches today; this is a guard for future text.
