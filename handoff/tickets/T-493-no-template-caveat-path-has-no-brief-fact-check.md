# T-493: The caveat (no rule pack) path has no "brief fact missing from the draft" check

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1 (Priya, 16 Oct 2026), from T-483 Explore |
| Owner  | Lead who is free |
| Mode   | Full chain |

## Source

Vishal, T-483 Explore (16 Oct 2026): on the caveat / no-rule-pack path nothing checks that a fact given in the brief appears in the draft. The D1 path has such checks; this path has none.

## What

Add a check on the caveat path that flags a brief fact missing from the draft, like the D1 check, with Ajay's wording for the finding. Check with T-484 (the s.148A "not available yet" caveat) so the two do not overlap.

## Acceptance criteria

- A caveat-path draft that drops a brief fact is flagged in the checks panel.
- No false finding on a draft that carries all the facts; tests; Ajay signs the finding text.
