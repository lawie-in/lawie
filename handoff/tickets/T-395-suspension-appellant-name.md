# T-395 — Suspension of sentence: the verification prints the appellant's name

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay |
| Mode   | Small fix (legal content) |
| Status | To do. Kunal, right after T-393 (same template-engine area). Found by Kunal in T-393, 13 Oct 2026 |
| Source | T-393 |

## Problem

The suspension_of_sentence verification prints "I, _____,". `{appellant}` has no alias in the template engine, so the appellant's name never reaches the verification. This was there before T-393.

## Acceptance criteria

1. The verification prints the appellant's name as given in the form.
2. If no name is given, it stays a blank, as today.
3. A test pins 1 and 2. Check the other packs for the same missing-alias pattern and list any found.
4. Ajay checks the verification text.
