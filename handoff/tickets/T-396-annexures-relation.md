# T-396 — Memo of parties and affidavit follow the relation rule

| Field  | Value                                                                               |
| ------ | ----------------------------------------------------------------------------------- |
| Phase  | 4 — Polish and release                                                              |
| Owner  | Lead (drafting) + Ajay                                                              |
| Mode   | Small fix (legal content; moves goldens)                                            |
| Status | To do. Kunal, after T-395. Found in T-393's review, 13 Oct 2026                     |
| Source | Ajay's T-359 AC6 addendum, point 1 (it names the memo of parties and the affidavit) |

## Problem

- `annexures.service.ts:249`, the memo of parties, prints "S/o / D/o / W/o: {father_name}". It has no H/o and ignores the relation answer added in T-393.
- `annexures.service.ts` ~:518, the affidavit, prints the name with no relation.

## Acceptance criteria

1. Both use the relation as given (S/o, D/o, W/o, H/o). Otherwise they print Ajay's blank, the same rule as T-393.
2. The golden snapshots that move (about 13 hits) go to Ajay, who signs before the merge (`.claude/docs/golden-snapshots.md`).
3. Tests for a woman applicant, with and without a relation answer.

## Also (T-381 reviewer, 13 Oct)

Form drafts store the court-picker State id ("bihar"), so the Memo prints "State of bihar". Map the id to its display name in the annexures path, together with Ajay's State-line change.
