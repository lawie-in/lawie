# T-316 — t241 tests: honest labels and real paragraph numbers

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (tests only) |
| Mode   | Small fix (tests only) |
| Status | Merged into develop_staging (2353146, 12 Oct 2026). Tests only |

## Acceptance criteria

1. The two t241 tests labelled "ENFORCED" are relabelled "mock pass-through", which is what they check.
2. The `draft()` helper in the t241 tests reports clauses at their real paragraph numbers.
3. Tests only. No source change.
