# T-414: own-words check marks dates by position

| Field | Value |
|---|---|
| Status | Todo. Vishal, after T-392. Priya, 13 Oct 2026 |
| Owner | Vishal |
| Mode | Small fix (drafting only) |

## Why
These are two should-fixes from T-373's delta reviewer. Neither blocks T-373, because both only cause false fallbacks, which is the safe direction.

## Acceptance criteria
1. contentWordSequence marks dates by match position, not by substring split. "2 March 2025" no longer cuts into "12 March 2025", and a second written form of the same date is marked too.
2. A test covers both of those cases.
3. The t373 test that claims a regrouped amount is tested end to end is renamed to say what it actually tests.

## Gate
The own-words check is under Ajay's T-373 conditions. Ajay gets a heads-up on the diff, and signs it if any output text changes.
