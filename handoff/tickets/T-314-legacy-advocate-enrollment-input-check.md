# T-314 — Legacy advocateEnrollment has no length or brace check

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build, drafting). Ajay sees the diff (prompt input) |
| Mode   | Small fix (drafting) |
| Status | Merged into develop_staging (a10a220, 12 Oct 2026). Nothing to test in the UI |

The legacy request body field `advocateEnrollment` reaches the prompt (`prompt-assembler.ts` ~572) with no length or brace check. The advocate name already has these checks.

## Acceptance criteria

1. `advocateEnrollment` gets the same length and brace checks as the advocate name. A value that fails the checks is dropped (it then counts as empty under T-311's order), and the draft never fails.
2. Tests cover an over-long value and a value with braces.
3. Nothing from the value is logged.
