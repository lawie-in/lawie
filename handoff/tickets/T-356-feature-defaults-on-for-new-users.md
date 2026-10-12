# T-356 — New users get describe-first (and the fact ledger) by default

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Founder (decided, 12 Oct 2026). Arjun (how). Lead (drafting) |
| Mode   | Small fix |
| Status | To do. RELEASE GATE. Part 1 (describe-first default on): shashank after T-346. Part 2 after T-187 + T-188 (Ajay signed both rules, 33af21e; vishal builds) |

Founder, 12 Oct 2026: "by default these should happen for new users." Today both switches are off unless the admin setting lists a user id or says `on`. The env fallback (`FEATURE_DEFAULT_*`, T-283) defaults to `off` and is ignored once an admin setting exists.

## Acceptance criteria

1. Part 1: `feature.describe_first` is on for every user, new and existing, in code. Default on, with no per-environment step needed. An explicit admin `off` still turns it off (kill switch).
2. Part 2: `feature.fact_ledger` gets the same default once T-187 (retention and deletion, DPDP) and T-188 (unresolved items past the question cap) are merged. Those two tickets are the only gates left; T-190, T-194, T-336, T-338 and T-341 are merged.
3. An admin setting holding a list of user ids no longer silently switches everyone else off. Arjun picks the rule (for example, the list means "also these", or the list form is retired).
4. Tests: a new user with no admin setting gets the switch on; an explicit `off` wins; part 2's ledger default stays off until its gate.
