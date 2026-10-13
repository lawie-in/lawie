# T-392 — An empty enrolment blank shouldn't block the profile number

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay |
| Mode   | Small fix |
| Status | To do. Waiting for Ajay's ruling. Then Vishal (brief-drafter.ts and the T-373 Drafter side), after T-373 or folded into it if Arjun agrees. Found by Mahak in the T-365 review, 13 Oct 2026 |
| Source | T-365 round 1 should-fix |

## Problem

On the brief path, an empty or unconfirmed `advocate_enrollment` item still gets its "[To be confirmed]" placeholder. T-311 counts the placeholder as typed, so the profile's enrolment number never prints next to the profile name.

## Question for Ajay

Does his T-311 AC1 rule ("a value the advocate typed wins; otherwise the profile's") apply to the enrolment blank, so that a placeholder never counts as typed?

## Acceptance criteria (if Ajay says yes)

1. A placeholder or unconfirmed enrolment item doesn't count as typed. The profile number prints.
2. A number the advocate actually typed still wins.
3. Tests on the brief path and the D1 Drafter path.
