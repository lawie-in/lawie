# T-283 — Remove the describe_first and fact_ledger switches after v1

| Field          | Value |
| -------------- | ----- |
| Phase          | After v1 |
| Owner          | Arjun scopes. Lead (build) |
| Mode           | Cleanup |
| Status         | To do. Not before v1 is stable. Raised by Priya on the founder's question, 12 Oct 2026 |

`feature.describe_first` and `feature.fact_ledger` keep the new describe-first flow and the fact ledger off for real users until the open blockers (T-187, T-188, T-190, T-194) are done. They also work as a kill switch. Once v1 is stable and every user is on the new flow, both switches and the old path are dead weight (two code paths to test, one database edit before any tester can start).

## Acceptance criteria

1. Arjun decides when: after v1 is stable for N days, or when every blocker is done.
2. The two switches and the old (template-first) path are removed, with tests.
3. Before that, for test environments: both default ON on develop through an environment default, so a tester needs no database edit (Arjun to scope).
