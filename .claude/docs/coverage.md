# Coverage thresholds

Base Jest config sets 70/70/70/70 (lines/branches/etc.), but every service overrides it:

| Service    | Lines | Branches |
| ---------- | ----- | -------- |
| `billing`  | 70    | 65       |
| `gateway`  | 70    | 15       |
| `auth`     | 35    | 5        |
| `drafting` | 35    | 5        |

A green run in `auth` or `drafting` proves very little about coverage — the branch threshold is low enough that large swaths of conditional logic can go untested and the suite still passes. Don't read "tests pass" as "well covered" for those two services. `tester` agents: a green run satisfies the gate for the `reviewer`, but if you know a change added branching logic in `auth`/`drafting` with no corresponding test, say so in the report's "criteria with no test" field even if the suite is green.
