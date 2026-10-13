# T-389 — Skeleton loader accepts a scalar `equals` and `all_of`

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — After v1 |
| Owner  | Lead (drafting) |
| Mode   | Small fix |
| Status | To do. Not assigned. Found by Tanvi in T-374, 13 Oct 2026 |
| Source | T-374 review |

## Acceptance criteria

1. The rule-pack.service.ts skeleton loader accepts an averment entry whose `equals` is a scalar, or that is wrapped in `all_of`. Today it accepts only an array `equals`.
2. Today's four signed skeletons load byte-equal and behave the same. A test pins this.
3. No skeleton under `_skeletons/` changes. The ticket is loader code only, so Ajay's sign-off isn't needed.

Not hit today. Do it only when a signed skeleton needs it.
