# T-129 — Prayer and verification text for packs that have none

| Field      | Value                                                   |
| ---------- | ------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                  |
| Owner      | Ajay. Vishal applies the edits                          |
| Mode       | Legal content, then a small change through the dev lead |
| Status     | Ready                                                   |
| Depends on | None. T-106 works without it, with a weaker guarantee   |
| Branch     | fix/t-129-prayer-and-verification                       |
| Created    | 2026-10-06                                              |

## Goal

Every court document has a prayer and a verification that Ajay wrote, so the Drafter never writes those parts on its own.

## Context

- Found by the T-124 report and written up in T-127, section 9: 37 packs have no prayer template and 43 have no verification template. 20 have no cause title.
- Under ADR-021, section 3.5, the code adds the cause title, the prayer and the verification from the pack. Where a pack has none, the Drafter writes the part. It is written under the pack's clauses, but it is not fixed text that Ajay approved.
- T-128 covers required facts only, so this is not in it.
- Not every pack needs each part. An agreement has no prayer. Ajay decides which packs need which.

## Acceptance criteria

- For each of the 60 court documents, Ajay says for each of the three parts: written, or not needed and why.
- The text is added to the files under `apps/drafting/src/config/document-rules/`.
- `yarn workspace @lawie/drafting report:rule-packs` shows no court document with a part absent that Ajay marked as needed.
- The golden snapshot tests are run. Any change in a snapshot is read and approved by Ajay, never updated automatically.
- Order of work: the documents district-court advocates use most come first. Priya gives the order.

## In scope

- `apps/drafting/src/config/document-rules/` (legal content)

## Out of scope

- Required facts (T-128)
- Mandatory clauses

## References

- Report: `handoff/data/rule-pack-report.md`
- `handoff/design/T-127-one-flow-rules-and-prompts.md`, section 9
- Legal sign-off: Ajay writes the content
