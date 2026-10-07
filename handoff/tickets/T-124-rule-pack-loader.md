# T-124 — One loader for the rule packs, and a report on their gaps

| Field      | Value                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                     |
| Owner      | Vishal, Arjun reviews                                                      |
| Mode       | Full chain                                                                 |
| Status     | Done. PR #38 merged into `develop` by the founder on 6 Oct 2026, 09:44 IST |
| Depends on | None                                                                       |
| Branch     | feature/t-124-rule-pack-loader                                             |
| Created    | 2026-10-05                                                                 |

## Goal

Any part of the service can ask for a document's rules and get the same shape back for all 92 kinds of document.

## Context

- ADR-021, section 3.7. The 92 files in `apps/drafting/src/config/document-rules/` hold their facts in three shapes: 6 use `form_schema.steps`, 76 use named groups with a `required` list, 10 use a list.
- Key names differ between files, for example `mandatory_clauses` and `mandatoryClauses`, `filing_checklist` and `filingChecklist`.
- Every file has mandatory clauses (median 12, largest 34). 72 have a cause title, 55 a prayer template, 49 a verification template.
- `template-promoter.ts` already reads the three shapes to build forms. This ticket reads them to list required facts. No screen is built from the result.

## Acceptance criteria

- One function returns, for a pack id: the required facts (group, name, required or not), the mandatory clauses, the cause title, prayer and verification templates when present, the drafting instructions, the validation rules, the filing checklist, the relevant acts and the court levels.
- All 92 packs load without an error. A test fails if one does not.
- A report is written to `handoff/data/rule-pack-report.md`. For each pack it gives the number of required facts, the groups that name no facts, and the fixed parts that are absent.
- No file under `document-rules/` is changed in this ticket.
- The current generation path and the golden snapshot tests are untouched.
- Tests cover one pack of each shape.

## In scope

- A new service file in `apps/drafting/src/services/`
- A report script under `apps/drafting/scripts/`

## Out of scope

- Filling the gaps the report shows (T-128, Ajay)
- Any use of the loader by intake or drafting (T-105, T-106)

## References

- ADR: `docs/adr/ADR-021-one-drafting-flow.md`, section 3.7
- Legal sign-off: Not needed. This ticket only reads the rule packs

## Delivery report (Vishal, 6 Oct 2026)

Pull request: https://github.com/lawie-in/lawie/pull/38 (branch `feature/t-124-rule-pack-loader`, one commit, `da850a7`).

**Built**

- `apps/drafting/src/services/rule-pack.service.ts`: `loadRulePack(id)` returns one shape for every pack.
- `apps/drafting/scripts/rule-pack-report.ts`, run with `yarn workspace @lawie/drafting report:rule-packs`.
- `apps/drafting/src/__tests__/rule-pack.service.test.ts`: 146 tests.
- `handoff/data/rule-pack-report.md`: the first report.

**Acceptance criteria**

| Criterion                                                               | Result                       |
| ----------------------------------------------------------------------- | ---------------------------- |
| One function returns the listed parts for a pack id                     | Met                          |
| All 92 packs load without an error, and a test fails if one does not    | Met                          |
| Report written with required facts, empty groups and absent fixed parts | Met                          |
| No file under `document-rules/` changed                                 | Met. `git status` shows none |
| Generation path and golden snapshots untouched                          | Met. 91 snapshots pass       |
| Tests cover one pack of each shape                                      | Met                          |

**Different from the ticket**

- The packs use five shapes for their facts, not three: steps (6), a list (10), `{ fields: [] }` (50), JSON Schema (10) and named groups (16).
- No group names no facts. The closest gap: 6 legal notices give only the names of their facts, with no label and no type.
- 13 top-level keys are not returned by the loader, for example `key_citations` and `disclaimer` (38 packs each). They are not in this ticket's list. The report names them. Arjun decides whether T-106 needs any.

**Run**

- Type check and lint: clean.
- The new test file: 146 passed.
- Whole drafting suite in the chat session's workspace: 14 suites passed, 2,613 tests.

**Not run**

- 27 drafting suites that need an in-memory MongoDB. That workspace cannot download it. The same 27 fail there on `develop` before this change. CI on PR #38 is the full run, and its drafting job passed on 6 Oct 2026.
- No model call, no database, no browser check. This ticket needs none.
