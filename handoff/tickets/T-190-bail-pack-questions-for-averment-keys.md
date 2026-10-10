# T-190 — Bail packs ask for the facts that unlock their averments

| Field          | Value                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                        |
| Owner          | Ajay (question text and order, signs). Vishal applies. Anushka (verdict)                                                      |
| Mode           | Legal content, then a small change through the dev lead                                                                       |
| Status         | To do                                                                                                                         |
| Size           | Ajay S (0.5 day for the question text). Vishal S (0.5 day to apply and test)                                                  |
| Depends on     | T-147c (the unlock keys exist). T-189 for any question that is a list or choice                                               |
| Gate           | Proposed (Priya): before `feature.fact_ledger` goes on for real users. Without it, a ledger bail draft omits most averments an advocate would expect. Arjun to confirm |
| Branch         | feature/t-190-bail-pack-unlock-questions                                                                                      |
| Legal sign-off | Needed. Legal content: `apps/drafting/src/config/document-rules/` (see `.claude/docs/legal-content-paths.md`)                 |
| Created        | 2026-10-10                                                                                                                    |
| Source         | Vishal and Ajay, T-147c follow-up, 10 Oct 2026                                                                                |

## Problem

T-147c allows an averment only when its unlock key is a ledger fact. `bail_regular` never asks for most of those keys, so most allowed averments can never unlock. They stay banned, and the draft is weaker than what the advocate would write by hand.

## User

District court advocate filing a bail application who has these facts and expects them in the draft.

## Solution

Add questions for the unlock keys to `bail_regular`, in Ajay's order. The bail-family packs that inherit from it follow the same order.

| #  | Key                                                    | Note                                                              |
| -- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| 1  | `earlier_bail_applications`                            | Suppression risk; Kusha Duruka v. State of Odisha (SC, 2024)      |
| 2  | `antecedents`                                          |                                                                   |
| 3  | `arrest_date`                                          |                                                                   |
| 4  | `investigation_status`                                 |                                                                   |
| 5  | `applicant_sex`                                        |                                                                   |
| 6  | `medical_condition`                                    |                                                                   |
| 7  | `named_in_fir`                                         |                                                                   |
| 8  | `recovery_status`                                      |                                                                   |
| 9  | `cooperated_with_investigation`                        |                                                                   |
| 10 | `applicant_occupation`                                 |                                                                   |
| 11 | `local_ties`                                           |                                                                   |
| 12 | `s35_notice_status`                                    |                                                                   |
| 13 | the `co_accused_bail_*` keys and `co_accused_role_comparison` |                                                            |

## Acceptance criteria

1. Ajay writes the question text for each key and signs it in this file.
2. `bail_regular` asks the 13 groups above in that order.
3. Each bail-family pack that inherits from `bail_regular` asks them in the same order. Vishal lists those packs in the report.
4. Each answer becomes a ledger fact with `source: "asked"` and a `raw_span` from the answer (T-147b AC2 and AC3).
5. Test: with each key answered, the averment it unlocks is allowed and uses the ledger `display` value (T-147c AC4).
6. Test: with a key unanswered, its averment stays banned and does not appear in any phrasing.
7. The 10-question cap still applies. Items past it follow T-188.
8. `earlier_bail_applications` is never skipped when the cap is reached, because of the suppression risk. Ajay confirms how this sits with the cap.
9. Golden snapshots are run. Any change is read and approved by Ajay, never updated automatically.

## Out of scope

- Allowed texts for entries that have none (T-195)
- Default-bail and s.138 computed facts (T-191, T-192)
- Packs outside the bail family

## References

- T-147b, T-147c, T-188, T-189, ADR-022
