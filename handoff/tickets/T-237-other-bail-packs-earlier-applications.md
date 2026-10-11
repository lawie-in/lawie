# T-237 — Other bail packs must disclose earlier bail applications

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (pack change, signs). Lead (build). Anushka (verdict) |
| Mode           | Rule first (Ajay), then build, full chain. Legal content |
| Status         | To do. Waits for Ajay's pack text. Raised by Ajay, 12 Oct 2026, during T-200 |
| Gate           | Before `feature.fact_ledger` for real users and before v1 go-live |
| Depends on     | T-200 (cue map) |

## Problem

- `bail_anticipatory`, `interim_bail` and `bail_before_magistrate` have no `earlier_applications` clause, so their drafts don't have to disclose earlier bail applications. This is the gap T-200 was raised for on `bail_regular`.
- In `interim_bail` and `bail_anticipatory`, the `no_flight_risk` descriptions ask for an "assertion" of fact (social roots, cooperation). That conflicts with T-136's rule that this clause is "Never a statement of fact".

## Acceptance criteria

1. Ajay writes and signs the `earlier_applications` clause for each of the three packs, plus its entry in the T-200 cue map.
2. Ajay rewrites the two `no_flight_risk` descriptions to follow T-136, and signs them.
3. The lead applies Ajay's signed diff only; no other wording.
4. Tests: a draft in each pack without disclosure of earlier applications → the clause is reported missing.
5. Golden snapshots: any snapshot that moves is listed for Ajay; CI green on drafting.
