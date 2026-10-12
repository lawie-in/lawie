# T-327 — t322 test follow-ups

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (tests; one small export) |
| Mode   | Small fix |
| Status | To do. Vishal after T-322. Found in T-322 review, 12 Oct 2026 |

## Acceptance criteria

1. Export `SIGNED_BLANKS` from brief-drafter.ts so the t322 pin imports it instead of parsing the source text. No behaviour change.
2. Rename the misnamed "KNOWN GAP (R2b.2)" test to say what it checks.
3. If Ajay rules on the brief's own period blank (T-251 instruction 5), that change rides here with his text and a test.
