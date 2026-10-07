# T-128 — Fill the gaps in the rule packs

| Field      | Value                                                   |
| ---------- | ------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                  |
| Owner      | Ajay, with Priya. Vishal applies the edits              |
| Mode       | Legal content, then a small change through the dev lead |
| Status     | Blocked: T-124 (the report)                             |
| Depends on | T-124                                                   |
| Branch     | fix/t-128-rule-pack-gaps                                |
| Created    | 2026-10-05                                              |

## Goal

Every rule pack lists the facts its document needs, so the questions are right for all 92 kinds.

## Context

- ADR-021, section 3.7 and the risks in section 7: the required-facts lists are uneven across packs. Some name a group and no facts in it.
- The report from T-124 says which packs and which groups.
- The rule packs are legal content. Every edit needs Ajay's sign-off.

## Acceptance criteria

- For every gap in the report, Ajay writes the required facts, or says the group is not needed.
- The edits are applied to the files under `apps/drafting/src/config/document-rules/`.
- The report, run again, shows no group without facts.
- The golden snapshot tests are run. Any change in a snapshot is read and approved by Ajay, never updated automatically.
- Order of work: the packs for the documents district-court advocates use most come first. Priya gives the order.

## In scope

- `apps/drafting/src/config/document-rules/` (legal content)

## Out of scope

- Mandatory clauses, cause titles, prayers and verification text. This ticket is about required facts only

## References

- ADR: `docs/adr/ADR-021-one-drafting-flow.md`, sections 3.7 and 7
- Report: `handoff/data/rule-pack-report.md` (written by T-124)
- Legal sign-off: Ajay writes the content
