# T-294 — docs/seeding.md still names the retired bns-bailability.json

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (doc-only) |
| Mode   | Small fix (docs) |
| Status | To do. After T-277 merges. Found in T-277 review round 4, 12 Oct 2026 |

`docs/seeding.md` (about line 41) still names `bns-bailability.json`, which T-277 retires (bailability is now derived from `bns-offences.json` at load time).

## Acceptance criteria

1. The line describes the current source (`bns-offences.json`, derived at load time). No other change.
