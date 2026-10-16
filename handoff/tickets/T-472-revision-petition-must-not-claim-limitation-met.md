# T-472: A revision petition must not say it is within limitation when it is not

| Field  | Value                                                                 |
| ------ | --------------------------------------------------------------------- |
| Status | To do. V1 BLOCKER (Anushka run 4 FAIL, 16 Oct 2026). Priya            |
| Owner  | Mahak (writ and criminal packs), Ajay (text and gate)                 |
| Mode   | Full chain (legal content; Ajay byte-checks)                          |

## Source

Anushka, quality run 4 on develop, 16 Oct 2026: the revision petition tells the court that a petition filed 131 days after the order is within the 90-day limit and that no condonation is needed.

## What

When the filing date is after the limitation period, the draft must not state that it is within limitation or that no condonation is needed. It should leave a placeholder or carry a condonation paragraph, as Ajay rules. Check the other limitation statements in the same pack for the same fault.

## Rules

Ajay writes the exact text. Explore first (where the limitation sentence comes from: pack text, a prompt line, or the model). Ask Priya for the claim after Explore.

## Acceptance criteria

- 131 days after the order: no "within limitation" or "no condonation needed" in the draft.
- Within the period: unchanged.
- Tests for both; Ajay's ref in the merge body.
