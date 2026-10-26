# T-597: invoice 24 h alert — starvation and one vacuous test (follow-up to T-595)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (follow-up; fine at v1 volume) |
| Owner  | Arjun (design), Shashank (build) |
| Mode   | Small fix (billing only, same files as T-595) |
| Status | To do. Raised from Shashank's T-595 second review, 26 Oct 2026. After T-595 merges. Priya |
| Source | Shashank's T-595 report |

## Acceptance criteria
1. Starvation: the overdue query always takes the oldest 200 rows. If 200+ permanently stuck rows build up (for example a credit note whose original was dropped), a newly overdue invoice never alerts. Query excluding already-alerted ids and prune from an id-only check. Test with 200+ stuck rows and one new overdue invoice.
2. The test "failed check leaves dedupe alone" would still pass if the catch cleared the Set. Make it fail in that case.

## Files
apps/billing/src/services/invoice-sweep.service.ts and the T-595 tests. Nothing else.
