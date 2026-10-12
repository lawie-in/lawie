# T-273 — Server-side blank marker match: case-insensitive

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Lead (build) |
| Mode           | Small fix (drafting) |
| Status         | To do. Unassigned. Raised by Mahak (T-233 developer), 12 Oct 2026 |
| Depends on     | T-233 + T-271 merged (shared `blanks.ts` becomes case-insensitive there) |

`apps/drafting/src/utils/missingAsBlanks.ts:8` matches `{{MISSING: ...}}` case-sensitively. After T-233 the shared blank finder is case-insensitive, so a lower-case `{{missing: x}}` is counted as a blank in the export warning but printed raw in the server PDF. The same marker strings appear in `briefTypes.ts` (web), `fact-verifier.ts` and `brief-drafter.ts` (legal path: check each place; change only if Ajay signs).

## Acceptance criteria

1. `{{missing: x}}` and `{{MISSING: x}}` give the same blank in the server PDF and in the count.
2. Web and server counts stay equal (existing parity test).
3. Any change in `fact-verifier.ts` or `brief-drafter.ts` is listed for Ajay before merge. If only `missingAsBlanks.ts` needs to change, no sign-off is needed (Ajay, T-194 sign-off 5640356).
