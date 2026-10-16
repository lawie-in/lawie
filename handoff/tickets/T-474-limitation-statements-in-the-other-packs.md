# T-474: Limitation statements in the other 19 packs

| Field  | Value                                                              |
| ------ | ------------------------------------------------------------------ |
| Status | To do. V1 (follows T-472). Priya, 16 Oct 2026                       |
| Owner  | Mahak after T-472 (same code), Ajay (text and gate)                 |
| Mode   | Full chain (legal content)                                          |

## Source

Ajay, 16 Oct 2026, T-245 file 3d906a1b: after the revision-petition fix (T-472), up to 19 packs may carry the same fault: a yes/no field or model sentence that says the filing is within limitation.

## What

Use the code-computed limitation check from T-472 in every pack that states limitation. Explore lists the packs and the exact lines; Ajay writes the text per pack.

## Acceptance criteria

- No pack lets the model or a yes/no field assert "within limitation" or "no condonation needed".
- Late filing prints the signed delay paragraph; unknown dates print a blank.
- Tests per pack group; Ajay's ref in the merge body.

## Arjun's design note after T-472 (16 Oct 2026)

Four review rounds on one regex family (T-472: sentence cues that strip the model's own "within limitation" claims) mean the design is wrong. Do not extend it to the other packs with more patterns. Replace the sentence regex with a structured "limitation" part that the renderer emits (computed in code, printed as its own part of the draft), so the model's text is never post-edited. T-472 round 4 ships the two last fixes only. Known leftover (edge 3): the form path renumbers each AI section separately (ai.service.ts ~1101-1116); a gap appears only if a pack has more than one numbered AI section; criminal_revision has one body.
