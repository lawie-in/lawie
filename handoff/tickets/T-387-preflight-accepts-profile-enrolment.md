# T-387 — Pre-filing check accepts the enrolment number from the profile

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay (rule) + Arjun |
| Mode   | Small fix |
| Status | To do. Unassigned. Waiting for Ajay's rule. From Mahak's T-382 developer, 13 Oct 2026 |
| Source | Preflight F4 hard-blocks a vakalatnama whose enrolment field is empty, even when the advocate's profile has an enrolment number that the draft prints (T-311) |

## Acceptance criteria (pending Ajay)

1. If Ajay agrees: F4 passes when the enrolment field is empty but the profile has an enrolment number and the draft prints it. It still blocks when neither exists.
2. Tests for both cases.
