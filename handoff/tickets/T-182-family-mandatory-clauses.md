# T-182 — Prompt builder crashes on `mandatory_clauses` (snake_case) rule files

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal |
| Mode           | Small fix. One service (`apps/drafting`), code only. No JSON or legal-content edits |
| Status         | Merged to develop (PR #80), 9 Oct. Anushka tests on develop. |
| Size           | XS (under half a day) |
| Depends on     | Nothing. Cut from develop (5517aca) |
| Branch         | fix/t-182-family-mandatory-clauses |
| Legal sign-off | Not needed: no legal-content path is edited. If AC 5 shows a golden diff, stop and send it to Ajay |
| Created        | 2026-10-09 |
| Test pass      | One short test pass, about 15 minutes |

## Problem

`apps/drafting/src/services/prompt-assembler.ts` (~L401) reads `config.mandatoryClauses.filter(...)` with no fallback. Document-rule files that only have `mandatory_clauses` (snake_case) leave it `undefined`, so building the prompt throws. Example: `docType: 'divorce_hma'`.

- Snake-only files today: 71 of 81 in `config/document-rules/`, including all 7 family files (`divorce_hma`, `divorce_mutual_consent`, `divorce_sma`, `judicial_separation`, `rcr_petition`, `guardianship_petition`, `maintenance_bnss_144`). The brief's "about 10 others" undercounts: it is 64 others.
- 10 files have both spellings (bail files, `vakalatnama`, `affidavit_*`, `memo_of_parties`, `surrender_application`, `suspension_of_sentence`).
- `rule-pack.service.ts` `readClauses` (~L528) already reads both, camelCase first. The prompt-assembler path does not.

## User

District court advocate drafting a family matter. Today the draft fails outright, before any output, so activation (first draft to PDF) is blocked for every family docType.

## Solution

- In the prompt builder, read clauses from `mandatoryClauses` if it is a non-empty array, else `mandatory_clauses`, else `[]`. Same rule as `rule-pack.service` `readClauses`.
- Rest of the clause handling (the `required` filter, the `verification` / `advocate_details` exclusions, line format) is unchanged.

## Acceptance criteria

1. **Both spellings.** The prompt builder accepts `mandatoryClauses` and `mandatory_clauses`. When both are present, `mandatoryClauses` wins (same rule as `rule-pack.service`). Missing or non-array falls back to `[]`, no throw. Tested with fixtures for camel-only, snake-only, both, and neither.
2. **Family docTypes.** For each of the 7 family docTypes above, building a prompt does not throw, and the prompt contains each required clause's `name` from that file's `mandatory_clauses` (excluding `verification` and `advocate_details`). Tested.
3. **camelCase unchanged.** For a camelCase docType (for example `bail_before_magistrate`), the built prompt is byte-identical to `develop`. Tested.
4. **No JSON changed.** `git diff develop --stat` shows no file under `apps/drafting/src/config/`.
5. **Golden snapshots unchanged.** Run `court-rules-golden` and report pass or fail. If any snapshot changes, stop, do not update it, and send the diff to Ajay. Read `.claude/docs/golden-snapshots.md` first.
6. **Suite green.** Full drafting suite passes, with counts reported. Existing `prompt-assembler` tests pass unedited. `@lawie/shared` is built first.

## Out of scope

- Renaming keys in any JSON (snake to camel, or the reverse).
- The `/generate` route's docType list.
- Clause shapes in the other 64 snake-only files. AC 1's no-throw covers them; whether their prompts read well is a separate ticket if needed.
- Merging the prompt-assembler and rule-pack readers into one.

## Files (expected)

`apps/drafting/src/services/prompt-assembler.ts`, one new test file (`apps/drafting/src/__tests__/t182-*.test.ts`). Anushka's verdict is still required before merge.
