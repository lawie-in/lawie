# T-199 — `bail_regular` asks `sole_earning_member`, so "sole breadwinner" can unlock

| Field          | Value                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                      |
| Owner          | Ajay (question text, signs). Lead applies. Anushka (verdict)                                                                |
| Mode           | Legal content, then a small change through the lead                                                                         |
| Status         | To do. Waits for Ajay's question text. Runs with or straight after T-190 (same file)                                        |
| Size           | Ajay XS. Build S (0.5 day); XS if folded into T-190                                                                         |
| Depends on     | T-147c (the unlock key exists)                                                                                              |
| Gate           | Ajay rates it high. Same gate as T-190: before `feature.fact_ledger` for real users                                         |
| Branch         | fix/t-199-bail-sole-earning-member                                                                                          |
| Legal sign-off | Needed. `apps/drafting/src/config/document-rules/bail_regular.json` and `_averments/bail_regular.json`                      |
| Created        | 2026-10-11                                                                                                                  |
| Source         | Finding from the T-147 build, 11 Oct 2026. Ajay: high                                                                       |

## Problem

`_averments/bail_regular.json` bans `sole_breadwinner` unless the ledger has `sole_earning_member` equal to yes. `bail_regular.json` has no item with that key and T-190's 13 groups do not include it. So the averment can never unlock, even when the advocate says his client is the only earning member. It is one of the most common bail grounds in district courts.

## User

Advocate filing regular bail for a daily-wage client whose family depends on him alone.

## Solution

Add `sole_earning_member` as an item in `bail_regular` with Ajay's question, so it can be read from the description or asked.

## Acceptance criteria

1. Ajay writes the label, the question and its place in the T-190 order, and signs it here.
2. The item exists in `bail_regular.json` with key `sole_earning_member`. Bail-family packs that inherit it are listed in the report.
3. Test: description says "ghar ka akela kamane wala" → ledger fact with a verbatim span → `sole_breadwinner` allowed.
4. Test: not given → averment stays banned and no phrase from its list appears.
5. The `_averments` file's hash is not changed (no edit there). If an edit is needed, stop: it invalidates Ajay's sign-off.
6. Golden snapshots run; any change approved by Ajay.
7. CI green on drafting.

## Out of scope

- The other unlock keys (T-190)
- Choice-type handling of yes/no (T-189)

## References

- T-147c, T-190, T-189
