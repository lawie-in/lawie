# T-558: Live-subscription guard follow-ups (from T-536)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Small fix (billing) |
| Status | Merged with T-542 into develop_staging e74af926 (CI 925 green), 22 Oct 2026. Follow-ups: T-560. Priya
| Source | Shashank's T-536 report |

1. In the create retry, if the second insert also fails there is no marker and no local row. Wrap it and write the marker (unlikely race).
2. A live-index refusal on a checkout adopt answers 409 instead of the link. Accepted for now; decide with Arjun whether to return the link.
3. T-536's Files line still lists `Subscription.model.ts`, which is unchanged per Arjun: correct the ticket.

Acceptance: tests for 1 and 2 as decided.

## Arjun (22 Oct 2026)

Items 9 and 10 ruled in T-542's Arjun section of the same date: 9 approve both (marker + rethrow at both insert sites); 10 (b) re-run `runLocalChecks()` when the conflicting row is a checkout.
