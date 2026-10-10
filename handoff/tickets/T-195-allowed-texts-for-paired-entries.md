# T-195 — Allowed texts for banned entries that have no allowed partner

| Field          | Value                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                        |
| Owner          | Ajay (decides each entry, writes and signs any text). Vishal applies. Anushka (verdict)       |
| Mode           | Legal content, then a small change through the dev lead                                       |
| Status         | Backlog. Low priority                                                                         |
| Size           | Ajay M (about 1 day across all packs). Vishal S (0.5 day to apply)                            |
| Depends on     | T-147c                                                                                        |
| Gate           | None. Banned entries stay banned until this is done, which is fail-safe                       |
| Branch         | feature/t-195-allowed-texts-for-paired-entries                                                |
| Legal sign-off | Needed. Legal content under `apps/drafting/src/config/document-rules/`                        |
| Created        | 2026-10-10                                                                                    |
| Source         | Vishal and Ajay, T-147c follow-up, 10 Oct 2026                                                |

## Problem

These entries are banned with no allowed partner, so they can never unlock, even when the backing fact is in the ledger.

## User

District court advocate who gave the fact and expects the averment.

## Entries

| Pack                   | Entries                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bail_regular`         | `investigation_complete`, `parity_same_role`                                                                                                                                                              |
| `_default`             | The 12 now nulled: `within_limitation`, `good_character`, `no_criminal_antecedents`, `gainfully_employed`, `sole_breadwinner`, `notice_served`, `loss_and_damage`, `possession_since`, `false_implication_motive`, `medical_condition`, `demands_made`, `relationship` |
| `default_bail`         | The nulled entries (Vishal lists them from T-147c)                                                                                                                                                        |
| `legal_notice_s138`    | The nulled entries (Vishal lists them from T-147c)                                                                                                                                                        |
| `maintenance_bnss_144` | The nulled entries (Vishal lists them from T-147c)                                                                                                                                                        |

## Acceptance criteria

1. Vishal writes the full list of nulled entries for `default_bail`, `legal_notice_s138` and `maintenance_bnss_144` into the table above.
2. For each entry, Ajay writes either an allowed text, or "stays banned" and why.
3. Each allowed text names the ledger `label` that unlocks it.
4. Test: for each new allowed text, it appears only when its unlocking fact is in the ledger (T-147c AC3 and AC4).
5. Golden snapshots are run. Any change is read and approved by Ajay, never updated automatically.

## Out of scope

- New questions (T-190)
- Computed facts (T-191, T-192)
- Packs not named above

## References

- T-147c, ADR-022
