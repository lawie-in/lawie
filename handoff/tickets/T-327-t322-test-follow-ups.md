# T-327 — t322 test follow-ups

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (tests; one small export) |
| Mode   | Small fix (legal content; Ajay sees the diff) |
| Status | Merged into develop_staging (cd5b32b, 12 Oct 2026). Waiting for Anushka on develop |

## Acceptance criteria

1. Export `SIGNED_BLANKS` from brief-drafter.ts so the t322 pin imports it instead of parsing the source text. No behaviour change.
2. Rename the misnamed "KNOWN GAP (R2b.2)" test to say what it checks.
3. Ajay's ruling, 12 Oct 2026 (code in brief-drafter.ts): a paragraph covers default_bail `applicable_window` if it holds exactly the period blank this brief gives, read from the brief at check time. Other "[To be confirmed" text doesn't count.
4. Tests: the brief's own blank covers; a different blank does not.
