# T-112 — ADR-020 for the move from Ink units to drops

| Field      | Value                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| Phase      | 2 — Drops pricing                                                                      |
| Owner      | Arjun, with Vikram                                                                     |
| Mode       | Architecture decision, not through the dev lead                                        |
| Status     | Done. ADR-020 approved by the founder on 4 Oct 2026, simplified: no maintenance window |
| Depends on | None                                                                                   |
| Branch     | None                                                                                   |
| Created    | 2026-10-04                                                                             |

## Goal

One written decision on how live balances move to drops, so T-201 can start.

## Context

- ADR-019 does not cover the balance migration. T-201 needs its own ADR and had no ticket for it until now.
- It is a one-way change to live balances. The 2-per-Ink conversion is repeated in four apps: auth, billing, drafting and web.
- Stack notes say production is on MongoDB Atlas M0. Whether it has any automatic backup is not confirmed.
- The founder has not yet decided what happens to the older credit buckets and the signup, login and rating bonuses. Vikram recommends leaving them out of the migration.

## Acceptance criteria

- The ADR says exactly which fields are multiplied and by how much, and what is left alone.
- It gives the order of steps: backup, dry run, migration, check, switch the code over.
- It says how a half-finished or wrong migration is undone.
- It says how the code and the data stay in step during the deploy, so no user sees a balance 50 times too high or too low.
- It records the founder's decision on the older credit buckets and bonuses.
- It is saved at `docs/adr/ADR-020-drops-migration.md` and linked from T-201.

## In scope

- The decision document only

## Out of scope

- Writing code
- Changing prices

## References

- Design: Not needed
- ADR: `docs/adr/ADR-020-drops-migration.md` (Arjun, 4 Oct 2026). Draft
- Legal sign-off: Not needed

## Result (Arjun, with Vikram, 4 Oct 2026)

Delivered: `docs/adr/ADR-020-drops-migration.md`, with two diagrams. **Status: draft. It waits for the founder's decision on D1 to D4.**

- Drops go into new fields. The old Ink fields are left untouched as the way back.
- The switch is one short maintenance window: stop services, dump the database, dry run, migrate, check, deploy, smoke test.
- Nothing a user pays changes. A 1 Ink draft becomes a 100 drop draft.
- The balance API keeps its Ink fields and adds drops, so the web app does not change until T-203.
- Finding: production is on Atlas M0, which has no backups. The manual dump is the only one.
- Finding: the login and rating bonuses go into a bucket that the live spending path never draws from, while the low-balance dialog promises "bonus Ink". Decision D3 covers it.

## Founder decision, 4 Oct 2026

"Just move it." No customers, so no maintenance window, dump or rollback steps. D1, D3 and D4 stand. D2 is dropped. The note is at the top of `docs/adr/ADR-020-drops-migration.md`. T-201 is unblocked.
