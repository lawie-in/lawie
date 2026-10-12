# T-347 — Flag a four-digit section number cited under any of the six codes

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Ajay (rule). Lead (drafting) |
| Mode   | Small fix |
| Status | To do. After T-333 merges. Asked for by Ajay, 12 Oct 2026 |

No section in the six codes has four digits, so such a cite is always wrong. The reader skips it today, so no warning appears.

## Acceptance criteria

1. A four-digit number cited with any of the six codes ("BNS 1034", "Section 2023 BNSS") gets the wrong-section warning after drafting.
2. Years and other four-digit numbers not cited as sections don't trigger it.
3. Tests for both. Ajay sees the diff.
