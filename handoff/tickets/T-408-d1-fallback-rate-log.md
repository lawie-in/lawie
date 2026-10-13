# T-408 — One fallback-rate log line per D1 draft

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) |
| Mode   | Small fix |
| Status | To do. Not assigned (Vishal after T-373 if nobody else is free). From T-373 review round 2, 13 Oct 2026 |
| Source | T-373 reviewer should-fix; Arjun wants the per-pack fallback rate readable from logs |

## Acceptance criteria

1. Every D1 draft logs exactly one structured line with pack id, clause count and fallback count, including when the fallback count is zero.
2. No document content or personal data in the line.
3. A test pins the line for a draft with fallbacks and one with none.
