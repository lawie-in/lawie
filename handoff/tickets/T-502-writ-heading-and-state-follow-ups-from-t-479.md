# T-502: Writ heading and State follow-ups from T-479

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1 (Priya, 16 Oct 2026); Ajay signs items 2-4 |
| Owner  | Shashank (T-479 owner), after T-489; Ajay signs |
| Mode   | Full chain (legal content path) |

## Source

Shashank's T-479 merge (0cf9d4e4, 16 Oct 2026): follow-ups from the reviewer and Ajay.

## What

1. (Reviewer should-fix) `applyStateFromCourt` (template-engine.service.ts ~2478) blanks a State the advocate typed when it equals a skipped court's listed State (for example "Assam" at the Gauhati High Court). Never wrong, but it drops a given value. Keep the given value.
2. (Ajay) The generic heading prints "HIGH COURT OF Maharashtra AT Mumbai" / "West Bengal AT Kolkata" (the earlier signed format): fix the mixed case to Ajay's signed form.
3. (Ajay) Gauhati and J&K headings print a blank, though each court has its own name (as P&H does now): print the court's own signed name.
4. (Ajay) UT matters filed at a principal seat (Dadra and Nagar Haveli and Daman and Diu at Mumbai, Puducherry at Chennai, Lakshadweep at Ernakulam) with no State given fill the parent State: ask or leave a signed blank instead of filling the parent State.

## Not here

State-of-filing not feeding {state}, and the ledger drafter's writ_civil prompt getting the no-State line instead of the State name, are T-488 (Vishal).

## Acceptance criteria

- Each item has a test; Ajay's refs for 2-4; goldens move only as he signs.
