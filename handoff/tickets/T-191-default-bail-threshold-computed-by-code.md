# T-191 — Code computes the default-bail threshold

| Field          | Value                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Phase          | 1 — Describe and draft                                                                                                   |
| Owner          | Vishal (build). Ajay signs the logic. Anushka (verdict)                                                                  |
| Mode           | Build, full chain. Merge to develop                                                                                      |
| Status         | To do                                                                                                                    |
| Size           | M (1 day), plus Ajay's sign-off time                                                                                     |
| Depends on     | T-147c (the banned entry and its unlock key)                                                                             |
| Gate           | Before `default_bail.statutory_period_expired` may unlock for any user. Until then it stays banned, which is fail-safe   |
| Branch         | feature/t-191-default-bail-threshold                                                                                     |
| Legal sign-off | Needed. Ajay signs the computation logic and the text the advocate sees                                                  |
| Created        | 2026-10-10                                                                                                               |
| Source         | Vishal and Ajay, T-147c follow-up, 10 Oct 2026                                                                           |

## Problem

`default_bail.statutory_period_expired` is banned under T-147c. The model must never decide whether the statutory period has run out. Without a computed fact, a default bail draft can never make its central averment.

## User

District court advocate filing for default bail who needs the period checked correctly and shown to him.

## Solution

Code computes the threshold under BNSS s.187(3):

- 90 days if the offence is punishable with death, life imprisonment or imprisonment of 10 years or more
- 60 days otherwise

The advocate sees the computation and its inputs. The result becomes the fact that unlocks the averment.

## Acceptance criteria

1. Ajay signs the logic in this file before the build starts: the inputs, the 60/90 rule, how the days are counted, and what happens when an input is missing.
2. The inputs are ledger facts: the date custody began, the maximum punishment for each section charged, and whether a chargesheet was filed and when. No input comes from the model.
3. Code computes the period and the expiry date. The model never computes or states them.
4. The brief shows the inputs, the period chosen (60 or 90) with the reason, the expiry date and the result.
5. `statutory_period_expired` unlocks only when the code result is "expired" and no chargesheet was filed before expiry.
6. **"Filed but defective" and "Filed after expiry" stay banned** (Ritu Chhabaria; M. Ravindran). The code does not unlock them in any case.
7. A missing input leaves the averment banned and prints `[To be confirmed: label]` for that input.
8. Tests: 60-day and 90-day cases, one day before and on the day of expiry, a chargesheet filed before expiry, and each missing input.
9. Golden snapshots unchanged; if one moves, stop and report. CI green on all four services.

## Out of scope

- The averments for "Filed but defective" and "Filed after expiry"
- Section lookup beyond what the ledger and the existing sections data hold

## References

- T-147c, ADR-022, BNSS s.187(3)
