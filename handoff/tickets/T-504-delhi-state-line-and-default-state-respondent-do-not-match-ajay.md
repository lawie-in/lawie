# T-504: The Delhi State line and the default state respondent do not match Ajay's State ruling

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1 (Priya, 16 Oct 2026); Ajay signs; goldens move only as he signs |
| Owner  | Vishal (State work in T-488), after T-488 merges |
| Mode   | Full chain (legal content path) |

## Source

Vishal, T-488 Explore (16 Oct 2026). Ajay's ruling ca12ec2e: a State prints "State of {state}"; Delhi prints "State (Govt. of NCT of Delhi)", never "State of Delhi"; other Union Territories print a blank until Ajay verifies.

## What

In template-engine.service.ts the `stateLine` / DELHI_STATE_LINE constant reads 'State (NCT of Delhi)' and the default `state_respondent` (~:2063) does not follow the ruling. Change both to Ajay's signed forms, check every pack and golden that prints them, and cover the other Union Territories (blank until verified).

## Acceptance criteria

- Delhi prints "State (Govt. of NCT of Delhi)" everywhere; the default state_respondent follows "State of {state}"; UTs other than Delhi print a signed blank.
- A scan test over all packs' rendered party lines; goldens that move are shown to Ajay.
