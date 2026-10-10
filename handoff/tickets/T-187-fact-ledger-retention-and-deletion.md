# T-187 — Retention and deletion rule for the Fact Ledger and `intake_extract` rows

| Field          | Value                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                                 |
| Owner          | Arjun (deletion mechanism and design) and Ajay (the rule, DPDP sign-off). Vishal builds once the rule is written here                  |
| Mode           | Rule first (Arjun + Ajay), then a small build (developer + reviewer + tester)                                                          |
| Status         | To do. Gates `feature.fact_ledger` for real users                                                                                      |
| Size           | M: rule S (0.5 day, Arjun + Ajay), build M (1 day, Vishal)                                                                             |
| Depends on     | T-147b (adds the `FactLedger` model and the `intake_extract` purpose)                                                                   |
| Blocks         | Switching `feature.fact_ledger` on for any real user                                                                                   |
| Branch         | feature/t-187-fact-ledger-retention (build part only)                                                                                  |
| Legal sign-off | Needed. Ajay signs the rule in this file before any build starts                                                                       |
| Created        | 2026-10-10                                                                                                                             |
| Source         | Ajay's DPDP condition on T-147b, raised 10 Oct 2026                                                                                    |

## Goal

Before any real user's facts go into a Fact Ledger, a written rule says how long the ledger and its `intake_extract` call rows are kept and when they are deleted, and the code follows it.

## Context

- Ajay's condition, 10 Oct 2026: a retention and deletion rule for the Fact Ledger and the `LlmAuxCall` `intake_extract` rows before `feature.fact_ledger` goes on for real users.
- What T-147b builds (on its branch, not yet merged on 10 Oct):
  - `FactLedger` keeps every version of the advocate's facts. An earlier version is never changed. Each fact holds its `raw_span`: the advocate's own words, which name the client, the accused, places and amounts. This is personal data under the DPDP Act 2023.
  - `LlmAuxCall` gets a new purpose, `intake_extract`. These rows hold numbers and ids only, but each one links to a `userId` and an `intakeId`.
  - The extraction output is cached in Redis with the other intake calls. That cache entry holds the same facts as the ledger.
- Today nothing is ever hard-deleted. Documents are only flagged `isDeleted` (T-302, finding 2). T-115 (permanent delete) still needs a design from Arjun.
- T-302's retention rule covers uploads only, not the ledger.
- Cost work (T-004, T-108) reads `LlmAuxCall` numbers, so the rule must say whether those rows are deleted or only unlinked from the user.

## Acceptance criteria

**Rule (Arjun and Ajay, written in this file)**

1. The rule states, for `FactLedger` (every version) and for `intake_extract` rows: how long each is kept, what deletes it (the user deletes the draft or matter, the user deletes the account, the period runs out), and whether deletion is a hard delete.
2. The rule says what happens to `intake_extract` rows: deleted, or kept with `userId` and `intakeId` removed so only cost numbers stay.
3. The rule covers the Redis cache entry for `intake_extract`: it expires no later than the ledger.
4. The rule says how `runType: "fixture"` ledgers are treated (test data, not personal data).
5. Ajay signs the rule against the DPDP Act 2023 and the DPDP Rules 2025, with the sections relied on.
6. Arjun names the mechanism (for example a TTL index, a scheduled job, or a delete that cascades from the draft and account). The choice is Arjun's.

**Build (Vishal, after 1 to 6)**

7. Deleting a draft, matter or account hard-deletes its `FactLedger` with all versions. A test proves no version is left.
8. When the period runs out, the ledger is gone and the `intake_extract` rows are deleted or unlinked, as the rule says. A test proves it.
9. The Redis `intake_extract` cache entry has a TTL no longer than the rule allows. A test reads the TTL.
10. No ledger content (`raw_span`, `value`, `display`) appears in log lines, Sentry events or error responses. A test or a grep over the log calls shows this.
11. If the rule needs a change to the privacy policy, it is raised as its own ticket (Madhuri writes, Ajay signs). It is not built here.

**Gate**

12. `feature.fact_ledger` stays off for every real user until 1 to 10 are done. Arjun confirms this in this file before the flag goes on.

## In scope

- The written rule in this file
- `apps/drafting/src/models/FactLedger.model.ts` and `LlmAuxCall.model.ts` (retention fields, indexes)
- The delete paths for drafts, matters and accounts, for the ledger only
- The intake cache TTL for `intake_extract`
- Tests for 7 to 10

## Out of scope

- Permanent delete for every other collection (T-115)
- Uploads (T-302)
- `Generation` rows
- Anthropic's own retention (T-118, Records)
- Privacy policy wording (follow-up ticket if needed)

## References

- ADR-022 (Fact Ledger). Open question 4 there (the fact-diff log in T-147d) is a separate retention item; Ajay owns it in T-147d.
- T-147b, T-302, T-115
